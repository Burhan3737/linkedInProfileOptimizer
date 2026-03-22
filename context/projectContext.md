# Project Context — LinkedIn Profile Optimizer

> Last updated: 2026-03-22

## Overview

Chrome MV3 extension that compares a user's resume against their LinkedIn profile, runs AI-powered gap analysis, generates optimized content for each section, and lets users review diffs before copying optimized text to clipboard for manual pasting into LinkedIn.

**Version**: 0.1.0 | **Status**: MVP complete

## Modes

- **Job Seeker** — aggressive ATS keyword optimization for a specific target role
- **Visibility** — polished broad optimization for passive recruiter discovery

## Architecture

```
┌─ Chrome Extension ──────────────────────────────────────────────┐
│                                                                  │
│  Side Panel (React)  ◄──chrome.runtime──►  Service Worker        │
│  ├─ WelcomeScreen                          ├─ Pipeline runner    │
│  ├─ AnalysisScreen                         ├─ Message router     │
│  ├─ SectionReview                          ├─ AI calls           │
│  ├─ SummaryScreen                          └─ Profile caching    │
│  └─ SettingsPanel    ◄──chrome.tabs──►  Content Script           │
│                                          ├─ Scraper (JSON-LD+DOM)│
│                                          └─ Injector (legacy)     │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   Groq API (primary provider)
```

## Pipeline Flow

1. User uploads resume (PDF/DOCX/TXT) → text extracted in sidepanel via pdfjs/mammoth
2. Raw text sent to service worker → AI structures into `ResumeData`
3. Service worker sends `SCRAPE_PROFILE` to content script → `CurrentProfileData` (cached 24h)
4. Gap analysis (local, no AI) compares resume vs profile → `GapAnalysis`
5. For each section in pipeline [Headline, About, Experience, Skills]:
   - Build section-specific prompt with resume data, profile data, gap analysis
   - Call AI provider → parse JSON response → validate with Zod
   - Check for hallucinations (fabricated companies)
   - Produce `OptimizationResult` with original/optimized/reasoning/keywords
6. User reviews each result in diff view (approve / edit / skip)
7. User copies optimized text to clipboard and pastes into LinkedIn manually
8. Summary screen shows results and keywords added

## Modules

### src/ai/ — AI Provider Layer
| File | Purpose |
|------|---------|
| `provider.ts` | `AIProvider` interface, `CompletionOptions`, `CompletionMessage` types |
| `groq.ts` | `GroqProvider` — Groq API at `https://api.groq.com/openai/v1/chat/completions`, JSON response format |
| `openrouter.ts` | `OpenRouterProvider` — exponential backoff retry (4 attempts) |
| `ollama.ts` | `OllamaProvider` — local at `http://localhost:11434`, 3-minute timeout |
| `free.ts` | `FreeProvider` — Pollinations.ai GET endpoint, no API key needed |
| `index.ts` | `createProvider(settings)` factory — currently always returns GroqProvider |

### src/background/ — Service Worker
- `service-worker.ts` (~405 lines) — Central orchestrator. Handles all 16 message actions. Pipeline steps: parse resume → scrape profile (with retry + programmatic content script re-injection) → gap analysis → optimize sections. Broadcasts `SESSION_UPDATE` and `PIPELINE_STEP_UPDATE` to side panel. Implements 24h profile caching.

### src/content/ — Content Script (runs on linkedin.com)
| File | Purpose |
|------|---------|
| `index.ts` | Entry point, message listener, SPA navigation observer |
| `scraper.ts` | `scrapeFullProfile()` — JSON-LD primary, DOM fallback. Extracts headline, about, experience, education, skills, certifications. `checkSelectorHealth()` for diagnostics |
| `injector.ts` | Legacy file — previously used for DOM injection. The UI now uses copy-to-clipboard instead; users paste changes into LinkedIn manually. Retained for potential future use |
| `selectors.ts` | All DOM selectors as arrays of fallbacks. `querySelector()` and `querySelectorAll()` try each in order |

### src/optimizer/ — Optimization Engine
| File | Purpose |
|------|---------|
| `pipeline.ts` | `runOptimizationPipeline()` — iterates SECTION_PIPELINE, handles Experience items individually (up to 5), broadcasts progress |
| `prompts.ts` | `buildSystemPrompt(mode, targetRole)`, section builders: `buildHeadlinePrompt`, `buildAboutPrompt`, `buildExperiencePrompt`, `buildSkillsPrompt`. All return JSON schema instructions |
| `gap-analysis.ts` | `runGapAnalysis(resumeData, profileData)` → keyword gaps, empty sections, skill gaps, inconsistencies, recommendations. Local only (no AI) |
| `validator.ts` | `parseOptimizationResponse(raw)` — strips markdown fences, extracts JSON, Zod validation (`{optimized, reasoning, keywords}`). `checkForHallucinations()` detects fabricated companies |

### src/parsers/ — Resume Parser
- `resume-parser.ts` (~208 lines) — `extractTextFromFile(file)` for PDF (pdfjs-dist), DOCX (mammoth), TXT. `structureResumeText(rawText, provider)` sends to AI with extraction prompt, validates with Zod `ResumeDataSchema`. Includes `repairTruncatedJson()` for recovery.

### src/sidepanel/ — React UI
| File | Purpose |
|------|---------|
| `App.tsx` | Screen router: loading → welcome → analysis → review → summary → settings. Listens for SESSION_UPDATE broadcasts. Restores session on mount |
| `WelcomeScreen.tsx` | File upload (drag+drop), mode selector, target role input, job description textarea. Persists form as `ResumeDraft`. Text extraction runs here |
| `AnalysisScreen.tsx` | Pipeline progress display, step-by-step status updates |
| `SectionReview.tsx` | Word-level diff view (using `diff` lib), approve/edit/skip actions, inline editor, AI reasoning display |
| `SummaryScreen.tsx` | Results summary, sections changed count, keywords badges |
| `SettingsPanel.tsx` | Groq API key input, model selector from `GROQ_MODELS` constant |

### src/shared/ — Shared Utilities
| File | Purpose |
|------|---------|
| `types.ts` | Core interfaces: `ResumeData`, `WorkExperience`, `Education`, `Certification`, `LinkedInExperience`, `LinkedInEducation`, `CurrentProfileData`, `LinkedInSection` enum (6 values, 4 in pipeline), `OptimizationMode`, `OptimizationResult`, `GapAnalysis`, `OptimizationSession` (9 status values), `UserSettings`, `PipelineStep` |
| `messaging.ts` | `MessageAction` union (16 actions), `ChromeMessage<T>`, `ChromeResponse<T>`, helpers: `sendToServiceWorker()`, `sendToContentScript()`, `broadcastToSidePanel()` |
| `storage.ts` | Keys: `current_session`, `user_settings`, `undo_snapshot`, `resume_draft`, + `cached_profile`. `ResumeDraft` interface. Profile cache with 24h TTL. Undo snapshots (max 20) |
| `constants.ts` | `SECTION_PIPELINE` (4 sections), `GROQ_MODELS` (2 free + 5 paid), limits: `RATE_LIMIT_DELAY_MS=3000`, `MAX_HEADLINE_LENGTH=220`, `MAX_ABOUT_LENGTH=2600`, `MAX_EXPERIENCE_DESCRIPTION_LENGTH=2000` |

## Key Types (src/shared/types.ts)

```typescript
// Section enum (6 defined, 4 in pipeline)
enum LinkedInSection { Headline, About, Experience, Skills, Education, Certifications }

// Pipeline order
SECTION_PIPELINE = [Headline, About, Experience, Skills]

// Session statuses
'idle' | 'parsing' | 'scraping' | 'analyzing' | 'optimizing' | 'reviewing' | 'applying' | 'complete' | 'error'

// Result statuses
'pending' | 'approved' | 'edited' | 'skipped'

// Settings
{ groqApiKey: string, groqModel: string, autoOpenSidePanel: boolean }
```

## Storage Schema

| Key | Type | Description |
|-----|------|-------------|
| `current_session` | `OptimizationSession` | Active session with all results |
| `user_settings` | `UserSettings` | Groq API key, model, preferences |
| `cached_profile` | `{ data: CurrentProfileData, cachedAt: number }` | 24h TTL profile cache |
| `resume_draft` | `ResumeDraft` | Last upload form state for persistence |
| `undo_snapshot` | `UndoSnapshot[]` | Up to 20 before/after HTML snapshots |

## Messaging Protocol

| Direction | Actions |
|-----------|---------|
| Side Panel → SW | `START_OPTIMIZATION`, `APPLY_CHANGE`, `GET_SESSION`, `UPDATE_RESULT_STATUS`, `RESET_SESSION`, `GET_SETTINGS`, `SAVE_SETTINGS` |
| SW → Side Panel | `SESSION_UPDATE`, `PIPELINE_STEP_UPDATE`, `OPTIMIZATION_RESULTS`, `SETTINGS_RESPONSE`, `ERROR` |
| Content → SW | `CONTENT_READY`, `PROFILE_SCRAPED`, `CHANGE_APPLIED`, `CHANGE_FAILED` |
| SW → Content | `SCRAPE_PROFILE`, `APPLY_DOM_CHANGE` |

## Dependencies

**Runtime**: react 18, react-dom 18, pdfjs-dist, mammoth, diff, zod
**Dev**: @crxjs/vite-plugin, @vitejs/plugin-react, typescript 5.5, tailwindcss 3, vite 5, playwright

## Current Limitations

- Changes are copy-to-clipboard only — users must paste into LinkedIn manually
- Education and Certifications not in optimization pipeline (scraped but not optimized)
- Groq free tier has rate limits
- LinkedIn selectors require manual maintenance when LinkedIn updates DOM

## Planned Features (Phase 2+)

- Job market data integration (trending keywords)
- Target job description keyword matching (basic field exists)
- Profile completeness scoring
- Multi-language support
- A/B testing (multiple optimization variants)
- Remote selector config (auto-update without extension release)
