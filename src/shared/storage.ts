import type { OptimizationSession, UserSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const KEYS = {
  SESSION: 'current_session',
  SETTINGS: 'user_settings',
  UNDO_SNAPSHOT: 'undo_snapshot',
  RESUME_DRAFT: 'resume_draft',
} as const;

// ─── Resume Draft (persisted form state) ─────────────────────────────────────

export interface ResumeDraft {
  resumeText: string;
  fileName: string;
  fileSize: number;
  savedAt: number;
  targetRole: string;
  mode: 'job_seeker' | 'visibility';
  jobDescription: string;
}

export async function saveResumeDraft(draft: ResumeDraft): Promise<void> {
  await chrome.storage.local.set({ [KEYS.RESUME_DRAFT]: draft });
}

export async function getResumeDraft(): Promise<ResumeDraft | null> {
  const result = await chrome.storage.local.get(KEYS.RESUME_DRAFT);
  return (result[KEYS.RESUME_DRAFT] as ResumeDraft) ?? null;
}

export async function clearResumeDraft(): Promise<void> {
  await chrome.storage.local.remove(KEYS.RESUME_DRAFT);
}

// ─── Session ──────────────────────────────────────────────────────────────────

export async function getSession(): Promise<OptimizationSession | null> {
  const result = await chrome.storage.local.get(KEYS.SESSION);
  return (result[KEYS.SESSION] as OptimizationSession) ?? null;
}

export async function saveSession(session: OptimizationSession): Promise<void> {
  await chrome.storage.local.set({ [KEYS.SESSION]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(KEYS.SESSION);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<UserSettings> {
  const result = await chrome.storage.local.get(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] as Partial<UserSettings>) };
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [KEYS.SETTINGS]: { ...current, ...settings } });
}

// ─── Cached Profile (avoids re-scraping on repeat runs) ──────────────────────

const PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedProfile {
  data: import('./types').CurrentProfileData;
  cachedAt: number;
}

export async function saveCachedProfile(profile: import('./types').CurrentProfileData): Promise<void> {
  const entry: CachedProfile = { data: profile, cachedAt: Date.now() };
  await chrome.storage.local.set({ cached_profile: entry });
}

export async function getCachedProfile(): Promise<import('./types').CurrentProfileData | null> {
  const result = await chrome.storage.local.get('cached_profile');
  const entry = result['cached_profile'] as CachedProfile | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PROFILE_CACHE_TTL_MS) return null; // expired
  return entry.data;
}

export async function clearCachedProfile(): Promise<void> {
  await chrome.storage.local.remove('cached_profile');
}

// ─── Undo Snapshots ───────────────────────────────────────────────────────────

export interface UndoSnapshot {
  section: string;
  sectionId?: string;
  originalHTML: string;
  appliedAt: number;
}

export async function saveUndoSnapshot(snapshot: UndoSnapshot): Promise<void> {
  const result = await chrome.storage.local.get(KEYS.UNDO_SNAPSHOT);
  const existing: UndoSnapshot[] = (result[KEYS.UNDO_SNAPSHOT] as UndoSnapshot[]) ?? [];
  existing.push(snapshot);
  // Keep last 20 snapshots
  const trimmed = existing.slice(-20);
  await chrome.storage.local.set({ [KEYS.UNDO_SNAPSHOT]: trimmed });
}

export async function getUndoSnapshots(): Promise<UndoSnapshot[]> {
  const result = await chrome.storage.local.get(KEYS.UNDO_SNAPSHOT);
  return (result[KEYS.UNDO_SNAPSHOT] as UndoSnapshot[]) ?? [];
}

export async function clearUndoSnapshots(): Promise<void> {
  await chrome.storage.local.remove(KEYS.UNDO_SNAPSHOT);
}
