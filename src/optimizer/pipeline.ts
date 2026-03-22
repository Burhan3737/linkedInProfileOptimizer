import type { AIProvider } from '../ai/provider';
import type {
  ResumeData,
  CurrentProfileData,
  GapAnalysis,
  OptimizationResult,
  OptimizationMode,
} from '../shared/types';
import { LinkedInSection } from '../shared/types';
import { SECTION_PIPELINE } from '../shared/constants';
import { buildSystemPrompt, getSectionPrompt } from './prompts';
import { parseOptimizationResponse, checkForHallucinations } from './validator';

export interface PipelineProgressCallback {
  (section: LinkedInSection, sectionId: string | undefined, status: 'running' | 'done' | 'error', detail?: string): void;
}

export async function runOptimizationPipeline(
  resumeData: ResumeData,
  profileData: CurrentProfileData,
  gapAnalysis: GapAnalysis,
  provider: AIProvider,
  mode: OptimizationMode,
  targetRole: string,
  jobDescription: string | undefined,
  onProgress?: PipelineProgressCallback
): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = [];

  const systemPrompt = buildSystemPrompt(mode, targetRole);
  const ctx = { resumeData, profileData, gapAnalysis, targetRole, jobDescription };

  for (const section of SECTION_PIPELINE) {
    if (section === LinkedInSection.Experience) {
      // Process each experience item individually
      for (const exp of profileData.experience.slice(0, 5)) {
        onProgress?.(section, exp.id, 'running', `${exp.title} @ ${exp.company}`);
        try {
          const userPrompt = getSectionPrompt(section, ctx, {
            title: exp.title,
            company: exp.company,
            currentContent: exp.description,
          });

          const raw = await provider.generateCompletion({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            maxTokens: 1024,
            temperature: 0.7,
          });

          const output = parseOptimizationResponse(raw);
          const warnings = checkForHallucinations(output.optimized, resumeData);

          results.push({
            section,
            sectionId: exp.id,
            displayTitle: exp.title,
            displaySubtitle: exp.company,
            original: exp.description,
            optimized: output.optimized,
            reasoning: warnings.length > 0
              ? `${output.reasoning}\n\n⚠️ Warnings: ${warnings.join('; ')}`
              : output.reasoning,
            keywords: output.keywords,
            status: 'pending',
          });

          onProgress?.(section, exp.id, 'done');
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          onProgress?.(section, exp.id, 'error', error);
          results.push({
            section,
            sectionId: exp.id,
            displayTitle: exp.title,
            displaySubtitle: exp.company,
            original: exp.description,
            optimized: exp.description,
            reasoning: `Error: ${error}`,
            keywords: [],
            status: 'skipped',
          });
        }
      }
    } else {
      onProgress?.(section, undefined, 'running');
      try {
        const currentContent = getSectionCurrentContent(section, profileData);
        const userPrompt = getSectionPrompt(section, ctx, { currentContent });

        const raw = await provider.generateCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          maxTokens: section === LinkedInSection.About ? 2048 : 512,
          temperature: 0.7,
        });

        const output = parseOptimizationResponse(raw);
        const warnings = checkForHallucinations(output.optimized, resumeData);

        results.push({
          section,
          original: currentContent,
          optimized: output.optimized,
          reasoning: warnings.length > 0
            ? `${output.reasoning}\n\n⚠️ Warnings: ${warnings.join('; ')}`
            : output.reasoning,
          keywords: output.keywords,
          status: 'pending',
        });

        onProgress?.(section, undefined, 'done');
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        onProgress?.(section, undefined, 'error', error);
        results.push({
          section,
          original: getSectionCurrentContent(section, profileData),
          optimized: getSectionCurrentContent(section, profileData),
          reasoning: `Error: ${error}`,
          keywords: [],
          status: 'skipped',
        });
      }
    }
  }

  return results;
}

function getSectionCurrentContent(
  section: LinkedInSection,
  profileData: CurrentProfileData
): string {
  switch (section) {
    case LinkedInSection.Headline:
      return profileData.headline;
    case LinkedInSection.About:
      return profileData.about;
    case LinkedInSection.Skills:
      return profileData.skills.join(', ');
    default:
      return '';
  }
}
