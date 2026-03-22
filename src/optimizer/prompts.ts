import type { ResumeData, CurrentProfileData, GapAnalysis } from '../shared/types';
import { LinkedInSection } from '../shared/types';
import type { OptimizationMode } from '../shared/types';

// ─── Base System Prompt ───────────────────────────────────────────────────────

export function buildSystemPrompt(mode: OptimizationMode, targetRole: string): string {
  const modeDesc =
    mode === 'job_seeker'
      ? `You are optimizing for a JOB SEEKER targeting: "${targetRole}".
         Aggressively optimize for keyword density, ATS systems, and recruiter attention.
         Make each section clearly showcase relevance to the target role.`
      : `You are optimizing for PASSIVE VISIBILITY (broad recruiter discovery).
         Polish the profile professionally, highlight strengths, and improve discoverability
         across a range of related roles. Do not over-tailor to one specific role.`;

  return `You are an expert LinkedIn profile optimizer and career coach.
${modeDesc}

Rules:
- Return ONLY valid JSON — no markdown, no preamble, no explanation outside JSON
- Never fabricate experience, credentials, or skills not present in the source material
- Preserve factual accuracy — you may rephrase, restructure, and strengthen, but not invent
- Use strong action verbs and quantifiable results where the data supports it
- Match LinkedIn's character limits (headline: 220 chars, about: 2600 chars)
- Write in first person for About section, third person for experience bullets
- Use industry-standard keywords naturally — avoid keyword stuffing`;
}

// ─── Section Prompt Builders ──────────────────────────────────────────────────

interface SectionPromptContext {
  resumeData: ResumeData;
  profileData: CurrentProfileData;
  gapAnalysis: GapAnalysis;
  targetRole: string;
  jobDescription?: string;
}

function buildJobDescContext(jobDesc?: string): string {
  if (!jobDesc) return '';
  return `\n\nTarget Job Description:\n${jobDesc.slice(0, 1500)}`;
}

function buildResponseSchema(contentDescription: string): string {
  return `{
  "optimized": "${contentDescription}",
  "reasoning": "brief explanation of key improvements made",
  "keywords": ["keyword1", "keyword2"]
}`;
}

export function buildHeadlinePrompt(ctx: SectionPromptContext): string {
  return `Optimize this LinkedIn headline.

Current headline: "${ctx.profileData.headline || '(empty)'}"
Resume data: ${ctx.resumeData.headline ?? 'N/A'}
Target role: ${ctx.targetRole}
Missing keywords: ${ctx.gapAnalysis.missingKeywords.slice(0, 10).join(', ')}
${buildJobDescContext(ctx.jobDescription)}

Return JSON:
${buildResponseSchema('optimized headline string under 220 characters')}`;
}

export function buildAboutPrompt(ctx: SectionPromptContext): string {
  const recentJobs = ctx.resumeData.workExperience
    .slice(0, 2)
    .map((w) => `${w.title} at ${w.company}: ${w.bullets.slice(0, 2).join('; ')}`)
    .join('\n');

  return `Optimize this LinkedIn About/Summary section.

Current about: "${ctx.profileData.about || '(empty)'}"
Resume summary: "${ctx.resumeData.summary ?? 'none'}"
Recent experience: ${recentJobs}
Skills: ${ctx.resumeData.skills.slice(0, 15).join(', ')}
Target role: ${ctx.targetRole}
Missing keywords: ${ctx.gapAnalysis.missingKeywords.slice(0, 15).join(', ')}
${buildJobDescContext(ctx.jobDescription)}

Write a compelling 3-4 paragraph About section. Max 2600 characters.
Return JSON:
${buildResponseSchema('full about section text')}`;
}

export function buildExperiencePrompt(
  ctx: SectionPromptContext,
  currentDescription: string,
  jobTitle: string,
  company: string
): string {
  // Find matching resume experience
  const matching = ctx.resumeData.workExperience.find(
    (w) =>
      w.company.toLowerCase().includes(company.toLowerCase()) ||
      company.toLowerCase().includes(w.company.toLowerCase())
  );

  const resumeBullets = matching
    ? matching.bullets.slice(0, 5).join('\n- ')
    : '(no matching resume data found)';

  return `Optimize this LinkedIn experience entry.

Job: "${jobTitle}" at "${company}"
Current LinkedIn description: "${currentDescription || '(empty)'}"
Resume bullets for this role: ${resumeBullets}
Target role: ${ctx.targetRole}
Missing keywords: ${ctx.gapAnalysis.missingKeywords.slice(0, 10).join(', ')}
${buildJobDescContext(ctx.jobDescription)}

Write 3-5 strong bullet points starting with action verbs. Include metrics where available.
Return JSON:
${buildResponseSchema('bullet points joined with \\n, each starting with •')}`;
}

export function buildSkillsPrompt(ctx: SectionPromptContext): string {
  return `Optimize LinkedIn skills section.

Current LinkedIn skills: ${ctx.profileData.skills.slice(0, 20).join(', ') || '(none)'}
Resume skills: ${ctx.resumeData.skills.join(', ')}
Skill gaps (in resume, not on LinkedIn): ${ctx.gapAnalysis.skillGaps.slice(0, 20).join(', ')}
Target role: ${ctx.targetRole}
${buildJobDescContext(ctx.jobDescription)}

Return the optimal list of skills to have on LinkedIn (max 30).
Return JSON:
${buildResponseSchema('comma-separated list of skills to add')}`;
}

// ─── Section Prompt Router ────────────────────────────────────────────────────

export function getSectionPrompt(
  section: LinkedInSection,
  ctx: SectionPromptContext,
  sectionMeta?: { title?: string; company?: string; currentContent?: string }
): string {
  switch (section) {
    case LinkedInSection.Headline:
      return buildHeadlinePrompt(ctx);
    case LinkedInSection.About:
      return buildAboutPrompt(ctx);
    case LinkedInSection.Experience:
      return buildExperiencePrompt(
        ctx,
        sectionMeta?.currentContent ?? '',
        sectionMeta?.title ?? 'Unknown',
        sectionMeta?.company ?? 'Unknown'
      );
    case LinkedInSection.Skills:
      return buildSkillsPrompt(ctx);
    default:
      throw new Error(`No prompt builder for section: ${section}`);
  }
}
