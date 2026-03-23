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
  // Require li items — a bare anchor with only a heading span is not a real container
  if (anchor.querySelector('li')) {
    return anchor;
  }
  if (anchor.querySelector('span[aria-hidden="true"]') && anchor.tagName === 'SECTION') {
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
  // Strategy 1: data-field attribute (own profile edit view)
  const dataField = document.querySelector<HTMLElement>('[data-field="headline"]');
  if (dataField?.textContent?.trim()) {
    console.debug('[LI-Optimizer] headline via data-field:', dataField.textContent.trim().slice(0, 80));
    return dataField.textContent.trim();
  }

  // Strategy 2: structural — find h1 (name), then get the first sibling element
  // with meaningful text. This works on both own and other profiles regardless
  // of class name changes.
  const h1 = document.querySelector<HTMLElement>('main h1, h1.text-heading-xlarge, .scaffold-layout__main h1, h1');
  if (h1) {
    // Walk siblings after h1 within the same parent container
    let sibling = h1.nextElementSibling as HTMLElement | null;
    while (sibling) {
      const t = sibling.textContent?.trim() ?? '';
      // Skip: empty, connection/follower counts, very short (location line)
      if (t.length > 10 && !t.match(/^\d+\s+(connection|follower)/i) && !sibling.querySelector('h1')) {
        console.debug('[LI-Optimizer] headline via h1-sibling:', t.slice(0, 80));
        return t;
      }
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }
  }

  // Strategy 3: top card class-based selectors
  const topCard = document.querySelector('.pv-text-details__left-panel, .ph5, .pv-top-card');
  if (topCard) {
    const name = topCard.querySelector('h1');
    for (const el of topCard.querySelectorAll<HTMLElement>('.text-body-medium.break-words, .text-body-medium')) {
      if (!name?.contains(el)) {
        const t = el.textContent?.trim() ?? '';
        if (t && !t.match(/^\d+\s+(connection|follower)/i)) {
          console.debug('[LI-Optimizer] headline via top-card .text-body-medium:', t.slice(0, 80));
          return t;
        }
      }
    }
  }

  // Strategy 4: global selectors fallback
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

  function extractFromContainer(container: Element): string {
    // Collect all aria-hidden spans — use minLen=2 to avoid over-filtering
    // sentence fragments that together form the about text
    const spans = getAriaSpans(container, 2);
    return spans.filter((t) => !ABOUT_NOISE.has(t)).join(' ').trim();
  }

  // Strategy 1: #about anchor (own profile, some other profiles)
  const anchorContainer = findSectionContainer('about');
  if (anchorContainer) {
    const text = extractFromContainer(anchorContainer);
    if (text.length > 40) candidates.push(text);
  }

  // Strategy 2: heading-based lookup — most reliable for other profiles
  // where #about anchor ID is absent
  if (candidates.length === 0 || candidates[0].length < 80) {
    const headingContainer = findSectionByHeading('About');
    if (headingContainer && headingContainer !== anchorContainer) {
      const text = extractFromContainer(headingContainer);
      if (text.length > 40) candidates.push(text);
    }
  }

  // Strategy 3: inline-show-more-text component anywhere on page
  // (LinkedIn uses this for expandable about text in both own and other profiles)
  if (candidates.length === 0) {
    for (const el of document.querySelectorAll<HTMLElement>('.inline-show-more-text')) {
      const t = el.textContent?.trim() ?? '';
      if (t.length > 40 && !ABOUT_NOISE.has(t)) candidates.push(t);
    }
  }

  // Strategy 4: global selectors fallback
  if (candidates.length === 0) {
    for (const sel of SELECTORS.about) {
      try {
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          const t = el.textContent?.trim() ?? '';
          if (t.length > 40 && !ABOUT_NOISE.has(t)) candidates.push(t);
        }
      } catch { /* bad selector */ }
    }
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
  let container = findSectionContainer('experience');
  console.debug('[LI-Optimizer] experience container:', container?.tagName, container?.id);

  // Get all top-level list items from the container
  let items: Element[] = [];
  if (container) {
    items = Array.from(container.querySelectorAll('li.pvs-list__item--line-separated, li.artdeco-list__item'));
    console.debug('[LI-Optimizer] experience items (container):', items.length);
  }

  // Global fallback selectors
  if (items.length === 0) {
    items = querySelectorAll(SELECTORS.experienceItems);
    console.debug('[LI-Optimizer] experience items (global selectors):', items.length);
  }

  // Heading-based fallback — handles cases where #experience is a bare anchor
  // div and the real content is in a separate <section> with no id
  if (items.length === 0) {
    const headingContainer = findSectionByHeading('Experience');
    if (headingContainer) {
      container = headingContainer;
      items = Array.from(headingContainer.querySelectorAll(
        'li.pvs-list__item--line-separated, li.artdeco-list__item, li.pvs-list__item--no-padding'
      ));
      console.debug('[LI-Optimizer] experience items (heading fallback):', items.length);
    }
  }

  // Broadest fallback: any <section> whose h2 mentions "Experience"
  if (items.length === 0) {
    for (const section of document.querySelectorAll('section')) {
      const heading = section.querySelector('h2, h3');
      const text = heading?.textContent?.trim().toLowerCase() ?? '';
      if (text === 'experience' || text === 'experienceexperience') {
        items = Array.from(section.querySelectorAll('li'));
        console.debug('[LI-Optimizer] experience items (section-heading broadest):', items.length);
        if (items.length > 0) break;
      }
    }
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
  // Note: LinkedIn doubles heading text (visible + sr-only), so use includes()
  const needle = headingText.toLowerCase();
  for (const tag of ['h2', 'h3']) {
    for (const heading of document.querySelectorAll(tag)) {
      const text = heading.textContent?.trim().toLowerCase() ?? '';
      if (text === needle || text === needle + needle) {
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
    const text = span.textContent?.trim().toLowerCase() ?? '';
    if (text === needle || text === needle + needle) {
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

// ─── Detail page scrapers (/details/...) ──────────────────────────────────────
// These pages have a simpler, more consistent DOM than the main profile page.
// They work identically for your own profile and other people's profiles.

export function scrapeSkillsDetailPage(): string[] {
  if (!window.location.href.includes('/details/skills/')) return [];
  console.debug('[LI-Optimizer] scrapeSkillsDetailPage START');
  const seen = new Set<string>();
  const results: string[] = [];
  collectSkillsFromContainer(document.body, results, seen, 'skills-detail-page');
  console.debug('[LI-Optimizer] scrapeSkillsDetailPage found:', results.length);
  return results;
}

export function scrapeExperienceDetailPage(): LinkedInExperience[] {
  if (!window.location.href.includes('/details/experience/')) return [];
  console.debug('[LI-Optimizer] scrapeExperienceDetailPage START');

  const results: LinkedInExperience[] = [];

  // On the detail page, experience items are top-level list items
  const itemSelectors = [
    'li.pvs-list__item--line-separated',
    'li.artdeco-list__item',
    'li.pvs-list__pv-entry',
  ];

  let items: Element[] = [];
  for (const sel of itemSelectors) {
    items = Array.from(document.querySelectorAll(sel));
    if (items.length > 0) {
      console.debug(`[LI-Optimizer] exp-detail: matched "${sel}" → ${items.length} items`);
      break;
    }
  }

  for (const item of items.slice(0, 10)) {
    // Check for company group (multiple roles under one company)
    const nestedItems = item.querySelectorAll('li.pvs-list__item--no-padding, li.pvs-list__item--no-padding-in-columns');
    if (nestedItems.length > 1) {
      const groupCompanyEl = item.querySelector<HTMLElement>('.t-bold span[aria-hidden="true"], .mr1 span[aria-hidden="true"]');
      const groupCompany = groupCompanyEl?.textContent?.trim() ?? '';
      for (const subItem of Array.from(nestedItems).slice(0, 5)) {
        const exp = parseExpItem(subItem, results.length);
        if (exp) {
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

  console.debug('[LI-Optimizer] scrapeExperienceDetailPage found:', results.length);
  return results;
}

// ─── Scroll to trigger lazy loading ──────────────────────────────────────────

/**
 * Scrolls to the top of the page, then scrolls down in steps to trigger
 * LinkedIn's lazy-loaded sections, then returns to the top.
 * Always starts from the top for a consistent reference point.
 */
async function scrollToLoadAllSections(): Promise<void> {
  // Always start from top for a consistent reference point
  window.scrollTo({ top: 0, behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 300));

  const viewportHeight = window.innerHeight;
  const step = Math.floor(viewportHeight * 0.7);
  console.debug('[LI-Optimizer] scrollToLoad: starting from top, step=', step);

  // Scroll down in steps — re-check scrollHeight each iteration since
  // lazy-loaded content extends the page as sections render
  let pos = 0;
  let prevHeight = 0;
  for (let i = 0; i < 40; i++) {  // safety cap
    pos += step;
    window.scrollTo({ top: pos, behavior: 'auto' });
    await new Promise((r) => setTimeout(r, 300));

    const curHeight = document.documentElement.scrollHeight;
    if (pos >= curHeight && curHeight === prevHeight) break;
    prevHeight = curHeight;
  }

  // Final pause at the bottom to catch anything remaining
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 400));

  // Click "see more" expand buttons to reveal truncated About text
  const expandButtons = document.querySelectorAll<HTMLElement>(
    'button.inline-show-more-text__button, ' +
    'button[aria-label*="see more"], ' +
    'button[aria-label*="Show more"]'
  );
  for (const btn of expandButtons) {
    try { btn.click(); } catch { /* ignore */ }
  }
  if (expandButtons.length > 0) {
    console.debug(`[LI-Optimizer] scrollToLoad: clicked ${expandButtons.length} "see more" buttons`);
    await new Promise((r) => setTimeout(r, 300));
  }

  // Return to top so headline/about are in view when we scrape
  window.scrollTo({ top: 0, behavior: 'auto' });
  await new Promise((r) => setTimeout(r, 200));
  console.debug('[LI-Optimizer] scrollToLoad: done, back at top');
}

// ─── Top-card scrape (headline + about, no scrolling) ────────────────────────
// Used when the profile page is opened as a background tab — we only need the
// top-card data (name, headline, about). Skills and experience come from their
// own detail pages. No scroll needed since these are always above the fold.

export async function scrapeTopCard(): Promise<CurrentProfileData | null> {
  if (!window.location.href.includes('linkedin.com/in/')) return null;

  console.debug('[LI-Optimizer] scrapeTopCard START, url:', window.location.href);

  // Click "see more" on the About section to get full untruncated text
  const expandButtons = document.querySelectorAll<HTMLElement>(
    'button.inline-show-more-text__button, button[aria-label*="see more"]'
  );
  for (const btn of expandButtons) {
    try { btn.click(); } catch { /* ignore */ }
  }
  if (expandButtons.length > 0) {
    await new Promise((r) => setTimeout(r, 400));
  }

  const profileUrl = window.location.href.split('?')[0];
  const jsonLd = extractJsonLd();

  const fullName = jsonLd?.name || getText(SELECTORS.fullName);
  const headline = (jsonLd?.jobTitle?.trim() && jsonLd.jobTitle.length > 2)
    ? jsonLd.jobTitle.trim()
    : scrapeHeadline();
  const jsonLdAbout = jsonLd?.description?.trim() ?? '';
  const domAbout = scrapeAbout();
  const about = domAbout.length > jsonLdAbout.length ? domAbout : jsonLdAbout;

  console.debug('[LI-Optimizer] scrapeTopCard:', { fullName, headlineLen: headline.length, aboutLen: about.length });

  return {
    profileUrl, fullName, headline, about,
    experience: [], education: [], skills: [], certifications: [],
    scrapedAt: Date.now(),
  };
}

// ─── Full profile scrape ─────────────────────────────────────────────────────

export async function scrapeFullProfile(): Promise<CurrentProfileData | null> {
  if (!window.location.href.includes('linkedin.com/in/')) return null;

  console.debug('[LI-Optimizer] === scrapeFullProfile START ===');
  console.debug('[LI-Optimizer] URL:', window.location.href);
  console.debug('[LI-Optimizer] readyState:', document.readyState);

  // Scroll through the page to trigger lazy-loaded sections
  await scrollToLoadAllSections();

  const profileUrl = window.location.href.split('?')[0];

  // Try JSON-LD for the most reliable basic info
  const jsonLd = extractJsonLd();

  const fullName = jsonLd?.name || getText(SELECTORS.fullName);

  // JSON-LD jobTitle is the headline — use it if available, otherwise scrape DOM
  const headline = (jsonLd?.jobTitle?.trim() && jsonLd.jobTitle.length > 2)
    ? jsonLd.jobTitle.trim()
    : scrapeHeadline();

  // JSON-LD description is the about text — but it's often truncated to ~200 chars.
  // Always run DOM scrape and use whichever is longer.
  const jsonLdAbout = jsonLd?.description?.trim() ?? '';
  const domAbout = scrapeAbout();
  const about = domAbout.length > jsonLdAbout.length ? domAbout : jsonLdAbout;

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
