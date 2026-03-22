import type { ResumeData, CurrentProfileData, GapAnalysis } from '../shared/types';
import { LinkedInSection } from '../shared/types';

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s+#]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function extractKeywords(resumeData: ResumeData): string[] {
  const text = [
    resumeData.summary ?? '',
    ...resumeData.workExperience.flatMap((w) => [w.description, ...w.bullets]),
    resumeData.skills.join(' '),
  ].join(' ');

  // Extract multi-word technical terms and single strong keywords
  const keywords = new Set<string>();
  resumeData.skills.forEach((s) => keywords.add(s.toLowerCase()));

  // Common tech/business keywords worth surfacing
  const techPattern =
    /\b(react|vue|angular|typescript|javascript|python|java|aws|azure|gcp|docker|kubernetes|ci\/cd|agile|scrum|sql|nosql|machine learning|deep learning|nlp|api|rest|graphql|microservices|devops|product management|ux|ui|data science|analytics|leadership|strategy)\b/gi;

  let match;
  while ((match = techPattern.exec(text)) !== null) {
    keywords.add(match[0].toLowerCase());
  }

  return Array.from(keywords).slice(0, 50);
}

export function runGapAnalysis(
  resumeData: ResumeData,
  profileData: CurrentProfileData
): GapAnalysis {
  const resumeKeywords = new Set(extractKeywords(resumeData));
  const profileText = [
    profileData.headline,
    profileData.about,
    ...profileData.experience.map((e) => e.description),
    profileData.skills.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  const profileTokens = tokenize(profileText);

  // Missing keywords: in resume but not in profile
  const missingKeywords = Array.from(resumeKeywords).filter(
    (kw) => !profileTokens.has(kw) && kw.length > 2
  );

  // Empty sections
  const emptySections: LinkedInSection[] = [];
  if (!profileData.headline || profileData.headline.length < 10)
    emptySections.push(LinkedInSection.Headline);
  if (!profileData.about || profileData.about.length < 50)
    emptySections.push(LinkedInSection.About);
  if (profileData.experience.length === 0)
    emptySections.push(LinkedInSection.Experience);
  if (profileData.skills.length === 0)
    emptySections.push(LinkedInSection.Skills);

  // Skill gaps: resume skills not on LinkedIn
  const profileSkillSet = new Set(
    profileData.skills.map((s) => s.toLowerCase())
  );
  const skillGaps = resumeData.skills
    .filter((s) => !profileSkillSet.has(s.toLowerCase()))
    .slice(0, 20);

  // Inconsistencies
  const inconsistencies: string[] = [];
  if (resumeData.workExperience.length > 0 && profileData.experience.length === 0) {
    inconsistencies.push('Resume has work experience but LinkedIn profile shows none');
  }
  const resumeJobCount = resumeData.workExperience.length;
  const profileJobCount = profileData.experience.length;
  if (Math.abs(resumeJobCount - profileJobCount) > 2) {
    inconsistencies.push(
      `Resume has ${resumeJobCount} jobs but LinkedIn shows ${profileJobCount} — some may be missing`
    );
  }

  // Recommendations
  const recommendations: string[] = [];
  if (emptySections.includes(LinkedInSection.About)) {
    recommendations.push('Add an About/Summary section — it significantly improves profile visibility');
  }
  if (skillGaps.length > 5) {
    recommendations.push(`Add ${skillGaps.length} missing skills from your resume to LinkedIn`);
  }
  if (missingKeywords.length > 10) {
    recommendations.push('Your LinkedIn profile is missing many keywords from your resume — update sections to include them');
  }

  return { missingKeywords, emptySections, skillGaps, inconsistencies, recommendations };
}
