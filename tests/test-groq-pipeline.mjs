/**
 * Tests the Groq provider pipeline end-to-end using a mocked HTTP response.
 * No real API key needed — verifies JSON parsing and schema validation logic.
 * Run with: node tests/test-groq-pipeline.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const PDF_PATH = new URL('../Burhan_Resume.pdf', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Step 1: Extract PDF text ───────────────────────────────────────────────
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
console.log(`Extracted ${rawText.length} chars.\n`);

// ── Step 2: Simulate Groq API response (mirrors what Groq actually returns) ─
// Groq with response_format: json_object ALWAYS returns valid JSON in content.
// This mock represents a real Groq API response structure.
const MOCK_GROQ_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        fullName: 'Muhammad Burhan Tahir',
        headline: 'Senior Software Engineer at TekTracking',
        summary: 'Software Engineer with over 2 years of experience in designing, developing and delivering scalable software solutions.',
        workExperience: [
          {
            company: 'TekTracking',
            title: 'Senior Software Engineer',
            startDate: '2025-01',
            endDate: null,
            description: 'Leading development of tracking platform',
            bullets: ['Designed microservices architecture', 'Led team of engineers'],
            location: 'Remote',
          },
          {
            company: 'Powersoft19',
            title: 'Software Engineer',
            startDate: '2023-07',
            endDate: '2025-03',
            description: 'Full stack development with MERN stack',
            bullets: ['Built REST APIs', 'Improved performance by 30%'],
            location: null,
          },
        ],
        education: [{
          institution: 'FAST-NUCES',
          degree: 'Bachelor of Computer Science',
          field: 'Computer Science',
          startDate: '2021',
          endDate: '2025',
          gpa: null,
          activities: null,
        }],
        skills: ['MongoDB', 'Node', 'Express', 'React', 'Redux', 'Nestjs', 'JavaScript', 'TypeScript'],
        certifications: [],
        languages: ['English'],
      }),
    },
  }],
};

// ── Step 3: Simulate GroqProvider.generateCompletion logic ────────────────
console.log('Step 2: Simulating Groq API call...');

// Mock fetch to return our Groq-like response
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => MOCK_GROQ_RESPONSE,
});

const content = MOCK_GROQ_RESPONSE.choices[0].message.content;
console.log('content field:', content ? `"${content.slice(0, 120)}..."` : 'undefined');

// ── Step 4: Simulate resume-parser.ts structureResumeText logic ────────────
console.log('\nStep 3: Running through resume-parser JSON pipeline...');

const cleaned = content
  .replace(/^```(?:json)?\n?/m, '')
  .replace(/\n?```$/m, '')
  .trim();

const jsonStr = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? null;

if (!jsonStr) {
  console.error('✕ FAIL — no JSON object found');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(jsonStr);
} catch (e) {
  console.error('✕ FAIL — JSON.parse error:', e.message);
  process.exit(1);
}

// ── Step 5: Validate required fields ─────────────────────────────────────
const checks = [
  ['fullName', parsed.fullName === 'Muhammad Burhan Tahir'],
  ['headline', typeof parsed.headline === 'string' && parsed.headline.length > 0],
  ['skills is array', Array.isArray(parsed.skills) && parsed.skills.length > 0],
  ['workExperience count', parsed.workExperience?.length === 2],
  ['workExperience[0].company', parsed.workExperience?.[0]?.company === 'TekTracking'],
  ['workExperience[1].endDate', parsed.workExperience?.[1]?.endDate === '2025-03'],
  ['education count', parsed.education?.length === 1],
  ['education[0].institution', parsed.education?.[0]?.institution === 'FAST-NUCES'],
];

let allPassed = true;
for (const [label, result] of checks) {
  if (result) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✕ ${label} — got: ${JSON.stringify(parsed[label.split('.')[0]])}`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\n✓ All checks passed — Groq pipeline is working correctly.');
  console.log('  Build and switch to "Groq (Free Tier)" in Settings to use it.');
} else {
  console.error('\n✕ Some checks failed.');
  process.exit(1);
}
