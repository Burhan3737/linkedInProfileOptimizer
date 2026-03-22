import type { ChromeMessage, ChromeResponse } from '../shared/messaging';
import { scrapeFullProfile, checkSelectorHealth } from './scraper';
import { safeApply, snapshotSection } from './injector';
import type { OptimizationResult } from '../shared/types';
import { saveUndoSnapshot } from '../shared/storage';

let isInitialized = false;

function init(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Notify service worker that content script is ready
  chrome.runtime.sendMessage({ action: 'CONTENT_READY' }).catch(() => {});

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener(
    (
      message: ChromeMessage,
      _sender,
      sendResponse: (response: ChromeResponse) => void
    ) => {
      handleMessage(message, sendResponse);
      return true; // Keep channel open for async response
    }
  );
}

async function handleMessage(
  message: ChromeMessage,
  sendResponse: (response: ChromeResponse) => void
): Promise<void> {
  try {
    switch (message.action) {
      case 'SCRAPE_PROFILE': {
        const health = checkSelectorHealth();
        const profile = scrapeFullProfile();

        if (!profile) {
          sendResponse({
            success: false,
            error: 'Not on a LinkedIn profile page. Navigate to linkedin.com/in/your-profile',
          });
          return;
        }

        chrome.runtime.sendMessage({
          action: 'PROFILE_SCRAPED',
          payload: { profile, selectorHealth: health },
        });

        sendResponse({ success: true, data: profile });
        break;
      }

      case 'APPLY_DOM_CHANGE': {
        const result = message.payload as OptimizationResult;

        // Snapshot for undo
        const snapshot = snapshotSection(result.section);
        await saveUndoSnapshot({
          section: result.section,
          sectionId: result.sectionId,
          originalHTML: snapshot,
          appliedAt: Date.now(),
        });

        await safeApply(result);

        chrome.runtime.sendMessage({
          action: 'CHANGE_APPLIED',
          payload: { section: result.section, sectionId: result.sectionId },
        });

        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    chrome.runtime.sendMessage({
      action: 'CHANGE_FAILED',
      payload: { error },
    });
    sendResponse({ success: false, error });
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-init on navigation (LinkedIn is a SPA)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    // Re-notify that content script is ready after navigation
    chrome.runtime.sendMessage({ action: 'CONTENT_READY' }).catch(() => {});
  }
});
observer.observe(document.body, { subtree: true, childList: true });
