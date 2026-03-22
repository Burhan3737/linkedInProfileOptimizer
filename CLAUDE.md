# CLAUDE.md — Instructions for Claude Code

## Context Loading

1. **Always read `context/projectContext.md` first** before exploring the codebase.
2. Check `context/sessions/` for any active session files if continuing previous work.
3. After significant changes, update `context/projectContext.md` to keep it current.
4. After adding new code always execute command `npm run build` and make sure it compiles successfully. If it fails, perform another iteration

## Project Overview

LinkedIn Profile Optimizer — Chrome MV3 extension (side panel) that compares a user's resume against their LinkedIn profile, generates AI-powered section-by-section improvements, and lets users copy optimized text to clipboard for manual pasting into LinkedIn.

## Commands

```bash
npm run dev        # Vite dev server with hot reload (load dist/ as unpacked extension)
npm run build      # Production build → dist/
npm run typecheck  # TypeScript type checking (no emit)
```

## Architecture

- **Service Worker** (`src/background/service-worker.ts`) — orchestrates pipeline, message routing, AI calls
- **Content Script** (`src/content/`) — LinkedIn DOM scraping (`scraper.ts`)
- **Side Panel** (`src/sidepanel/`) — React UI: WelcomeScreen, AnalysisScreen, SectionReview, SummaryScreen, SettingsPanel
- **AI Layer** (`src/ai/`) — provider abstraction; Groq (primary provider)
- **Optimizer** (`src/optimizer/`) — gap analysis, prompt engineering, pipeline runner, response validation
- **Parsers** (`src/parsers/resume-parser.ts`) — PDF/DOCX/TXT extraction + AI structuring
- **Shared** (`src/shared/`) — types, messaging protocol, storage helpers, constants

## Key Conventions

- All LinkedIn DOM selectors live in `src/content/selectors.ts` — update here when LinkedIn changes markup
- AI providers implement the `AIProvider` interface from `src/ai/provider.ts`
- Messages between extension components use typed `ChromeMessage<T>` / `ChromeResponse<T>` from `src/shared/messaging.ts`
- Storage keys are centralized in `src/shared/storage.ts`
- Section pipeline order: Headline → About → Experience → Skills (defined in `src/shared/constants.ts`)

## Rules

### Context Management
1. **Context first**: Always read `context/projectContext.md` before exploring the full codebase. This saves context window space.
2. **Update context**: When adding new modules, features, or making architectural changes, update `context/projectContext.md` accordingly.
3. **Session files**: For multi-session work, create a file in `context/sessions/` named `YYYY-MM-DD-<topic>.md` describing what was done and what remains.
4. **Load sessions**: When user asks to continue previous work, check for and read the relevant session file in `context/sessions/`.

### Code Guidelines
5. **Selector changes**: When modifying LinkedIn selectors, test all scraping strategies (JSON-LD, container-based, global fallback).
6. **AI provider changes**: New providers must implement the `AIProvider` interface and be wired through `src/ai/index.ts`.
7. **Type safety**: All message passing uses typed payloads — add new actions to `MessageAction` union in `src/shared/messaging.ts`.
8. **No secrets in code**: API keys are stored in `chrome.storage.local` via the Settings panel, never hardcoded.
