/**
 * Scraper diagnostic — run against a real LinkedIn profile to identify
 * which DOM selectors match and which don't.
 *
 * Usage:
 *   npx playwright test tests/scraper-diagnostic.ts
 *
 * First run: a Chromium window opens. Log in to LinkedIn manually,
 * then re-run. The login session is persisted in .playwright-auth/.
 */
import { chromium } from 'playwright';

const PROFILE_URL = process.argv[2] || 'https://www.linkedin.com/in/mburhantahir';
const AUTH_DIR = '.playwright-auth';

async function main() {
  console.log(`\n🔍 Scraper diagnostic for: ${PROFILE_URL}\n`);

  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto(PROFILE_URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // Wait for profile to load
  await page.waitForSelector('main', { timeout: 10_000 }).catch(() => {});
  // Scroll to load lazy sections
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Check if we're on a login page
  const isLoggedIn = await page.evaluate(() => !window.location.href.includes('/login'));
  if (!isLoggedIn) {
    console.log('⚠️  Not logged in. Please log in to LinkedIn in the browser window, then re-run.');
    console.log('   The session will be saved in .playwright-auth/ for future runs.\n');
    await page.waitForURL('**/feed**', { timeout: 120_000 });
    await page.goto(PROFILE_URL, { waitUntil: 'networkidle' });
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
    }
  }

  // ─── Run diagnostics ──────────────────────────────────────────────────────
  const results = await page.evaluate(() => {
    const diag: Record<string, unknown> = {};

    // 1. Check #experience anchor
    const expAnchor = document.getElementById('experience');
    diag['#experience exists'] = !!expAnchor;
    diag['#experience tagName'] = expAnchor?.tagName ?? null;
    diag['#experience parentTagName'] = expAnchor?.parentElement?.tagName ?? null;

    // 2. Check experience container strategies
    // Strategy A: anchor has content directly
    if (expAnchor) {
      const hasSpans = !!expAnchor.querySelector('span[aria-hidden="true"]');
      const hasLi = !!expAnchor.querySelector('li');
      diag['#experience has spans/li directly'] = { hasSpans, hasLi };

      // Strategy B: next siblings
      let sibling = expAnchor.nextElementSibling;
      let siblingIdx = 0;
      const siblings: string[] = [];
      while (sibling && siblingIdx < 5) {
        const tag = sibling.tagName;
        const cls = sibling.className?.toString().slice(0, 80) ?? '';
        const liCount = sibling.querySelectorAll('li').length;
        siblings.push(`${tag}.${cls} (${liCount} li)`);
        sibling = sibling.nextElementSibling;
        siblingIdx++;
      }
      diag['#experience siblings'] = siblings;

      // Strategy C: closest section/card
      const card = expAnchor.closest('section, div[data-view-name]');
      diag['#experience closest card'] = card ? `${card.tagName}#${card.id}.${card.className?.toString().slice(0, 60)}` : null;
    }

    // 3. Check list item selectors
    const selectorTests: Record<string, number> = {
      '#experience li.pvs-list__item--line-separated': document.querySelectorAll('#experience li.pvs-list__item--line-separated').length,
      '#experience li.artdeco-list__item': document.querySelectorAll('#experience li.artdeco-list__item').length,
      '#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated': 0,
      '#experience ~ div li.pvs-list__item--line-separated': 0,
      '[data-view-name="profile-component-entity"] li.pvs-list__item--line-separated': document.querySelectorAll('[data-view-name="profile-component-entity"] li.pvs-list__item--line-separated').length,
      '.experience-section .pv-position-entity': document.querySelectorAll('.experience-section .pv-position-entity').length,
    };
    // Sibling selectors need try/catch
    try { selectorTests['#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated'] = document.querySelectorAll('#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated').length; } catch {}
    try { selectorTests['#experience ~ div li.pvs-list__item--line-separated'] = document.querySelectorAll('#experience ~ div li.pvs-list__item--line-separated').length; } catch {}
    diag['selector match counts'] = selectorTests;

    // 4. Check heading-based detection
    const headings: string[] = [];
    for (const tag of ['h2', 'h3']) {
      for (const h of document.querySelectorAll(tag)) {
        const text = h.textContent?.trim() ?? '';
        if (text.toLowerCase().includes('experience')) {
          const section = h.closest('section, div.artdeco-card, div[data-view-name]');
          const liCount = section?.querySelectorAll('li').length ?? 0;
          headings.push(`<${tag}> "${text}" → section has ${liCount} li items`);
        }
      }
    }
    diag['headings containing "experience"'] = headings;

    // 5. Scan ALL sections for their IDs and heading text
    const sections: string[] = [];
    for (const s of document.querySelectorAll('section')) {
      const id = s.id || '(no id)';
      const h2 = s.querySelector('h2, h3');
      const heading = h2?.textContent?.trim() ?? '(no heading)';
      const liCount = s.querySelectorAll('li').length;
      sections.push(`#${id}: "${heading}" — ${liCount} li`);
    }
    diag['all sections'] = sections;

    // 6. Check span-based headings (pvs-header__title)
    const spanHeadings: string[] = [];
    for (const span of document.querySelectorAll<HTMLElement>('span.pvs-header__title, span.t-bold')) {
      const text = span.textContent?.trim() ?? '';
      if (text.toLowerCase() === 'experience') {
        const section = span.closest('section, div.artdeco-card, div[data-view-name]');
        spanHeadings.push(`<span> "${text}" in ${section?.tagName}#${section?.id} — ${section?.querySelectorAll('li').length} li`);
      }
    }
    diag['span headings "experience"'] = spanHeadings;

    // 7. If we find an experience section, show first 3 items' inner structure
    let expSection: Element | null = null;
    // Try heading-based
    for (const h of document.querySelectorAll('h2, h3')) {
      if (h.textContent?.trim().toLowerCase() === 'experience') {
        expSection = h.closest('section, div.artdeco-card, div[data-view-name]');
        break;
      }
    }
    // Try #experience
    if (!expSection) {
      const anchor = document.getElementById('experience');
      if (anchor) expSection = anchor.closest('section') ?? anchor;
    }

    if (expSection) {
      const allLi = expSection.querySelectorAll('li');
      const itemSamples: string[] = [];
      for (let i = 0; i < Math.min(3, allLi.length); i++) {
        const li = allLi[i];
        const classes = li.className?.toString().slice(0, 100) ?? '';
        const ariaSpans = Array.from(li.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'))
          .map(s => s.textContent?.trim())
          .filter(Boolean)
          .slice(0, 5);
        itemSamples.push(`li.${classes}: spans=${JSON.stringify(ariaSpans)}`);
      }
      diag['experience section li samples'] = itemSamples;
      diag['experience section li classes'] = [...new Set(
        Array.from(allLi).map(li => li.className?.toString() ?? '').filter(Boolean)
      )].slice(0, 10);
    } else {
      diag['experience section li samples'] = '(no experience section found)';
    }

    return diag;
  });

  // ─── Print results ─────────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(results)) {
    console.log(`\n── ${key} ──`);
    if (Array.isArray(value)) {
      if (value.length === 0) console.log('  (none)');
      for (const item of value) console.log(`  • ${item}`);
    } else if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        console.log(`  ${k}: ${v}`);
      }
    } else {
      console.log(`  ${value}`);
    }
  }

  console.log('\n✅ Diagnostic complete.\n');
  await context.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
