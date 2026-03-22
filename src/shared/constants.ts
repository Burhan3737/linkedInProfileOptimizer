import { LinkedInSection } from "./types";

// ─── Section Pipeline Order ───────────────────────────────────────────────────

export const SECTION_PIPELINE: LinkedInSection[] = [
  LinkedInSection.Headline,
  LinkedInSection.About,
  LinkedInSection.Experience,
  LinkedInSection.Skills,
];

// ─── Groq Models ──────────────────────────────────────────────────────────────

export type ModelEntry = { id: string; label: string; tier: 'free' | 'paid' };

export const GROQ_MODELS: ModelEntry[] = [
  // ── Free tier (included with any Groq account, rate-limited) ─────────────────
  { id: 'llama-3.1-8b-instant',                          label: 'Llama 3.1 8B Instant — fastest, free tier',              tier: 'free' },
  { id: 'llama-3.3-70b-versatile',                       label: 'Llama 3.3 70B Versatile — balanced quality, free tier',  tier: 'free' },

  // ── Paid — billed per token ────────────────────────────────────────────────
  { id: 'openai/gpt-oss-20b',                            label: 'GPT OSS 20B — fast · $0.075/$0.30 per 1M tokens',        tier: 'paid' },
  { id: 'openai/gpt-oss-120b',                           label: 'GPT OSS 120B — powerful · $0.15/$0.60 per 1M tokens',    tier: 'paid' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct',     label: 'Llama 4 Scout 17B — fast MoE · $0.11/$0.34 per 1M',     tier: 'paid' },
  { id: 'qwen/qwen-3-32b',                               label: 'Qwen 3 32B — 128K ctx · $0.29/$0.59 per 1M tokens',     tier: 'paid' },
  { id: 'moonshotai/kimi-k2-instruct-0905',              label: 'Kimi K2 — 256K ctx · $1.00/$3.00 per 1M tokens',        tier: 'paid' },
];

// ─── Limits ───────────────────────────────────────────────────────────────────

export const RATE_LIMIT_DELAY_MS = 3000;
export const MAX_HEADLINE_LENGTH = 220;
export const MAX_ABOUT_LENGTH = 2600;
export const MAX_EXPERIENCE_DESCRIPTION_LENGTH = 2000;
