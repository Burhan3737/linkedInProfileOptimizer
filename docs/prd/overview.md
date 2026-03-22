# Product Overview

## Vision
LinkedIn Profile Optimizer is a Chrome extension that bridges the gap between a user's resume and their LinkedIn presence. Users upload their resume, the extension reads their current LinkedIn profile, AI generates section-by-section improvements, and users review diffs before changes are applied directly to LinkedIn.

## Target Personas

| Persona | Goal | Mode |
|---------|------|------|
| **Active Job Seeker** | Land interviews by optimizing for ATS and specific role keywords | Job Seeker Mode |
| **Passive Candidate** | Improve recruiter visibility without over-tailoring | Visibility Mode |

## Core Pipeline (MVP)

```
1. User uploads resume (PDF/DOCX/TXT)
2. Extension parses resume → structured ResumeData via AI
3. User navigates to their LinkedIn profile
4. Content script scrapes current profile → CurrentProfileData
5. Gap analysis: compare resume vs profile
6. AI generates optimized content for each section
7. User reviews diffs section by section (approve / edit / skip)
8. Approved changes injected into LinkedIn's DOM
9. Summary screen shows results
```

## Sections Optimized (Phase 1)
1. **Headline** — 220 char max, keyword-rich
2. **About/Summary** — 2600 char max, narrative + keywords
3. **Experience** — Bullet-point optimization per role
4. **Skills** — Gap-fill from resume

## Tech Stack
- Chrome MV3 + Side Panel API
- React 18 + TypeScript + Tailwind CSS
- Vite + CRXJS plugin
- Groq API (primary, free tier) — llama-3.1-8b-instant, llama-3.3-70b-versatile
- pdfjs-dist, mammoth for parsing
- Zod for validation
- diff library for side-by-side review
