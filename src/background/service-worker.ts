import type { ChromeMessage, ChromeResponse } from '../shared/messaging';
import type {
  OptimizationSession,
  OptimizationResult,
} from '../shared/types';

import type { StartOptimizationPayload, UpdateResultStatusPayload } from '../shared/messaging';
import { broadcastToSidePanel, sendToContentScript } from '../shared/messaging';
import { getSession, saveSession, clearSession, getSettings, saveSettings, saveCachedProfile, getCachedProfile } from '../shared/storage';
import { getAvailableProvider } from '../ai/index';
import { structureResumeText } from '../parsers/resume-parser';
import { runGapAnalysis } from '../optimizer/gap-analysis';
import { runOptimizationPipeline } from '../optimizer/pipeline';

// ─── Extension Install / Click handler ───────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ChromeResponse) => void
  ) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async
  }
);

async function handleMessage(
  message: ChromeMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ChromeResponse) => void
): Promise<void> {
  try {
    switch (message.action) {
      // ── From side panel ──────────────────────────────────────────────────
      case 'START_OPTIMIZATION': {
        const payload = message.payload as StartOptimizationPayload;
        sendResponse({ success: true });
        // Run async — don't await in message handler
        runPipeline(payload).catch((err) => {
          console.error('[SW] Pipeline error:', err);
        });
        break;
      }

      case 'APPLY_CHANGE': {
        const { result } = message.payload as { result: OptimizationResult };
        const tab = await getActiveLinkedInTab();
        if (!tab?.id) {
          sendResponse({ success: false, error: 'No active LinkedIn tab found. Please navigate to your LinkedIn profile.' });
          return;
        }
        try {
          const res = await sendToContentScript(tab.id, {
            action: 'APPLY_DOM_CHANGE',
            payload: result,
          });
          sendResponse(res);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }

      case 'GET_SESSION': {
        const session = await getSession();
        sendResponse({ success: true, data: session });
        break;
      }

      case 'UPDATE_RESULT_STATUS': {
        const payload = message.payload as UpdateResultStatusPayload;
        const session = await getSession();
        if (!session) { sendResponse({ success: false, error: 'No session' }); return; }

        const idx = session.results.findIndex(
          (r) => r.section === payload.section && r.sectionId === payload.sectionId
        );
        if (idx >= 0) {
          session.results[idx].status = payload.status;
          if (payload.editedContent) {
            session.results[idx].editedContent = payload.editedContent;
          }
        }

        await saveSession(session);
        broadcastToSidePanel({ action: 'SESSION_UPDATE', payload: session });
        sendResponse({ success: true });
        break;
      }

      case 'COMPLETE_REVIEW': {
        const session = await getSession();
        if (session) {
          session.status = 'complete';
          await saveSession(session);
        }
        sendResponse({ success: true });
        break;
      }

      case 'RESET_SESSION': {
        await clearSession();
        sendResponse({ success: true });
        break;
      }

      case 'GET_SETTINGS': {
        const settings = await getSettings();
        sendResponse({ success: true, data: settings });
        break;
      }

      case 'SAVE_SETTINGS': {
        await saveSettings(message.payload as Record<string, unknown>);
        sendResponse({ success: true });
        break;
      }

      // ── From content script ──────────────────────────────────────────────
      case 'CONTENT_READY': {
        sendResponse({ success: true });
        break;
      }

      case 'PROFILE_SCRAPED': {
        // Content script proactively sending scraped data (handled in pipeline)
        sendResponse({ success: true });
        break;
      }

      case 'CHANGE_APPLIED':
      case 'CHANGE_FAILED': {
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[SW] Error handling message:', message.action, error);
    sendResponse({ success: false, error });
  }
}

// ─── Pipeline Orchestration ───────────────────────────────────────────────────

async function runPipeline(payload: StartOptimizationPayload): Promise<void> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  let session: OptimizationSession = {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    mode: payload.mode,
    targetRole: payload.targetRole,
    jobDescription: payload.jobDescription,
    results: [],
    appliedSections: [],
    status: 'parsing',
  };

  const broadcast = (partial: Partial<OptimizationSession>) => {
    session = { ...session, ...partial, updatedAt: Date.now() };
    saveSession(session).catch(() => {});
    broadcastToSidePanel({ action: 'SESSION_UPDATE', payload: session });
  };

  const sendStep = (id: string, label: string, status: 'running' | 'done' | 'error', detail?: string) => {
    broadcastToSidePanel({
      action: 'PIPELINE_STEP_UPDATE',
      payload: { id, label, status, detail },
    });
  };

  try {
    // ── Step 1: Parse resume ─────────────────────────────────────────────
    broadcast({ status: 'parsing' });
    sendStep('parse', 'Parse resume', 'running', 'Sending to AI for structured extraction...');

    const settings = await getSettings();
    const provider = await getAvailableProvider(settings);

    sendStep('parse', 'Parse resume', 'running', `Using ${provider.name}...`);
    const resumeData = await structureResumeText(payload.resumeText, provider);

    const jobCount = resumeData.workExperience.length;
    const skillCount = resumeData.skills.length;
    sendStep('parse', 'Parse resume', 'done',
      `Found ${jobCount} job${jobCount !== 1 ? 's' : ''}, ${skillCount} skill${skillCount !== 1 ? 's' : ''}`);
    broadcast({ resumeData });

    // ── Step 2: Scrape LinkedIn profile (use cache if fresh) ─────────────
    broadcast({ status: 'scraping' });

    const cachedProfile = await getCachedProfile();
    if (cachedProfile) {
      const ageMin = Math.round((Date.now() - cachedProfile.scrapedAt) / 60000);
      sendStep('scrape', 'Scrape LinkedIn profile', 'done',
        `Using cached profile (${ageMin}m old) — scrape skipped`);
      broadcast({ profileData: cachedProfile });

      // Skip directly to gap analysis
      broadcast({ status: 'analyzing' });
      sendStep('analyze', 'Gap analysis', 'running', 'Comparing resume vs LinkedIn...');
      const gapAnalysis = runGapAnalysis(resumeData, cachedProfile);
      const missingKw = gapAnalysis.missingKeywords.length;
      const skillGaps = gapAnalysis.skillGaps.length;
      sendStep('analyze', 'Gap analysis', 'done',
        `${missingKw} missing keywords, ${skillGaps} skill gap${skillGaps !== 1 ? 's' : ''}`);
      broadcast({ gapAnalysis });

      broadcast({ status: 'optimizing' });
      sendStep('optimize', 'AI optimization', 'running', 'Starting section optimization...');
      const accumulatedResults: import('../shared/types').OptimizationResult[] = [];
      const results = await runOptimizationPipeline(
        resumeData, cachedProfile, gapAnalysis, provider,
        payload.mode, payload.targetRole, payload.jobDescription,
        (sectionEnum, sectionId, stepStatus, detail) => {
          const sectionLabel = String(sectionEnum);
          const stepId = `optimize-${sectionLabel}-${sectionId ?? ''}`;
          const label = `Optimizing ${sectionLabel}${sectionId ? ` — ${sectionId}` : ''}`;
          sendStep(stepId, label, stepStatus, detail);
          if (stepStatus === 'done') broadcast({ results: accumulatedResults });
        }
      );
      accumulatedResults.push(...results);
      sendStep('optimize', 'AI optimization', 'done',
        `${results.length} section${results.length !== 1 ? 's' : ''} optimized`);
      broadcast({ results, status: 'reviewing' });
      return;
    }

    sendStep('scrape', 'Scrape LinkedIn profile', 'running', 'Looking for active LinkedIn tab...');

    const tab = await getActiveLinkedInTab();
    if (!tab?.id) {
      throw new Error(
        'No LinkedIn tab found. Make sure your LinkedIn profile page (linkedin.com/in/...) is open in Chrome, then try again.'
      );
    }

    const shortUrl = tab.url?.split('?')[0].replace('https://www.linkedin.com', '') ?? '';
    if (!tab.url?.includes('/in/')) {
      throw new Error(
        `Found a LinkedIn tab (${shortUrl}) but it's not a profile page. ` +
        'Please navigate to your own profile (linkedin.com/in/YOUR-USERNAME) and try again.'
      );
    }

    sendStep('scrape', 'Scrape LinkedIn profile', 'running', `Reading ${shortUrl}...`);

    // Retry scrape up to 3 times — content script may not be ready on first load
    const scrapeRes = await retryContentScript<import('../shared/types').CurrentProfileData>(
      tab.id,
      { action: 'SCRAPE_PROFILE' },
      3,
      1500,
      (attempt) => sendStep('scrape', 'Scrape LinkedIn profile', 'running', `Attempt ${attempt}/3 — waiting for content script...`)
    );

    if (!scrapeRes.success || !scrapeRes.data) {
      throw new Error(
        (scrapeRes.error ?? 'Failed to scrape LinkedIn profile') +
        '\n\nTry reloading the LinkedIn profile tab and running again.'
      );
    }

    let profileData = scrapeRes.data;
    await saveCachedProfile(profileData); // cache for next run

    const expCount = profileData.experience.length;
    sendStep('scrape', 'Scrape LinkedIn profile', 'done',
      `${expCount} experience${expCount !== 1 ? 's' : ''}, ${profileData.skills.length} skills on profile`);
    broadcast({ profileData }); // broadcast immediately so UI shows headline/about

    // Step 2b: augment skills from detail page (non-blocking for headline/about)
    const detailSkills = await fetchSkillsFromDetailPage(profileData.profileUrl);
    if (detailSkills.length > 0) {
      const seen = new Set(profileData.skills.map(s => s.toLowerCase()));
      const merged = [...profileData.skills];
      for (const skill of detailSkills) {
        if (!seen.has(skill.toLowerCase())) {
          seen.add(skill.toLowerCase());
          merged.push(skill);
        }
      }
      profileData = { ...profileData, skills: merged };
      await saveCachedProfile(profileData); // update cache with full skills
      console.debug(`[SW] Skills merged: ${merged.length} total`);
    }

    // ── Step 3: Gap Analysis ─────────────────────────────────────────────
    broadcast({ status: 'analyzing' });
    sendStep('analyze', 'Gap analysis', 'running', 'Comparing resume vs LinkedIn...');

    const gapAnalysis = runGapAnalysis(resumeData, profileData);

    const missingKw = gapAnalysis.missingKeywords.length;
    const skillGaps = gapAnalysis.skillGaps.length;
    sendStep('analyze', 'Gap analysis', 'done',
      `${missingKw} missing keywords, ${skillGaps} skill gap${skillGaps !== 1 ? 's' : ''}`);
    broadcast({ gapAnalysis });

    // ── Step 4: Optimize each section ────────────────────────────────────
    broadcast({ status: 'optimizing' });
    sendStep('optimize', 'AI optimization', 'running', 'Starting section optimization...');

    const accumulatedResults: import('../shared/types').OptimizationResult[] = [];

    const results = await runOptimizationPipeline(
      resumeData,
      profileData,
      gapAnalysis,
      provider,
      payload.mode,
      payload.targetRole,
      payload.jobDescription,
      (sectionEnum, sectionId, stepStatus, detail) => {
        const sectionLabel = String(sectionEnum);
        const stepId = `optimize-${sectionLabel}-${sectionId ?? ''}`;
        const label = `Optimizing ${sectionLabel}${sectionId ? ` — ${sectionId}` : ''}`;
        sendStep(stepId, label, stepStatus, detail);

        // Broadcast partial results as they come in so the count updates live
        if (stepStatus === 'done') {
          broadcast({ results: accumulatedResults });
        }
      }
    );

    accumulatedResults.push(...results);
    sendStep('optimize', 'AI optimization', 'done',
      `${results.length} section${results.length !== 1 ? 's' : ''} optimized`);
    broadcast({ results, status: 'reviewing' });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    broadcast({ status: 'error', error });
    console.error('[SW] Pipeline failed:', error);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveLinkedInTab(): Promise<chrome.tabs.Tab | null> {
  // Prefer an active /in/ profile tab
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeProfile = active.find((t) => t.url?.includes('linkedin.com/in/'));
  if (activeProfile) return activeProfile;

  // Any active LinkedIn tab
  const activeLinkedIn = active.find((t) => t.url?.includes('linkedin.com'));
  if (activeLinkedIn) return activeLinkedIn;

  // Fall back: any LinkedIn /in/ tab in any window
  const allProfile = await chrome.tabs.query({ url: 'https://www.linkedin.com/in/*' });
  if (allProfile.length > 0) return allProfile[0];

  // Fall back: any LinkedIn tab
  const allLinkedIn = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  return allLinkedIn[0] ?? null;
}

/** Resolves when tab reaches status "complete", rejects after timeoutMs. */
function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} timed out`));
    }, timeoutMs);

    function listener(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 800); // settle delay for SPA hydration
      }
    }
    chrome.tabs.onUpdated.addListener(listener);

    // Handle already-complete tab
    chrome.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 800);
        }
      })
      .catch(() => { clearTimeout(timer); reject(new Error('Tab closed')); });
  });
}

/** Opens skills detail page in background tab, scrapes all skills, closes tab. */
async function fetchSkillsFromDetailPage(profileUrl: string): Promise<string[]> {
  const base = profileUrl.endsWith('/') ? profileUrl : profileUrl + '/';
  const skillsUrl = base + 'details/skills/';
  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url: skillsUrl, active: false });
    tabId = tab.id!;
    console.debug('[SW] Skills detail tab:', tabId, skillsUrl);
    await waitForTabLoad(tabId);
    const res = await retryContentScript<string[]>(tabId, { action: 'SCRAPE_SKILLS_DETAIL' }, 3, 1000);
    if (!res.success || !res.data) return [];
    console.debug('[SW] Skills detail scraped:', res.data.length);
    return res.data;
  } catch (err) {
    console.warn('[SW] fetchSkillsFromDetailPage failed:', err instanceof Error ? err.message : err);
    return [];
  } finally {
    if (tabId !== undefined) chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function retryContentScript<T>(
  tabId: number,
  message: import('../shared/messaging').ChromeMessage,
  maxAttempts: number,
  delayMs: number,
  onRetry?: (attempt: number) => void
): Promise<import('../shared/messaging').ChromeResponse<T>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await sendToContentScript<unknown, T>(tabId, message);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "Receiving end does not exist" = content script not injected or service worker restarted
      const notReady = msg.includes('Receiving end') || msg.includes('Could not establish');
      if (notReady) {
        // Programmatically re-inject the content script so we don't rely on
        // the declarative injection that may have been lost after a SW restart
        // (e.g. extension reload, tab opened before install).
        // Use chrome.runtime.getManifest() to get the actual compiled paths
        // so this works in both dev and production builds.
        try {
          const manifest = chrome.runtime.getManifest();
          const contentScriptFiles = manifest.content_scripts?.[0]?.js ?? [];
          if (contentScriptFiles.length > 0) {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: contentScriptFiles,
            });
          }
        } catch (_injectErr) {
          // Ignore — script may already be present; just wait and retry
        }
        if (attempt < maxAttempts) {
          onRetry?.(attempt + 1);
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          return {
            success: false,
            error: 'Content script not ready. The LinkedIn page may still be loading — please wait for it to fully load and try again.',
          };
        }
      } else {
        return { success: false, error: msg };
      }
    }
  }
  return { success: false, error: 'All retry attempts failed' };
}
