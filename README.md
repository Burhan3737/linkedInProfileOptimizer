# LinkedIn Profile Optimizer

A free Chrome extension that reads your resume and suggests AI-powered improvements to your LinkedIn profile — section by section. You review every suggestion and copy what you like directly into LinkedIn.

---

## What does it do?

1. You upload your resume (PDF, Word, or plain text)
2. The extension reads your LinkedIn profile automatically
3. AI compares both and suggests improvements to your **Headline, About, Experience, and Skills** sections
4. You review each suggestion — accept, edit, or skip it
5. Click **Copy** and paste the text into LinkedIn yourself

No data is sent to any third-party service other than the AI provider you configure. Your resume and profile data stay in your browser.

---

## Before You Start — What You'll Need

- **Google Chrome** (or any Chrome-based browser like Edge or Brave)
- A free **Groq API key** — this powers the AI (no credit card required)
- About 10 minutes for the one-time setup

### Get your free Groq API key

1. Go to [console.groq.com](https://console.groq.com) and create a free account
2. Click **API Keys** in the left menu → **Create API key**
3. Copy the key and keep it handy — you'll paste it into the extension later

---

## Installation

Because this extension isn't on the Chrome Web Store yet, you'll install it manually. This takes a few extra steps, but it's straightforward — follow them in order.

### Step 1 — Install Node.js

Node.js is a free tool needed to build the extension once.

1. Go to [nodejs.org](https://nodejs.org/) and download the **LTS** version
2. Run the installer and follow the prompts (all defaults are fine)
3. When finished, open a **Terminal** (Mac/Linux) or **Command Prompt** (Windows) and type:

   ```
   node --version
   ```

   You should see a version number like `v20.x.x`. If you do, Node.js is installed correctly.

### Step 2 — Download this project

If you received this as a ZIP file, unzip it to a folder you can find easily (e.g., your Desktop or Documents).

If you're comfortable with Git:

```
git clone <repository-url>
cd linkedInOptimizer
```

### Step 3 — Build the extension

Open a Terminal / Command Prompt, navigate to the project folder, and run these two commands one at a time:

```
npm install
```

*(This downloads the required packages — may take a minute)*

```
npm run build
```

*(This creates the extension files in a folder called `dist/`)*

When it finishes you should see a `dist/` folder inside the project directory.

### Step 4 — Load the extension into Chrome

1. Open Chrome and go to this address in the address bar:

   ```
   chrome://extensions
   ```

2. In the top-right corner, turn on **Developer mode**

3. Click the **Load unpacked** button that appears

4. Browse to the project folder and select the **`dist`** folder inside it

5. The extension will appear in your list. You'll also see its icon in the Chrome toolbar (you may need to click the puzzle piece icon to pin it)

### Step 5 — Add your Groq API key

1. Go to your LinkedIn profile page (`linkedin.com/in/your-name`)
2. Click the extension icon in the toolbar to open the side panel
3. Click the **gear icon** (Settings) in the side panel
4. Paste your Groq API key into the field
5. Click **Save**

That's it — you're ready to use the extension.

---

## How to Use It

1. Go to your LinkedIn profile page (`linkedin.com/in/your-name`)
2. Click the extension icon to open the side panel
3. Upload your resume — drag it onto the upload area or click to browse. Supports **PDF, Word (.docx), and plain text (.txt)**
4. Choose your mode:
   - **Job Seeker** — best if you're actively applying to a specific role; optimizes heavily for that job title
   - **Visibility** — best for passively attracting recruiters; polishes your profile broadly
5. Type in your target role (e.g., `Senior Marketing Manager`)
6. Optionally paste a job description to get even more tailored suggestions
7. Click **Analyze My Profile** and wait about 30–60 seconds while the AI works
8. Review each suggestion:
   - **Copy** — copies the improved text to your clipboard; then go to LinkedIn and paste it in
   - **Edit** — make any tweaks before copying
   - **Skip** — keep your current text as-is
9. When done, a summary shows all the changes and new keywords added

---

## Tips

- **Run it on your own profile page** — the extension needs to be open on `linkedin.com/in/your-name` to read your profile
- **Start with Visibility mode** if you're unsure which to pick
- **You're always in control** — the extension never edits LinkedIn directly. You copy and paste every change yourself
- If you run it again within 24 hours, it reuses your cached profile to save time

---

## Troubleshooting

**The side panel doesn't open**
Make sure you're on your LinkedIn profile page, then click the extension icon.

**"Content script not ready" error**
Refresh your LinkedIn tab and try again. LinkedIn is a dynamic app and sometimes needs a moment to fully load.

**The extension doesn't detect my profile sections**
LinkedIn occasionally changes how their pages are built, which can affect scraping. Try refreshing the page. If the problem persists, [open an issue](../../issues).

**AI errors / rate limit messages**
The free Groq tier has usage limits. Wait a minute and try again, or check your API key is correct in Settings.

---

## For Developers

<details>
<summary>Click to expand developer notes</summary>

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

### Debugging

Open Chrome DevTools on the LinkedIn page and check the **Console** for content script logs. For service worker logs, go to `chrome://extensions`, find the extension, and click **Service Worker** to open its DevTools.

Storage state can be inspected under **Application → Local Storage** in DevTools.

</details>

---

## License

MIT
