import type { AIProvider } from '../ai/provider';
import type { ResumeData } from '../shared/types';
import { z } from 'zod';

// ─── Zod Schema ───────────────────────────────────────────────────────────────

// nullish() = optional() + nullable() — handles both undefined and null from AI
const WorkExperienceSchema = z.object({
  company: z.string().nullish().transform(v => v ?? ''),
  title: z.string(),
  startDate: z.string().nullish().transform(v => v ?? ''),
  endDate: z.string().nullish().transform(v => v ?? null),
  description: z.string().nullish().transform(v => v ?? ''),
  bullets: z.array(z.string()).nullish().transform(v => v ?? []),
  location: z.string().nullish().transform(v => v ?? undefined),
});

const EducationSchema = z.object({
  institution: z.string().nullish().transform(v => v ?? ''),
  degree: z.string(),
  field: z.string(),
  startDate: z.string().nullish().transform(v => v ?? ''),
  endDate: z.string().nullish().transform(v => v ?? ''),
  gpa: z.string().nullish().transform(v => v ?? undefined),
  activities: z.string().nullish().transform(v => v ?? undefined),
});

const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string(),
  date: z.string().nullish().transform(v => v ?? undefined),
});

const ResumeDataSchema = z.object({
  fullName: z.string().nullish().transform(v => v ?? undefined),
  headline: z.string().nullish().transform(v => v ?? undefined),
  summary: z.string().nullish().transform(v => v ?? undefined),
  workExperience: z.array(WorkExperienceSchema).nullish().transform(v => v ?? []),
  education: z.array(EducationSchema).nullish().transform(v => v ?? []),
  skills: z.array(z.string()).nullish().transform(v => v ?? []),
  certifications: z.array(CertificationSchema).nullish().transform(v => v ?? []),
  languages: z.array(z.string()).nullish().transform(v => v ?? undefined),
});

// ─── Text Extraction (must run in browser/sidepanel context, NOT service worker) ─

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (ext === 'pdf') {
    try {
      return await extractTextFromPDF(buffer);
    } catch (err) {
      console.error('[ResumeParser] PDF extraction failed:', err);
      throw new Error('Could not extract text from your PDF. Make sure it is not a scanned or image-only PDF — try re-saving as a text-based PDF, or convert it to DOCX or TXT.');
    }
  } else if (ext === 'docx' || ext === 'doc') {
    try {
      return await extractTextFromDOCX(buffer);
    } catch (err) {
      console.error('[ResumeParser] DOCX extraction failed:', err);
      throw new Error('Could not read your DOCX file. Try saving it as a PDF or plain text (.txt) file.');
    }
  } else {
    // Plain text / txt
    try {
      return new TextDecoder().decode(buffer);
    } catch (err) {
      console.error('[ResumeParser] Text decode failed:', err);
      throw new Error('Could not read the text file. Make sure it is a valid UTF-8 encoded .txt file.');
    }
  }
}

// Vite resolves this ?url import to the correct chrome-extension:// path at build time
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extractTextFromDOCX(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

// ─── AI Structuring (safe to run in service worker — only uses fetch) ─────────

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

export async function structureResumeText(rawText: string, provider: AIProvider): Promise<ResumeData> {
  const response = await provider.generateCompletion({
    messages: [
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\n${rawText.slice(0, 8000)}`,
      },
    ],
    maxTokens: 4096,
    temperature: 0.1,
  });

  const cleaned = response
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  // Try complete JSON first
  let jsonStr = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? null;

  // If no complete JSON found, the response was likely truncated mid-stream.
  // Attempt to recover by closing all open brackets/braces.
  if (!jsonStr && cleaned.trimStart().startsWith('{')) {
    jsonStr = repairTruncatedJson(cleaned);
  }

  if (!jsonStr) {
    console.error('[ResumeParser] No JSON in AI response. Preview:', cleaned.slice(0, 500));
    throw new Error('Resume parsing failed — the AI returned an unexpected response. Try again or switch to a different model in Settings.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    // Last-ditch: try the repair on whatever we matched
    try {
      parsed = JSON.parse(repairTruncatedJson(jsonStr));
    } catch (repairErr) {
      console.error('[ResumeParser] JSON parse failed:', parseErr, '| repair attempt also failed:', repairErr, '| raw:', jsonStr.slice(0, 500));
      throw new Error('Resume parsing failed — the AI response was malformed. Try again or switch to a different model in Settings.');
    }
  }

  const result = ResumeDataSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[ResumeParser] Schema validation failed:', result.error.message, '| parsed object:', parsed);
    throw new Error('Resume parsing failed — your resume had an unexpected structure. Try a simpler format or switch to a different model in Settings.');
  }

  return { ...result.data, rawText };
}

/**
 * Close any unclosed arrays/objects in a truncated JSON string.
 * e.g. '{"name":"John","skills":["js","ts"' → '{"name":"John","skills":["js","ts"]}'
 */
function repairTruncatedJson(str: string): string {
  // Remove trailing incomplete key/value (e.g. `,"incomp` or `, "partialKey":`)
  let s = str.trimEnd();
  // Strip trailing comma or partial token before closing
  s = s.replace(/,\s*$/, '').replace(/,\s*"[^"]*$/, '');

  // Count open braces and brackets
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Close any open strings first
  if (inString) s += '"';

  // Close open structures in reverse
  return s + stack.reverse().join('');
}
