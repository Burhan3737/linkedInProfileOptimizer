# LinkedIn Profile Optimizer

A Chrome extension that uses AI to analyze your resume and optimize your LinkedIn profile — generating improved content you can copy and paste into each section.

---

## What It Does

LinkedIn Profile Optimizer compares your resume against your current LinkedIn profile, identifies gaps, then generates AI-powered suggestions for your key sections (Headline, About, Experience, Skills). You review each suggestion in a side-by-side diff view, then copy the optimized text and paste it into LinkedIn yourself.

**Two optimization modes:**

- **Job Seeker** — Aggressively optimizes for ATS keyword density and a specific target role
- **Visibility** — Polishes your profile for broad recruiter discovery without over-tailoring to one position

**Pipeline overview:**

```
Upload Resume → Parse (AI) → Scrape LinkedIn Profile → Gap Analysis
    → AI Optimization (per section) → Diff Review → Copy to Clipboard → Paste into LinkedIn
```

**Sections optimized:** Headline · About · Experience (up to 5 jobs) · Skills

---

## Features

- Upload PDF, DOCX, or plain text resumes — parsed client-side
- AI-powered gap analysis: missing keywords, empty sections, skill gaps, inconsistencies
- Word-level diff view with side-by-side before/after comparison
- Inline editing before copying any suggestion
- Copy optimized text to clipboard, then paste into LinkedIn manually
- 24-hour profile cache to avoid re-scraping on repeat runs
- Full session persistence — resume a multi-section review across browser sessions

---

## AI Provider — Groq

The extension uses **Groq** for all AI calls. Groq offers a free tier with no credit card required.

1. Create a free account at [console.groq.com](https://console.groq.com)
2. Generate an API key
3. Paste the key into the extension's Settings panel

The default model is `llama-3.1-8b-instant` (free tier). Several other models are available in Settings.

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/)
- Google Chrome (or any Chromium-based browser)

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This outputs the built extension to the `dist/` directory.

For development with hot reload:

```bash
npm run dev
```

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project

The extension icon will appear in your Chrome toolbar.

### 4. Configure Groq

1. Navigate to your LinkedIn profile
2. Click the extension icon to open the side panel
3. Open **Settings** (gear icon)
4. Paste your Groq API key and select a model
5. Save

---

## Usage

1. Navigate to your LinkedIn profile (`linkedin.com/in/your-profile`)
2. Click the extension icon to open the side panel
3. Upload your resume (PDF, DOCX, or TXT)
4. Choose a mode: **Job Seeker** or **Visibility**
5. Enter your target role (e.g., "Senior Product Manager")
6. Optionally paste a job description to tailor suggestions further
7. Click **Analyze My Profile**
8. Wait for the pipeline to complete (parsing → scraping → analysis → optimization)
9. Review each suggested change in the diff viewer:
   - **Copy** — copies the optimized text to your clipboard; paste it into LinkedIn
   - **Edit** — modify the suggestion before copying
   - **Skip** — leave the section unchanged
10. See your summary of changes and keywords added

---

## Development

### Scripts

```bash
npm run dev        # Vite dev server with hot reload
npm run build      # Production build → dist/
npm run typecheck  # TypeScript type checking (no emit)
```

### Project Structure

```
src/
├── background/        # Service worker — pipeline orchestration, message routing
├── content/           # Content scripts — LinkedIn profile scraper
├── sidepanel/         # React UI — all screens and components
│   └── components/    # WelcomeScreen, AnalysisScreen, SectionReview, SummaryScreen, SettingsPanel
├── ai/                # AI provider abstraction (Groq)
├── parsers/           # Resume text extraction (PDF, DOCX, TXT) + AI structuring
├── optimizer/         # Gap analysis, prompt builders, pipeline runner, validator
└── shared/            # Types, messaging helpers, storage helpers, constants
```

### Tech Stack

| Layer | Technology |
|---|---|
| Extension framework | Chrome Manifest V3 + Side Panel API |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build | Vite 5 + CRXJS plugin |
| Validation | Zod |
| PDF parsing | pdf.js |
| DOCX parsing | mammoth.js |
| Diff rendering | diff.js |
| Testing | Playwright |

### Key Architecture Notes

- **Selector abstraction** — all LinkedIn DOM selectors live in `src/content/selectors.ts` with multiple fallbacks per element. When LinkedIn changes its markup, update selectors here.
- **AI provider interface** — add new providers by implementing the `AIProvider` interface in `src/ai/provider.ts`.
- **Section pipeline order** — Headline → About → Experience → Skills (highest impact first).
- **Copy-to-clipboard** — optimized text is copied to the user's clipboard via the Clipboard API; users paste changes into LinkedIn manually.

---

## Debugging & Troubleshooting

Open Chrome DevTools on the LinkedIn page and check the **Console** for content script logs. For service worker logs, go to `chrome://extensions`, find the extension, and click **Service Worker** to open its DevTools.

Storage state (sessions, settings, cache) can be inspected under **Application → Local Storage** in DevTools. Keys used:

| Key | Contents |
|---|---|
| `current_session` | Active optimization session |
| `user_settings` | AI provider config |
| `cached_profile` | Scraped LinkedIn profile (24h TTL) |
| `resume_draft` | Last-used resume + form state |

**Extension doesn't see my LinkedIn profile**
Make sure you're on your own profile page (`linkedin.com/in/...`) before starting the analysis.

**"Content script not ready" error**
Refresh the LinkedIn tab and try again. The content script needs to finish loading after LinkedIn's SPA navigation.

**Selectors broken / scraping returns empty data**
LinkedIn periodically changes its DOM structure. Open `src/content/selectors.ts` and update the selector arrays for whichever fields are failing.

---

## License

MIT
