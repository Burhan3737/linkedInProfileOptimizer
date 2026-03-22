import type { CurrentProfileData, LinkedInExperience, LinkedInEducation } from '../shared/types';
import { SELECTORS, querySelector, querySelectorAll } from './selectors';

// ─── JSON-LD structured data (most reliable source) ───────────────────────────

interface JsonLdPerson {
  '@type'?: string;
  name?: string;
  jobTitle?: string;
  description?: string;
  url?: string;
  alumniOf?: Array<{ '@type': string; name: string }>;
  worksFor?: { '@type': string; name: string };
}

function extractJsonLd(): JsonLdPerson | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      // May be a single object or an array
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item?.['@type'] === 'Person' || item?.mainEntity?.['@type'] === 'Person') {
          const person = item['@type'] === 'Person' ? item : item.mainEntity;
          console.debug('[LI-Optimizer] JSON-LD Person found:', JSON.stringify(person).slice(0, 200));
          return person as JsonLdPerson;
        }
      }
    } catch { /* malformed JSON — skip */ }
  }
  console.debug('[LI-Optimizer] No JSON-LD Person data found');
  return null;
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function getText(selectors: readonly string[], root: Element | Document = document): string {
  const el = querySelector(selectors, root);
  return el?.textContent?.trim() ?? '';
}

/** All visible (aria-hidden) span text inside root, deduplicated, optionally filtered by min length */
function getAriaSpans(root: Element, minLen = 0): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of root.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')) {
    const t = s.textContent?.trim() ?? '';
    if (t.length >= minLen && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// ─── Find section root by anchor ID OR by section heading text ────────────────

/**
 * LinkedIn puts sections IDs either:
 *   (a) on a <div id="about"> anchor that immediately precedes the content, OR
 *   (b) on the <section> element itself (<section id="about">)
 * This helper returns the element whose content children contain the data.
 */
function findSectionContainer(anchorId: string): Element | null {
  const anchor = document.getElementById(anchorId);
  if (!anchor) return null;

  // Case (b): anchor IS the section/div with real content
  if (anchor.querySelector('span[aria-hidden="true"]') ||
      anchor.querySelector('li')) {
    return anchor;
  }

  // Case (a): anchor is a bare <div id="..."> — content is in the next meaningful sibling
  let sibling = anchor.nextElementSibling;
  while (sibling) {
    if (sibling.querySelector('span[aria-hidden="true"]') || sibling.querySelector('li')) {
      return sibling;
    }
    sibling = sibling.nextElementSibling;
  }

  // Case (c): anchor is inside a card — walk up to find the card, then use that
  const card = anchor.closest('section, div[data-view-name]');
  if (card && card !== anchor) return card;

  return null;
}

// ─── Headline ─────────────────────────────────────────────────────────────────

function scrapeHeadline(): string {
  // Strategy 1: element with data-field attribute
  const dataField = document.querySelector<HTMLElement>('[data-field="headline"]');
  if (dataField?.textContent?.trim()) {
    console.debug('[LI-Optimizer] headline via data-field:', dataField.textContent.trim().slice(0, 80));
    return dataField.textContent.trim();
  }

  // Strategy 2: look inside the top card — the headline is the FIRST .text-body-medium.break-words
  // that is NOT inside an h1 (the name element)
  const topCard = document.querySelector('.pv-text-details__left-panel, .ph5, .pv-top-card');
  if (topCard) {
    const name = topCard.querySelector('h1');
    for (const el of topCard.querySelectorAll<HTMLElement>('.text-body-medium.break-words, .text-body-medium')) {
      if (!name?.contains(el)) {
        const t = el.textContent?.trim() ?? '';
        // Reject if it looks like a location (contains · or is very short) — no, headlines can have ·
        // Reject if it looks like connections count
        if (t && !t.match(/^\d+\s+(connection|follower)/i)) {
          console.debug('[LI-Optimizer] headline via top-card .text-body-medium:', t.slice(0, 80));
          return t;
        }
      }
    }
  }

  // Strategy 3: global selectors fallback
  const result = getText(SELECTORS.headline);
  console.debug('[LI-Optimizer] headline via global selector:', result.slice(0, 80));
  return result;
}

// ─── About ────────────────────────────────────────────────────────────────────

const ABOUT_NOISE = new Set([
  'About', 'See more', 'See less', 'Show more', 'Show less', '…see more',
  'Contact info', 'Edit about section',
]);

function scrapeAbout(): string {
  const candidates: string[] = [];

  // Strategy 1: find the #about section container
  const container = findSectionContainer('about');
  if (container) {
    const spans = getAriaSpans(container, 40);
    const text = spans.filter((t) => !ABOUT_NOISE.has(t)).join(' ');
    if (text.length > 40) candidates.push(text);
  }

  // Strategy 2: global selectors
  for (const sel of SELECTORS.about) {
    try {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const t = el.textContent?.trim() ?? '';
        if (t.length > 40 && !ABOUT_NOISE.has(t)) candidates.push(t);
      }
    } catch { /* bad selector */ }
  }

  if (candidates.length === 0) {
    console.debug('[LI-Optimizer] about: no match found');
    return '';
  }

  // Return longest candidate (most complete about text)
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  console.debug('[LI-Optimizer] about:', best.slice(0, 100));
  return best;
}

// ─── Experience ───────────────────────────────────────────────────────────────

/** Extract title/company/duration/description from a single experience list item */
function parseExpItem(item: Element, index: number): LinkedInExperience | null {
  // Collect all aria-hidden span texts in document order
  const allSpans = Array.from(item.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
    .map((s) => s.textContent?.trim() ?? '')
    .filter((t) => t.length > 0);

  if (allSpans.length === 0) return null;

  // Strategy A: use CSS classes to identify title/company/duration
  const boldEl = item.querySelector<HTMLElement>('.t-bold span[aria-hidden="true"], .mr1 span[aria-hidden="true"]');
  const title = boldEl?.textContent?.trim() ?? allSpans[0] ?? '';

  // Company: first .t-normal (not .t-black--light) span that isn't the title
  let company = '';
  for (const el of item.querySelectorAll<HTMLElement>('.t-normal span[aria-hidden="true"]')) {
    const t = el.closest('.t-black--light') ? '' : el.textContent?.trim() ?? '';
    if (t && t !== title) {
      // Strip "· Full-time", "· Part-time", etc.
      company = t.replace(/\s*·\s*(Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '').trim();
      break;
    }
  }
  if (!company) company = allSpans[1] ?? '';

  // Duration: first .t-black--light span
  const durationEl = item.querySelector<HTMLElement>('.t-black--light span[aria-hidden="true"]');
  const duration = durationEl?.textContent?.trim() ?? '';

  // Description: spans longer than 40 chars that aren't title/company/duration
  const noiseSet = new Set([title, company, duration].filter(Boolean));
  const description = Array.from(item.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
    .map((s) => s.textContent?.trim() ?? '')
    .filter((t) => t.length > 40 && !noiseSet.has(t))
    .slice(0, 3)
    .join(' ');

  console.debug(`[LI-Optimizer] exp-${index}: title="${title}" company="${company}" duration="${duration}" descLen=${description.length}`);

  return {
    id: `exp-${index}`,
    title: title || 'Unknown Title',
    company: company || 'Unknown Company',
    duration,
    description,
  };
}

function scrapeExperience(): LinkedInExperience[] {
  const results: LinkedInExperience[] = [];

  // Find the experience section container
  const container = findSectionContainer('experience');
  console.debug('[LI-Optimizer] experience container:', container?.tagName, container?.id);

  // Get all top-level list items from the container
  let items: Element[] = [];
  if (container) {
    // Try direct list items first
    items = Array.from(container.querySelectorAll('li.pvs-list__item--line-separated, li.artdeco-list__item'));
    console.debug('[LI-Optimizer] experience items (container):', items.length);
  }

  // Global fallback selectors
  if (items.length === 0) {
    items = querySelectorAll(SELECTORS.experienceItems);
    console.debug('[LI-Optimizer] experience items (global selectors):', items.length);
  }

  for (const item of items.slice(0, 10)) {
    // Check if this is a "company group" (contains nested pvs-list items = multiple roles)
    const nestedItems = item.querySelectorAll('li.pvs-list__item--no-padding, li.pvs-list__item--no-padding-in-columns');
    if (nestedItems.length > 1) {
      // This is a company group — extract the company name from the parent item
      const groupCompanyEl = item.querySelector<HTMLElement>('.t-bold span[aria-hidden="true"], .mr1 span[aria-hidden="true"]');
      const groupCompany = groupCompanyEl?.textContent?.trim() ?? '';
      console.debug(`[LI-Optimizer] company group: "${groupCompany}" with ${nestedItems.length} roles`);

      // Parse each sub-role
      for (const subItem of Array.from(nestedItems).slice(0, 3)) {
        const exp = parseExpItem(subItem, results.length);
        if (exp) {
          // Use group company if sub-item couldn't determine it
          if (exp.company === 'Unknown Company' && groupCompany) exp.company = groupCompany;
          results.push(exp);
        }
        if (results.length >= 10) break;
      }
    } else {
      const exp = parseExpItem(item, results.length);
      if (exp) results.push(exp);
    }
    if (results.length >= 10) break;
  }

  console.debug(`[LI-Optimizer] experience scraped: ${results.length} items`);
  return results;
}

// ─── Education ────────────────────────────────────────────────────────────────

function scrapeEducation(): LinkedInEducation[] {
  const container = findSectionContainer('education');
  let items: Element[] = container
    ? Array.from(container.querySelectorAll('li.pvs-list__item--line-separated, li.artdeco-list__item'))
    : querySelectorAll(SELECTORS.educationItems);

  console.debug('[LI-Optimizer] education items found:', items.length);

  return items.slice(0, 5).map((item, index) => {
    const spans = Array.from(item.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
      .map((s) => s.textContent?.trim() ?? '')
      .filter(Boolean);

    // Bold span = school name, subsequent spans = degree, field, dates
    const boldEl = item.querySelector<HTMLElement>('.t-bold span[aria-hidden="true"]');
    const school = boldEl?.textContent?.trim() ?? spans[0] ?? '';

    const remaining = spans.filter((t) => t !== school);
    return {
      id: `edu-${index}`,
      school,
      degree: remaining[0] ?? '',
      field: remaining[1] ?? '',
      duration: remaining[2] ?? '',
    };
  });
}

// ─── Skills ───────────────────────────────────────────────────────────────────

// Patterns that are definitely not skill names
const SKILL_NOISE = /^(endorsement|endorsed by|connections? have|people have|show all|skills|see more|see less|show more|show less)$/i;

/** Extract skill name from a single skill list item — takes only the title span, not endorsement text */
function extractSkillName(item: Element): string {
  // The skill name is always in the first .t-bold span or .mr1 span inside the item
  const nameEl =
    item.querySelector<HTMLElement>('.t-bold span[aria-hidden="true"]') ??
    item.querySelector<HTMLElement>('.mr1 span[aria-hidden="true"]') ??
    item.querySelector<HTMLElement>('.hoverable-link-text span[aria-hidden="true"]') ??
    item.querySelector<HTMLElement>('.pvs-navigation__text span[aria-hidden="true"]') ??
    item.querySelector<HTMLElement>('span[aria-hidden="true"]'); // absolute fallback

  const t = nameEl?.textContent?.trim() ?? '';
  // Reject if it looks like endorsement text, a number, or section header
  if (!t || t.length < 2 || t.length > 80 || /^\d+$/.test(t) || SKILL_NOISE.test(t)) return '';
  return t;
}

/**
 * Find a section by looking for a heading element containing specific text.
 * Useful as a fallback when the section has no anchor ID.
 */
function findSectionByHeading(headingText: string): Element | null {
  // Look for h2/h3 elements with matching text, then walk up to the section/card
  for (const tag of ['h2', 'h3']) {
    for (const heading of document.querySelectorAll(tag)) {
      const text = heading.textContent?.trim() ?? '';
      if (text.toLowerCase() === headingText.toLowerCase()) {
        // Walk up to the enclosing section or card container
        const section = heading.closest('section, div.artdeco-card, div[data-view-name]');
        if (section) {
          console.debug(`[LI-Optimizer] found "${headingText}" section via <${tag}> heading`);
          return section;
        }
      }
    }
  }
  // Also check span-based headings (LinkedIn sometimes wraps heading text in spans)
  for (const span of document.querySelectorAll<HTMLElement>('span.pvs-header__title, span.t-bold')) {
    const text = span.textContent?.trim() ?? '';
    if (text.toLowerCase() === headingText.toLowerCase()) {
      const section = span.closest('section, div.artdeco-card, div[data-view-name]');
      if (section) {
        console.debug(`[LI-Optimizer] found "${headingText}" section via header span`);
        return section;
      }
    }
  }
  return null;
}

/** Collect skills from a container element, pushing into results/seen */
function collectSkillsFromContainer(
  container: Element,
  results: string[],
  seen: Set<string>,
  label: string
): void {
  // Try specific list item selectors first, then fall back to all li
  const itemSelectors = [
    'li.pvs-list__item--line-separated',
    'li.artdeco-list__item',
    'li.pvs-list__item--no-padding-in-columns',
    'li.pvs-list__pv-entry',
    'li',
  ];

  let items: NodeListOf<Element> | null = null;
  for (const sel of itemSelectors) {
    const found = container.querySelectorAll(sel);
    if (found.length > 0) {
      items = found;
      console.debug(`[LI-Optimizer] ${label}: matched "${sel}" → ${found.length} items`);
      break;
    }
  }

  if (!items) return;

  for (const item of items) {
    if (results.length >= 50) break;
    const skill = extractSkillName(item);
    if (skill && !seen.has(skill)) {
      seen.add(skill);
      results.push(skill);
    }
  }
}

function scrapeSkills(): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  // Strategy 1: find the skills section container via #skills anchor
  const container = findSectionContainer('skills');
  if (container) {
    console.debug('[LI-Optimizer] skills: found container via #skills anchor');
    collectSkillsFromContainer(container, results, seen, 'skills-anchor');
  }

  // Strategy 2: find by heading text (for when #skills anchor is missing)
  if (results.length === 0) {
    const headingContainer = findSectionByHeading('Skills');
    if (headingContainer) {
      collectSkillsFromContainer(headingContainer, results, seen, 'skills-heading');
    }
  }

  // Strategy 3: global selector fallback (targets specific list item class)
  if (results.length === 0) {
    const items = querySelectorAll([
      '#skills li.pvs-list__item--line-separated',
      '#skills li.artdeco-list__item',
      '#skills ~ div li.pvs-list__item--line-separated',
      '#skills ~ .pvs-list__outer-container li',
      'section:has(> div span.pvs-header__title) li.pvs-list__item--line-separated',
    ]);
    console.debug('[LI-Optimizer] skills global fallback items:', items.length);
    for (const item of items) {
      if (results.length >= 50) break;
      const skill = extractSkillName(item);
      if (skill && !seen.has(skill)) {
        seen.add(skill);
        results.push(skill);
      }
    }
  }

  // Strategy 4: look for skill pill/badge elements (newer card-based layouts)
  if (results.length === 0) {
    const pills = document.querySelectorAll<HTMLElement>(
      '[data-field="skill_card_skill_topic"] span[aria-hidden="true"], ' +
      '.skill-card-skill-topic span[aria-hidden="true"], ' +
      '.pv-skill-category-entity__name span[aria-hidden="true"]'
    );
    console.debug('[LI-Optimizer] skills pill fallback:', pills.length);
    for (const pill of pills) {
      if (results.length >= 50) break;
      const t = pill.textContent?.trim() ?? '';
      if (t && t.length >= 2 && t.length <= 80 && !SKILL_NOISE.test(t) && !seen.has(t)) {
        seen.add(t);
        results.push(t);
      }
    }
  }

  console.debug('[LI-Optimizer] skills found:', results.length, results.slice(0, 8));
  return results;
}

// ─── Skills detail page scrape (/details/skills/) ────────────────────────────

export function scrapeSkillsDetailPage(): string[] {
  if (!window.location.href.includes('/details/skills/')) return [];
  console.debug('[LI-Optimizer] scrapeSkillsDetailPage START');
  const seen = new Set<string>();
  const results: string[] = [];
  collectSkillsFromContainer(document.body, results, seen, 'skills-detail-page');
  console.debug('[LI-Optimizer] scrapeSkillsDetailPage found:', results.length);
  return results;
}

// ─── Full profile scrape ─────────────────────────────────────────────────────

export function scrapeFullProfile(): CurrentProfileData | null {
  if (!window.location.href.includes('linkedin.com/in/')) return null;

  console.debug('[LI-Optimizer] === scrapeFullProfile START ===');
  console.debug('[LI-Optimizer] URL:', window.location.href);
  console.debug('[LI-Optimizer] readyState:', document.readyState);

  const profileUrl = window.location.href.split('?')[0];

  // Try JSON-LD for the most reliable basic info
  const jsonLd = extractJsonLd();

  const fullName = jsonLd?.name || getText(SELECTORS.fullName);
  const headline = scrapeHeadline();
  const about = jsonLd?.description?.trim() && jsonLd.description.length > 20
    ? jsonLd.description
    : scrapeAbout();

  console.debug('[LI-Optimizer] name:', fullName);
  console.debug('[LI-Optimizer] headline:', headline.slice(0, 80));
  console.debug('[LI-Optimizer] about length:', about.length);

  const experience = scrapeExperience();
  const education = scrapeEducation();
  const skills = scrapeSkills();

  console.debug('[LI-Optimizer] === scrapeFullProfile DONE ===');
  console.debug('[LI-Optimizer] summary:', {
    fullName, headlineLen: headline.length, aboutLen: about.length,
    experienceCount: experience.length, educationCount: education.length, skillsCount: skills.length,
  });

  return {
    profileUrl, fullName, headline, about,
    experience, education, skills,
    certifications: [],
    scrapedAt: Date.now(),
  };
}

// ─── Selector health check ────────────────────────────────────────────────────

export function checkSelectorHealth(): Record<string, boolean> {
  const health = {
    jsonLd:     extractJsonLd() !== null,
    fullName:   !!querySelector(SELECTORS.fullName),
    headline:   scrapeHeadline().length > 0,
    about:      findSectionContainer('about') !== null,
    experience: findSectionContainer('experience') !== null,
    education:  findSectionContainer('education') !== null,
    skills:     findSectionContainer('skills') !== null,
  };
  console.debug('[LI-Optimizer] selector health:', health);
  return health;
}
