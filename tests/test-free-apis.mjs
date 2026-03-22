/**
 * Tests multiple truly-free (no-API-key) providers for JSON resume extraction.
 * Run with: node tests/test-free-apis.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const PDF_PATH = new URL('../Burhan_Resume.pdf', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Extract PDF text ───────────────────────────────────────────────────────
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
console.log(`PDF extracted: ${rawText.length} chars\n`);

const SCHEMA = `{"fullName":"string","headline":"string","summary":"string or null","workExperience":[{"company":"string","title":"string","startDate":"YYYY","endDate":"YYYY or null","description":"string","bullets":["string"],"location":"string or null"}],"education":[{"institution":"string","degree":"string","field":"string","startDate":"YYYY","endDate":"YYYY"}],"skills":["string"],"certifications":[],"languages":[]}`;

const USER_PROMPT = `Extract this resume into JSON matching this schema exactly:\n${SCHEMA}\n\nResume:\n${rawText.slice(0, 5000)}`;
const SYSTEM_PROMPT = 'You are a resume parser. Output ONLY a valid JSON object, no explanation.';

function tryParseJson(text) {
  if (!text) return null;
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try extracting largest JSON object
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

async function test(label, fn) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Testing: ${label}`);
  console.log('─'.repeat(60));
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 60s')), 60000)),
    ]);
    const parsed = tryParseJson(result);
    if (parsed?.fullName) {
      console.log('✓ PASS');
      console.log('  fullName:', parsed.fullName);
      console.log('  headline:', parsed.headline);
      console.log('  skills:', parsed.skills?.slice(0, 5));
      console.log('  workExperience count:', parsed.workExperience?.length);
      return true;
    } else {
      console.log('✕ FAIL — could not extract valid JSON with fullName');
      console.log('  raw preview:', String(result).slice(0, 200));
      return false;
    }
  } catch (e) {
    console.log('✕ FAIL —', e.message);
    return false;
  }
}

// ── API 1: Pollinations POST (current) ─────────────────────────────────────
await test('Pollinations POST /openai (current)', async () => {
  const r = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: USER_PROMPT }],
      max_tokens: 4096,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  const d = await r.json();
  const msg = d.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '';
});

// ── API 2: Pollinations GET with json=true ─────────────────────────────────
await test('Pollinations GET ?json=true&model=openai', async () => {
  const prompt = encodeURIComponent(USER_PROMPT);
  const system = encodeURIComponent(SYSTEM_PROMPT);
  const r = await fetch(`https://text.pollinations.ai/${prompt}?json=true&model=openai&system=${system}`);
  return await r.text();
});

// ── API 3: Pollinations GET openai-large ──────────────────────────────────
await test('Pollinations GET ?json=true&model=openai-large', async () => {
  const prompt = encodeURIComponent(USER_PROMPT);
  const system = encodeURIComponent(SYSTEM_PROMPT);
  const r = await fetch(`https://text.pollinations.ai/${prompt}?json=true&model=openai-large&system=${system}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
});

// ── API 4: Pollinations GET mistral ───────────────────────────────────────
await test('Pollinations GET ?json=true&model=mistral', async () => {
  const prompt = encodeURIComponent(USER_PROMPT);
  const system = encodeURIComponent(SYSTEM_PROMPT);
  const r = await fetch(`https://text.pollinations.ai/${prompt}?json=true&model=mistral&system=${system}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
});

// ── API 5: Hugging Face (no key) ───────────────────────────────────────────
await test('HuggingFace Inference API (no key) — Phi-3.5-mini', async () => {
  const r = await fetch('https://api-inference.huggingface.co/models/microsoft/Phi-3.5-mini-instruct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: `<|system|>\n${SYSTEM_PROMPT}\n<|user|>\n${USER_PROMPT}\n<|assistant|>\n{`,
      parameters: { max_new_tokens: 2048, return_full_text: false },
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = Array.isArray(d) ? d[0]?.generated_text : d?.generated_text;
  return '{' + text;
});

console.log('\n\nDone.');
