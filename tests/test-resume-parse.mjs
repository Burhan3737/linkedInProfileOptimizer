/**
 * End-to-end local test — mirrors free.ts + resume-parser.ts logic exactly.
 * Run with: node tests/test-resume-parse.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const PDF_PATH = new URL('../Burhan_Resume.pdf', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Step 1: Extract PDF text (mirrors extractTextFromPDF) ─────────────────
console.log('Step 1: Extracting PDF text...');
const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF_PATH)) }).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const c = await page.getTextContent();
  pages.push(c.items.map(it => ('str' in it ? it.str : '')).join(' '));
}
const rawText = pages.join('\n\n');
console.log(`Extracted ${rawText.length} chars from ${pdf.numPages} page(s).\n`);

// ── Step 2: Build prompt (mirrors EXTRACTION_PROMPT in resume-parser.ts) ───
const EXTRACTION_PROMPT = `You are a resume parser. Extract structured data from the resume text below.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "fullName": "string or null",
  "headline": "one-line professional headline derived from their most recent role",
  "summary": "the summary/objective section text if present",
  "workExperience": [
    {
      "company": "string",
      "title": "string",
      "startDate": "YYYY-MM or YYYY",
      "endDate": "YYYY-MM or YYYY or null for current",
      "description": "full description paragraph",
      "bullets": ["bullet point 1", "bullet point 2"],
      "location": "city, state or remote"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "e.g. Bachelor of Science",
      "field": "e.g. Computer Science",
      "startDate": "YYYY",
      "endDate": "YYYY",
      "gpa": "optional",
      "activities": "optional"
    }
  ],
  "skills": ["skill1", "skill2"],
  "certifications": [
    { "name": "string", "issuer": "string", "date": "optional YYYY" }
  ],
  "languages": ["English", "Spanish"]
}

Resume text:`;

const SYSTEM = 'You are a structured data extraction API. Output ONLY a valid JSON object, no explanation.';
const userPrompt = `${EXTRACTION_PROMPT}\n\n${rawText.slice(0, 8000)}`;

// ── Step 3: Call API (mirrors FreeProvider.generateCompletion) ─────────────
const MAX_PROMPT_URL_CHARS = 12_000;
const safePrompt = userPrompt.length > MAX_PROMPT_URL_CHARS ? userPrompt.slice(0, MAX_PROMPT_URL_CHARS) : userPrompt;
const url =
  `https://text.pollinations.ai/${encodeURIComponent(safePrompt)}` +
  `?json=true&model=openai&system=${encodeURIComponent(SYSTEM)}` +
  `&seed=${Math.floor(Math.random() * 999999)}`;

console.log(`Step 2: Calling Pollinations GET API (prompt length: ${safePrompt.length})...`);
const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
console.log('HTTP status:', response.status);

if (!response.ok) {
  console.error('✕ HTTP error:', response.status, await response.text());
  process.exit(1);
}

const text = await response.text();
console.log(`Response length: ${text.length}`);
console.log('Response preview (first 200):', text.slice(0, 200));

// ── Step 4: Parse JSON (mirrors resume-parser.ts structureResumeText) ──────
console.log('\nStep 3: Parsing JSON...');

// Strip markdown fences if present (same as resume-parser.ts)
const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
const jsonStr = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? null;

if (!jsonStr) {
  console.error('✕ No JSON object found in response');
  process.exit(1);
}

try {
  const parsed = JSON.parse(jsonStr);
  console.log('\n✓ SUCCESS — Full parsed result:');
  console.log('  fullName:', parsed.fullName);
  console.log('  headline:', parsed.headline);
  console.log('  summary (first 80):', parsed.summary?.slice(0, 80));
  console.log('  skills:', parsed.skills);
  console.log('  workExperience:');
  parsed.workExperience?.forEach((w, i) =>
    console.log(`    [${i}] ${w.title} @ ${w.company} (${w.startDate}–${w.endDate ?? 'present'})`));
  console.log('  education:');
  parsed.education?.forEach((e, i) =>
    console.log(`    [${i}] ${e.degree} ${e.field} @ ${e.institution}`));
  console.log('\n✓ Test PASSED — extension should work after reload.');
} catch (e) {
  console.error('✕ JSON.parse FAILED:', e.message);
  console.error('  jsonStr preview:', jsonStr?.slice(0, 400));
  process.exit(1);
}
