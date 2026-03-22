# LinkedIn Profile Optimizer — Technical Architecture

## 1. Product Overview

A Chrome extension that reads a user's resume, analyzes their current LinkedIn profile, and generates optimized content for each profile section. Users approve changes section-by-section via a diff view, and the extension applies changes directly to LinkedIn's DOM.

**Two modes:**
- **Job Seeker Mode** — aggressive keyword optimization, tailored to a target role/industry
- **Visibility Mode** — polished, broad optimization for passive recruiter discovery

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Side     │  │   Content    │  │    Background         │ │
│  │  Panel    │  │   Script     │  │    Service            │ │
│  │  (React)  │  │  (LinkedIn)  │  │    Worker             │ │
│  └────┬──────┘  └──────┬───────┘  └────────┬──────────────┘ │
│       │                │                    │               │
│       └────────────────┼────────────────────┘               │
│                        │ chrome.runtime messaging           │
└────────────────────────┼────────────────────────────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   Groq API         │
              │   (Primary)        │
              │   + OpenRouter /   │
              │     Ollama /       │
              │     Pollinations   │
              └────────────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **Side Panel** | Main UI — file upload, mode selection, section-by-section diff review, settings |
| **Content Script** | Injected into linkedin.com — scrapes current profile data, applies approved changes to DOM |
| **Service Worker** | Orchestrates pipeline, routes messages, manages state, calls AI providers |
| **AI Provider** | Groq API (primary, free tier) — generates optimized content via chat completions |

---

## 3. Extension Structure

```
linkedin-optimizer/
├── manifest.json              # Chrome MV3 manifest
├── package.json               # Dependencies & scripts
├── vite.config.ts             # Vite + CRXJS build config
├── tsconfig.json              # TypeScript config
├── tailwind.config.js         # Tailwind CSS config
├── postcss.config.js          # PostCSS config
├── src/
│   ├── background/
│   │   └── service-worker.ts  # Pipeline orchestration, message routing, AI calls
│   ├── content/
│   │   ├── index.ts           # Entry point, message handler, SPA navigation observer
│   │   ├── scraper.ts         # LinkedIn profile extraction (JSON-LD + DOM fallback)
│   │   ├── injector.ts        # Apply changes via native input events
│   │   └── selectors.ts       # LinkedIn DOM selectors with fallback arrays
│   ├── sidepanel/
│   │   ├── index.html         # Side panel entry point
│   │   ├── index.tsx          # Vite entry
│   │   ├── App.tsx            # Screen router & session management
│   │   ├── components/
│   │   │   ├── WelcomeScreen.tsx      # Resume upload, mode selection, target role
│   │   │   ├── AnalysisScreen.tsx     # Live pipeline progress display
│   │   │   ├── SectionReview.tsx      # Word-level diff viewer & approval UI
│   │   │   ├── SummaryScreen.tsx      # Results summary & keywords display
│   │   │   └── SettingsPanel.tsx      # Groq API key & model configuration
│   │   └── styles/
│   │       └── globals.css    # Tailwind directives
│   ├── ai/
│   │   ├── provider.ts        # AIProvider interface
│   │   ├── groq.ts            # Groq API provider (primary)
│   │   ├── openrouter.ts      # OpenRouter provider (alternative)
│   │   ├── ollama.ts          # Ollama local provider (alternative)
│   │   ├── free.ts            # Pollinations.ai provider (no key needed)
│   │   └── index.ts           # Provider factory
│   ├── optimizer/
│   │   ├── pipeline.ts        # Section-by-section optimization runner
│   │   ├── prompts.ts         # System + section prompt builders
│   │   ├── gap-analysis.ts    # Resume vs LinkedIn comparison
│   │   └── validator.ts       # Zod schema validation + hallucination check
│   ├── parsers/
│   │   └── resume-parser.ts   # PDF/DOCX/TXT extraction + AI structuring
│   ├── shared/
│   │   ├── types.ts           # All TypeScript interfaces and enums
│   │   ├── messaging.ts       # Chrome message types + helpers
│   │   ├── storage.ts         # Session, settings, cache, undo storage
│   │   └── constants.ts       # Pipeline order, Groq models, limits
│   └── vite-env.d.ts          # Vite types
├── assets/
│   └── icons/                 # Extension icons (16, 48, 128 px)
├── tests/
│   ├── test-resume-parse.mjs  # Resume parsing tests
│   ├── test-groq-pipeline.mjs # Groq API response parsing tests
│   └── debug-extension.mjs    # Playwright CDP debug harness
└── docs/
    └── prd/                   # Product requirements
```

### Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "LinkedIn Profile Optimizer",
  "version": "0.1.0",
  "description": "AI-powered LinkedIn profile optimizer — upload your resume, review AI-generated improvements section by section.",
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "http://localhost:11434/*",
    "https://openrouter.ai/*"
  ],
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["src/content/index.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "LinkedIn Profile Optimizer",
    "default_icon": { "16": "assets/icons/icon16.png", "48": "assets/icons/icon48.png" }
  }
}
```

---

## 4. Data Models

### 4.1 LinkedIn Profile Sections

```typescript
enum LinkedInSection {
  Headline = 'headline',
  About = 'about',
  Experience = 'experience',
  Skills = 'skills',
  Education = 'education',
  Certifications = 'certifications',
}

// Ordered pipeline — sections processed in this sequence (MVP)
const SECTION_PIPELINE: LinkedInSection[] = [
  LinkedInSection.Headline,       // Highest impact, smallest change
  LinkedInSection.About,          // Narrative rewrite
  LinkedInSection.Experience,     // Per-role bullet optimization
  LinkedInSection.Skills,         // Gap-fill from resume
];
```

### 4.2 Core Data Types

```typescript
interface ResumeData {
  rawText: string;
  fullName?: string;
  headline?: string;
  summary?: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  certifications: Certification[];
  languages?: string[];
}

interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;   // null = present
  description: string;
  bullets: string[];
  location?: string;
}

interface CurrentProfileData {
  profileUrl: string;
  fullName: string;
  headline: string;
  about: string;
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: string[];
  certifications: string[];
  scrapedAt: number;
}

interface OptimizationResult {
  section: LinkedInSection;
  sectionId?: string;        // For individual experience/education items
  original: string;
  optimized: string;
  reasoning: string;
  keywords: string[];
  status: 'pending' | 'approved' | 'edited' | 'skipped';
  editedContent?: string;
}

interface GapAnalysis {
  missingKeywords: string[];
  emptySections: LinkedInSection[];
  skillGaps: string[];
  inconsistencies: string[];
  recommendations: string[];
}

interface OptimizationSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  mode: 'job_seeker' | 'visibility';
  targetRole: string;
  jobDescription?: string;
  resumeData?: ResumeData;
  profileData?: CurrentProfileData;
  gapAnalysis?: GapAnalysis;
  results: OptimizationResult[];
  appliedSections: string[];
  status: 'idle' | 'parsing' | 'scraping' | 'analyzing' | 'optimizing'
        | 'reviewing' | 'applying' | 'complete' | 'error';
  error?: string;
}

interface UserSettings {
  groqApiKey: string;
  groqModel: string;
  autoOpenSidePanel: boolean;
}
```

---

## 5. AI Provider Layer

### 5.1 Abstraction Interface

```typescript
interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CompletionOptions {
  messages: CompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

interface AIProvider {
  name: string;
  generateCompletion(options: CompletionOptions): Promise<string>;
}
```

### 5.2 Groq Provider (Primary)

```typescript
class GroqProvider implements AIProvider {
  name = 'groq';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateCompletion(options: CompletionOptions): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2048,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      }),
    });
    const data = await res.json();
    return data.choices[0].message.content;
  }
}
```

### 5.3 Available Models

| Model | Tier | Notes |
|-------|------|-------|
| `llama-3.1-8b-instant` | Free | Fastest, good for quick iterations |
| `llama-3.3-70b-versatile` | Free | Balanced quality, default choice |
| `openai/gpt-oss-20b` | Paid | $0.075/$0.30 per 1M tokens |
| `openai/gpt-oss-120b` | Paid | $0.15/$0.60 per 1M tokens |
| `meta-llama/llama-4-scout-17b-16e-instruct` | Paid | Fast MoE, $0.11/$0.34 per 1M |
| `qwen/qwen-3-32b` | Paid | 128K context, $0.29/$0.59 per 1M |
| `moonshotai/kimi-k2-instruct-0905` | Paid | 256K context, $1.00/$3.00 per 1M |

### 5.4 Alternative Providers

```typescript
// Provider factory — currently defaults to Groq
function createProvider(settings: UserSettings): AIProvider {
  return new GroqProvider(settings.groqApiKey, settings.groqModel);
}

// Other providers available but not wired into settings UI:
// - OpenRouterProvider: exponential backoff retry (4 attempts)
// - OllamaProvider: local at localhost:11434, 3-minute timeout
// - FreeProvider: Pollinations.ai GET endpoint, no key needed (12K char limit)
```

---

## 6. Core Pipeline

### 6.1 End-to-End Flow

```
[1. Upload Resume (PDF/DOCX/TXT)]
       │  Text extraction happens in sidepanel (browser context)
       │  using pdfjs-dist or mammoth
       ▼
[2. Parse Resume → Structured ResumeData]
       │  Raw text sent to service worker
       │  AI structures into JSON, validated with Zod
       ▼
[3. Scrape Current LinkedIn Profile]
       │  Service worker sends SCRAPE_PROFILE to content script
       │  Checks 24h profile cache first
       │  Retries with programmatic content script re-injection on failure
       ▼
[4. Gap Analysis]
       │  Local comparison (no AI): keyword gaps, empty sections,
       │  skill gaps, inconsistencies
       ▼
[5. For each section in SECTION_PIPELINE:]
       │
       ├─► [5a. Build section-specific prompt]
       │     (resume + profile + gap analysis + mode + target role)
       │
       ├─► [5b. Call Groq API → JSON response]
       │
       ├─► [5c. Parse + validate with Zod → OptimizationResult]
       │     Check for hallucinations (fabricated companies)
       │
       ├─► [5d. Present word-level diff in Side Panel]
       │
       ├─► [5e. User: Approve / Edit & Approve / Skip]
       │
       └─► [5f. If approved → Content script applies to LinkedIn DOM]
              │
              ▼
       [6. Next section → repeat from 5]
              │
              ▼
       [7. Summary screen — sections changed, keywords added]
```

### 6.2 Resume Parsing Strategy

Text extraction runs client-side in the sidepanel (browser context, not service worker):

```typescript
// In WelcomeScreen.tsx — extract text before sending to service worker
async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':  return extractTextFromPDF(file);   // pdfjs-dist
    case 'docx': return extractTextFromDOCX(file);  // mammoth
    case 'txt':  return file.text();
    default:     throw new Error(`Unsupported format: ${ext}`);
  }
}

// In service worker — AI structures the raw text
async function structureResumeText(rawText: string, provider: AIProvider): Promise<ResumeData> {
  const response = await provider.generateCompletion({
    messages: [
      { role: 'system', content: 'Extract structured data from this resume. Return valid JSON only.' },
      { role: 'user', content: rawText },
    ],
    temperature: 0.1,
    jsonMode: true,
  });
  return ResumeDataSchema.parse(JSON.parse(response));
}
```

### 6.3 LinkedIn DOM Scraping

```typescript
// selectors.ts — All selectors as arrays of fallbacks
const SELECTORS = {
  headline: {
    view: [
      '.text-body-medium.break-words',
      'div.mt2 .text-body-medium',
      // ... additional fallbacks
    ],
    editButton: [
      'button[aria-label="Edit intro"]',
      '[data-test="edit-intro"]',
    ],
  },
  about: {
    view: [
      '#about ~ .display-flex .pv-shared-text-with-see-more span[aria-hidden="true"]',
      '#about + div + div span.visually-hidden',
    ],
  },
  // ... more sections
};

// Resilient scraping: tries each selector in order
function querySelector(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Primary strategy: JSON-LD structured data (most stable)
// Fallback: DOM selectors with arrays of alternatives
// scraper.ts also includes checkSelectorHealth() for diagnostics
```

---

## 7. Prompt Engineering

### 7.1 System Prompt

```typescript
function buildSystemPrompt(mode: OptimizationMode, targetRole?: string): string {
  const modeContext = mode === 'job_seeker'
    ? `Job Seeker Mode — targeting: ${targetRole}. Optimize aggressively for ATS keywords.`
    : 'Visibility Mode — optimize for broad recruiter discovery.';

  return `You are a LinkedIn profile optimization expert.
${modeContext}

Rules:
- Preserve the person's authentic voice — enhance, don't fabricate
- Never invent experience, skills, or achievements not in the source material
- Use strong action verbs and quantify results where data exists
- Optimize for LinkedIn's search while keeping text natural
- Return JSON: { "optimized": "...", "reasoning": "...", "keywords": ["..."] }`;
}
```

### 7.2 Section-Specific Prompts

Each section has a dedicated prompt builder (`buildHeadlinePrompt`, `buildAboutPrompt`, etc.) that includes:
- Current LinkedIn content for that section
- Relevant resume data
- Missing keywords from gap analysis
- Character limits (Headline: 220, About: 2600, Experience: 2000)
- Section-specific formatting rules

### 7.3 Response Validation

```typescript
// validator.ts — Parse and validate AI responses
const OptimizationResponseSchema = z.object({
  optimized: z.string(),
  reasoning: z.string(),
  keywords: z.array(z.string()),
});

function parseOptimizationResponse(raw: string) {
  // Strip markdown code fences if present
  // Extract JSON from response
  // Validate with Zod schema
  return OptimizationResponseSchema.parse(JSON.parse(cleaned));
}

// Hallucination detection: check for company names not in resume
function checkForHallucinations(optimized: string, resumeData: ResumeData): string[] {
  // Returns list of suspicious entities
}
```

---

## 8. Side Panel UI Flow

### 8.1 Screens

```
[WelcomeScreen]
  │
  ├── Upload resume (drag & drop / file picker)
  ├── Select mode (Job Seeker / Visibility)
  ├── If Job Seeker: enter target role
  ├── Optional: paste job description
  └── "Optimize My Profile" button
        │
        ▼
[AnalysisScreen]
  │   Step-by-step progress:
  │   - "Parsing your resume..."
  │   - "Scraping your LinkedIn profile..."
  │   - "Analyzing gaps..."
  │   - "Optimizing sections..."
  │
  ▼
[SectionReview] (repeat for each section)
  │
  ├── Section name + progress (e.g., "2 of 6 sections")
  ├── Word-level diff view (using `diff` npm library):
  │     Removed text in red, added text in green
  ├── "Why this change" — AI reasoning display
  ├── Keywords badge row — new keywords being added
  ├── Three action buttons:
  │     [✓ Approve]  [✎ Edit & Approve]  [→ Skip]
  └── If "Edit": inline editor with the suggested text
        │
        ▼
[SummaryScreen]
  │
  ├── Sections changed count
  ├── Keywords added badges
  └── "Start Over" button

[SettingsPanel] (accessible via gear icon)
  │
  ├── Groq API key input
  └── Model selector (from GROQ_MODELS constant)
```

### 8.2 Screen State Management

```typescript
// App.tsx manages screen state
type Screen = 'loading' | 'welcome' | 'analysis' | 'review' | 'summary' | 'settings';

// Listens for SESSION_UPDATE broadcasts from service worker
// Restores session from chrome.storage.local on mount
// Form state persisted as ResumeDraft for session recovery
```

---

## 9. DOM Injection (Applying Changes)

### 9.1 Strategy

LinkedIn is a React SPA — direct innerHTML changes don't persist. The approach:

1. **Trigger LinkedIn's edit mode** programmatically (click the edit button)
2. **Fill LinkedIn's own form fields** using native input value setters (bypasses React's synthetic events)
3. **Trigger save** via LinkedIn's own save button

```typescript
// injector.ts
async function safeApply(result: OptimizationResult): Promise<boolean> {
  const section = result.section;

  // Step 1: Click edit button
  const editBtn = querySelector(SELECTORS[section].editButton);
  editBtn.click();

  // Step 2: Wait for edit form to render
  await waitForElement(SELECTORS[section].input, 3000);

  // Step 3: Fill using native value setter (bypasses React)
  const input = querySelector(SELECTORS[section].input);
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  nativeSetter?.call(input, result.optimized);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Step 4: Click save
  const saveBtn = querySelector(SELECTORS[section].saveButton);
  saveBtn.click();
  return true;
}
```

**Current status**: Headline and About injection working. Experience and Skills injection are stubs.

### 9.2 Safety Guards

- **Rate limiting**: 3-second delay between section edits (`RATE_LIMIT_DELAY_MS`)
- **Undo snapshots**: Before each change, save the original HTML (max 20 snapshots)
- **Content script recovery**: If service worker restarts, automatically re-inject content script

---

## 10. Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Extension framework | Chrome Manifest V3 | Required for modern extensions |
| UI framework | React 18 + TypeScript | Side panel UI, component reuse |
| Bundler | Vite 5 + CRXJS | Best DX for extension development, HMR |
| Styling | Tailwind CSS 3 | Fast iteration for side panel UI |
| Resume parsing (PDF) | pdfjs-dist | Works client-side, Mozilla-maintained |
| Resume parsing (DOCX) | mammoth | Lightweight, browser-compatible |
| Diff rendering | diff (npm) | Lightweight word-level diffing |
| AI Provider | Groq API (primary) | Free tier, fast inference, OpenAI-compatible API |
| Schema validation | Zod | Runtime type checking for AI responses and storage |
| State management | chrome.storage.local | Persist sessions, undo history, settings |
| Testing | Playwright | E2E extension testing via CDP |

---

## 11. MVP Scope (Phase 1)

### In Scope (Complete)
- [x] Chrome extension with side panel UI
- [x] Resume upload (PDF + DOCX + TXT)
- [x] LinkedIn profile scraping (own profile only) with JSON-LD + DOM fallback
- [x] Groq API integration (free tier + paid models)
- [x] Section-by-section optimization: Headline, About, Experience, Skills
- [x] Diff view with approve/edit/skip
- [x] DOM injection for Headline and About
- [x] Undo snapshots (per-section)
- [x] Job Seeker mode and Visibility mode
- [x] Gap analysis (keyword gaps, skill gaps, empty sections)
- [x] Session persistence and profile caching (24h)
- [x] Pipeline progress broadcasting
- [x] Settings panel (API key, model selection)

### Phase 2 (Planned)
- [ ] Full Experience and Skills DOM injection
- [ ] Education and Certifications optimization
- [ ] Target job description keyword matching (field exists, not fully utilized)
- [ ] Market context from job postings
- [ ] Additional AI providers in settings (Claude, GPT-4)
- [ ] Profile completeness scoring
- [ ] Undo UI (snapshots stored but no restore mechanism)

### Phase 3 (Future)
- [ ] Batch optimization (one-click optimize all)
- [ ] A/B testing suggestions (multiple variants per section)
- [ ] Analytics — track profile view changes over time
- [ ] Multi-language support
- [ ] Remote selector config (auto-update when LinkedIn DOM changes)

---

## 12. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LinkedIn DOM changes break scraping/injection | High | Selector abstraction with fallback arrays + `checkSelectorHealth()` diagnostics |
| LinkedIn detects bot-like behavior | High | Rate limiting (3s delay), human-like delays, trigger native edit flows |
| Groq API rate limits on free tier | Medium | Model-agnostic provider layer, easy to swap providers |
| Resume parsing accuracy | Medium | AI structuring + Zod validation + truncated JSON repair |
| User trust — "will this mess up my profile?" | High | Diff preview, section-by-section approval, undo snapshots |
| LinkedIn ToS concerns | High | Only modify user's own profile with explicit consent; nothing stored server-side |

---

## 13. Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Get a free Groq API key
#    → https://console.groq.com

# 3. Build the extension
npm run build            # Production build → dist/
# or
npm run dev              # Dev server with hot reload

# 4. Load in Chrome
#    → chrome://extensions → Enable Developer Mode → Load Unpacked → select dist/

# 5. Configure
#    → Open extension on any LinkedIn profile page
#    → Click settings (gear icon)
#    → Paste Groq API key
#    → Select model (llama-3.3-70b-versatile recommended)
```

---

## 14. Open Questions

1. **Selector maintenance** — Build a community selector registry with remote updates, or keep internal and ship extension updates?
2. **Experience/Skills injection** — Current stubs need completion. What's the best approach for multi-entry sections (edit one at a time vs batch)?
3. **Undo UX** — Snapshots are stored but no UI exists. Should undo be per-section or "undo all"?
4. **Freemium model** — Natural split: free = Groq free tier models, paid = premium models + market data features.
