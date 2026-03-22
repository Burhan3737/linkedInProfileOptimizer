// ─── LinkedIn DOM Selectors (single source of truth) ─────────────────────────
// LinkedIn frequently changes selectors. Prefer ARIA labels over class names.
// NOTE: LinkedIn puts section IDs (#about, #experience, etc.) on the <section>
// element itself in newer builds, so use DESCENDANT selectors first, then fall
// back to the SIBLING combinator (~) for older builds.

export const SELECTORS = {
  // Profile sections
  fullName: [
    'h1.text-heading-xlarge',
    '.pv-text-details__left-panel h1',
    '.ph5 h1',
    'main h1',
  ],
  headline: [
    // Headline is the subtitle BELOW the name — NOT an h1
    '.pv-text-details__left-panel .text-body-medium',
    '.ph5 .text-body-medium.break-words',
    '[data-field="headline"]',
    '.pv-text-details__left-panel h2',
    // Very broad fallback: first .text-body-medium that is not inside the name h1
    'div.text-body-medium.break-words',
  ],
  about: [
    // Modern LinkedIn: content nested inside <section id="about">
    '#about .inline-show-more-text span[aria-hidden="true"]',
    '#about .display-flex span[aria-hidden="true"]',
    '#about span[aria-hidden="true"]',
    // Older LinkedIn: pvs-list as sibling after anchor with id="about"
    '#about ~ .pvs-list__outer-container .pvs-list__item--no-padding-in-columns span[aria-hidden="true"]',
    '#about ~ div span[aria-hidden="true"]',
    // Legacy selectors
    '.pv-about-section .pv-about__summary-text',
    'section[data-section="summary"] p',
  ],
  profileUrl: [
    'link[rel="canonical"]',
  ],

  // Experience section
  experienceSection: [
    '#experience',
    '[data-section="experience"]',
  ],
  experienceItems: [
    // Modern: content inside <section id="experience">
    '#experience li.pvs-list__item--line-separated',
    '#experience li.artdeco-list__item',
    // Older: sibling after anchor
    '#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated',
    '#experience ~ div li.pvs-list__item--line-separated',
    // data-view-name based (newer LinkedIn builds)
    '[data-view-name="profile-component-entity"] li.pvs-list__item--line-separated',
    // Legacy
    '.experience-section .pv-position-entity',
  ],
  experienceTitle: [
    '.mr1 span[aria-hidden="true"]',
    '.t-bold span[aria-hidden="true"]',
    'span.font-sans.t-bold span[aria-hidden="true"]',
    '.pv-entity__secondary-title',
  ],
  experienceCompany: [
    '.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]',
    '.t-14.t-normal span[aria-hidden="true"]:first-child',
    'span.t-14.t-normal span[aria-hidden="true"]',
    '.pv-entity__company-name',
  ],
  experienceDuration: [
    '.t-14.t-normal.t-black--light span[aria-hidden="true"]',
    '.t-black--light span[aria-hidden="true"]',
    'span.t-black--light span[aria-hidden="true"]',
  ],
  experienceDescription: [
    '.pvs-list__outer-container .pvs-list__item--no-padding-in-columns span[aria-hidden="true"]',
    '.pv-entity__description',
  ],

  // Education section
  educationSection: [
    '#education',
    '[data-section="education"]',
  ],
  educationItems: [
    // Modern: nested inside section
    '#education li.pvs-list__item--line-separated',
    '#education li.artdeco-list__item',
    // Older: sibling
    '#education ~ .pvs-list__outer-container li.pvs-list__item--line-separated',
    '#education ~ div li.pvs-list__item--line-separated',
  ],

  // Skills
  skillsSection: [
    '#skills',
    '[data-section="skills"]',
  ],
  skillItems: [
    // Target list items (not spans) — skill name extracted from first bold span per item
    '#skills li.pvs-list__item--line-separated',
    '#skills li.artdeco-list__item',
    '#skills li.pvs-list__item--no-padding-in-columns',
    '#skills li.pvs-list__pv-entry',
    // Older: sibling pattern
    '#skills ~ .pvs-list__outer-container li.pvs-list__item--line-separated',
    '#skills ~ .pvs-list__outer-container li',
    '#skills ~ div li.pvs-list__item--line-separated',
  ],

  // Skills detail page (/details/skills/) — no section anchor prefix needed
  skillsDetailItems: [
    'li.pvs-list__item--line-separated',
    'li.artdeco-list__item',
    'li.pvs-list__item--no-padding-in-columns',
    'li.pvs-list__pv-entry',
    'li',
  ],

  // Edit buttons/modals
  editHeadlineBtn: [
    'button[aria-label*="Edit intro"]',
    'button[aria-label*="Edit your headline"]',
  ],
  editAboutBtn: [
    'button[aria-label*="Edit about"]',
    'button[aria-label*="Add summary"]',
  ],
  editModalClose: [
    'button[aria-label="Dismiss"]',
    'button[data-test-modal-close-btn]',
  ],
  editModalSave: [
    'button[aria-label="Save"]',
    'form button[type="submit"]',
  ],

  // Inline edit fields
  headlineInput: [
    'input#single-line-text-form-component-profileEditFormElement-HEADLINE',
    'input[name="headline"]',
    'input[id*="HEADLINE"]',
  ],
  aboutTextarea: [
    'textarea[id*="SUMMARY"]',
    'textarea[name="summary"]',
    'div[data-placeholder*="summary"] [contenteditable]',
  ],
} as const;

/** Try each selector in order, return first match */
export function querySelector<T extends Element = Element>(
  selectors: readonly string[],
  root: Document | Element = document
): T | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector<T>(sel);
      if (el) return el;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

/** Try each selector, return all matches from first hit */
export function querySelectorAll<T extends Element = Element>(
  selectors: readonly string[],
  root: Document | Element = document
): T[] {
  for (const sel of selectors) {
    try {
      const els = Array.from(root.querySelectorAll<T>(sel));
      if (els.length > 0) return els;
    } catch {
      // Invalid selector — skip
    }
  }
  return [];
}
