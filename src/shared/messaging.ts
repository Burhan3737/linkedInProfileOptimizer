import type {
  ResumeData,
  CurrentProfileData,
  OptimizationResult,
  OptimizationSession,
  UserSettings,
  PipelineStep,
} from './types';

// ─── Message Action Types ─────────────────────────────────────────────────────

export type MessageAction =
  // Side panel → Service worker
  | 'START_OPTIMIZATION'
  | 'APPLY_CHANGE'
  | 'GET_SESSION'
  | 'UPDATE_RESULT_STATUS'
  | 'COMPLETE_REVIEW'
  | 'RESET_SESSION'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  // Service worker → Side panel
  | 'SESSION_UPDATE'
  | 'PIPELINE_STEP_UPDATE'
  | 'OPTIMIZATION_RESULTS'
  | 'SETTINGS_RESPONSE'
  | 'ERROR'
  // Content script → Service worker
  | 'PROFILE_SCRAPED'
  | 'CHANGE_APPLIED'
  | 'CHANGE_FAILED'
  | 'CONTENT_READY'
  // Service worker → Content script
  | 'SCRAPE_PROFILE'
  | 'SCRAPE_TOP_CARD'
  | 'SCRAPE_SKILLS_DETAIL'
  | 'SCRAPE_EXPERIENCE_DETAIL'
  | 'APPLY_DOM_CHANGE';

// ─── Message Payloads ─────────────────────────────────────────────────────────

export interface StartOptimizationPayload {
  resumeText: string; // raw extracted text (extraction done in sidepanel, not service worker)
  mode: 'job_seeker' | 'visibility';
  targetRole: string;
  jobDescription?: string;
}

export interface ApplyChangePayload {
  result: OptimizationResult;
}

export interface UpdateResultStatusPayload {
  section: string;
  sectionId?: string;
  status: OptimizationResult['status'];
  editedContent?: string;
}

export interface PipelineStepPayload {
  step: PipelineStep;
}

// ─── Typed Message ────────────────────────────────────────────────────────────

export interface ChromeMessage<T = unknown> {
  action: MessageAction;
  payload?: T;
}

// ─── Typed response wrapper ───────────────────────────────────────────────────

export interface ChromeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function sendToServiceWorker<T = unknown, R = unknown>(
  message: ChromeMessage<T>
): Promise<ChromeResponse<R>> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response: ChromeResponse<R>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function sendToContentScript<T = unknown, R = unknown>(
  tabId: number,
  message: ChromeMessage<T>
): Promise<ChromeResponse<R>> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: ChromeResponse<R>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export function broadcastToSidePanel<T = unknown>(message: ChromeMessage<T>): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open — ignore
  });
}

// Re-export types used in message handlers
export type {
  ResumeData,
  CurrentProfileData,
  OptimizationResult,
  OptimizationSession,
  UserSettings,
  PipelineStep,
};
