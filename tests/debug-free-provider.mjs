/**
 * Debug script: calls Pollinations API directly and prints raw response fields.
 * Run with: node tests/debug-free-provider.mjs
 */

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const FREE_MODEL = 'openai';

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

const SAMPLE_RESUME = `
Muhammad Burhan Tahir
Senior Software Engineer
Email: burhan@example.com | LinkedIn: linkedin.com/in/buhrantahir

EXPERIENCE
Senior Software Engineer | TekTracking | 2021 - Present
- Developed microservices architecture using Node.js and TypeScript
- Led a team of 5 engineers to deliver a tracking platform

Software Engineer | ABC Corp | 2018 - 2021
- Built REST APIs with Python/Django
- Improved query performance by 40%

EDUCATION
BS Computer Science | University of Engineering | 2014 - 2018

SKILLS
JavaScript, TypeScript, Node.js, Python, React, SQL
`;

const systemMessage = {
  role: 'system',
  content:
    'You are a structured data extraction API. Respond with a single valid JSON object only. ' +
    'Start your response with { and end with }. No text, explanation, or markdown outside the JSON.',
};

const userMessage = {
  role: 'user',
  content: `${EXTRACTION_PROMPT}\n\n${SAMPLE_RESUME}`,
};

const prefillMessage = { role: 'assistant', content: '{' };

const messages = [systemMessage, userMessage, prefillMessage];

console.log('Calling Pollinations API...\n');

const response = await fetch(POLLINATIONS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: FREE_MODEL,
    messages,
    max_tokens: 2048,
    temperature: 0.1,
  }),
  signal: AbortSignal.timeout(120_000),
});

console.log('HTTP status:', response.status);
const data = await response.json();
const msg = data.choices?.[0]?.message;

console.log('\n--- RAW FIELDS ---');
console.log('content field:');
console.log(JSON.stringify(msg?.content));
console.log('\nreasoning_content field:');
console.log(JSON.stringify(msg?.reasoning_content?.slice(0, 500)));
console.log('\n--- END RAW FIELDS ---\n');

// Simulate current code logic (after fix)
const content = msg?.content;
const reasoning = msg?.reasoning_content;
const raw = (typeof content === 'string' && content.length > 0)
  ? content
  : (typeof reasoning === 'string' && reasoning.length > 0 ? reasoning : null);

console.log('Selected raw (after fix):', JSON.stringify(raw?.slice(0, 300)));

const finalStr = raw?.trimStart().startsWith('{') ? raw : '{' + raw;
console.log('\nFinal string for JSON.parse (first 300 chars):');
console.log(finalStr?.slice(0, 300));

try {
  const parsed = JSON.parse(finalStr);
  console.log('\n✓ JSON.parse succeeded!');
  console.log('fullName:', parsed.fullName);
  console.log('headline:', parsed.headline);
} catch (e) {
  console.log('\n✕ JSON.parse FAILED:', e.message);
}
