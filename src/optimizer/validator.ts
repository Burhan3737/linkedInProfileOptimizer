import { z } from 'zod';
import type { ResumeData } from '../shared/types';

// ─── AI Output Schema ─────────────────────────────────────────────────────────

const OptimizationOutputSchema = z.object({
  optimized: z.string().min(1),
  reasoning: z.string().default(''),
  keywords: z.array(z.string()).default([]),
});

export type OptimizationOutput = z.infer<typeof OptimizationOutputSchema>;

// ─── Hallucination Check ──────────────────────────────────────────────────────

/**
 * Basic check: ensure claimed companies/institutions appear in source data.
 * Not exhaustive — just catches obvious fabrications.
 */
export function checkForHallucinations(
  optimized: string,
  resumeData: ResumeData
): string[] {
  const warnings: string[] = [];

  // Extract company names and institutions from resume
  const knownEntities = new Set([
    ...resumeData.workExperience.map((w) => w.company.toLowerCase()),
    ...resumeData.education.map((e) => e.institution.toLowerCase()),
    ...resumeData.skills.map((s) => s.toLowerCase()),
  ]);

  // Look for "at [Company]" or "for [Company]" patterns
  const companyPattern = /(?:at|for|with|@)\s+([A-Z][a-zA-Z\s&.,]+?)(?:\s*[,.]|\s+where|\s+as|\s*$)/g;
  let match;
  while ((match = companyPattern.exec(optimized)) !== null) {
    const mentioned = match[1].trim().toLowerCase();
    // Only warn if it looks like a specific company name (not generic words)
    if (mentioned.length > 3 && !isCommonWord(mentioned) && !knownEntities.has(mentioned)) {
      // Check if it's a substring match
      const hasPartialMatch = Array.from(knownEntities).some(
        (e) => e.includes(mentioned) || mentioned.includes(e)
      );
      if (!hasPartialMatch) {
        warnings.push(`Possible fabricated company/entity: "${match[1].trim()}"`);
      }
    }
  }

  return warnings;
}

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'this', 'that', 'these', 'those', 'my', 'our',
    'your', 'his', 'her', 'its', 'their', 'team', 'company', 'organization',
    'enterprise', 'clients', 'customers', 'stakeholders',
  ]);
  return commonWords.has(word.toLowerCase());
}

// ─── Parse + Validate AI response ────────────────────────────────────────────

export function parseOptimizationResponse(rawResponse: string): OptimizationOutput {
  // Strip markdown code fences
  const cleaned = rawResponse
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  // Try to extract JSON if there's surrounding text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in AI response: ${cleaned.slice(0, 200)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`Invalid JSON in AI response: ${jsonMatch[0].slice(0, 200)}`);
  }

  const result = OptimizationOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`);
  }

  return result.data;
}
