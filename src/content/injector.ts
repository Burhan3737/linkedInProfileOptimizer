import type { OptimizationResult } from '../shared/types';
import { LinkedInSection } from '../shared/types';
import { SELECTORS, querySelector } from './selectors';
import { RATE_LIMIT_DELAY_MS } from '../shared/constants';

// ─── Native input value setter (bypasses React synthetic events) ──────────────

function setNativeInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForElement(
  selectors: readonly string[],
  timeoutMs = 5000
): Promise<Element | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = querySelector(selectors);
    if (el) return el;
    await sleep(200);
  }
  return null;
}

// ─── Click an edit button and wait for modal ──────────────────────────────────

async function openEditModal(buttonSelectors: readonly string[]): Promise<boolean> {
  const btn = querySelector<HTMLButtonElement>(buttonSelectors);
  if (!btn) return false;
  btn.click();
  await sleep(800);
  return true;
}

async function saveAndCloseModal(): Promise<void> {
  const saveBtn = querySelector<HTMLButtonElement>(SELECTORS.editModalSave);
  if (saveBtn) {
    saveBtn.click();
    await sleep(1500); // Wait for LinkedIn to process the save
  }
}

// ─── Section-specific injectors ──────────────────────────────────────────────

async function applyHeadline(content: string): Promise<void> {
  const opened = await openEditModal(SELECTORS.editHeadlineBtn);
  if (!opened) throw new Error('Could not open headline edit modal');

  const input = await waitForElement(SELECTORS.headlineInput);
  if (!input) throw new Error('Headline input not found in modal');

  setNativeInputValue(input as HTMLInputElement, content);
  await sleep(300);
  await saveAndCloseModal();
}

async function applyAbout(content: string): Promise<void> {
  const opened = await openEditModal(SELECTORS.editAboutBtn);
  if (!opened) throw new Error('Could not open about edit modal');

  const textarea = await waitForElement(SELECTORS.aboutTextarea);
  if (!textarea) throw new Error('About textarea not found in modal');

  setNativeInputValue(textarea as HTMLTextAreaElement, content);
  await sleep(300);
  await saveAndCloseModal();
}

// ─── Snapshot for undo ────────────────────────────────────────────────────────

export function snapshotSection(section: LinkedInSection): string {
  switch (section) {
    case LinkedInSection.Headline: {
      const el = querySelector(SELECTORS.headline);
      return el?.innerHTML ?? '';
    }
    case LinkedInSection.About: {
      const el = querySelector(SELECTORS.about);
      return el?.innerHTML ?? '';
    }
    default:
      return '';
  }
}

// ─── Public apply function ────────────────────────────────────────────────────

export async function safeApply(result: OptimizationResult): Promise<void> {
  // Rate limit
  await sleep(RATE_LIMIT_DELAY_MS);

  const content = result.editedContent ?? result.optimized;

  switch (result.section) {
    case LinkedInSection.Headline:
      await applyHeadline(content);
      break;
    case LinkedInSection.About:
      await applyAbout(content);
      break;
    case LinkedInSection.Experience:
      console.warn('[Injector] Experience injection not yet fully implemented');
      break;
    case LinkedInSection.Skills:
      console.warn('[Injector] Skills injection requires add/remove individual skills');
      break;
    default:
      throw new Error(`Unknown section: ${result.section}`);
  }
}
