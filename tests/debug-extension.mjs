/**
 * Debug via Chrome DevTools Protocol.
 * Attaches to your running Chrome browser to inspect the LinkedIn tab & extension.
 *
 * Steps:
 *   1. Close Chrome completely
 *   2. Reopen Chrome with debugging: run this script which launches it
 *   OR manually: chrome.exe --remote-debugging-port=9222
 *
 * Usage: node tests/debug-extension.mjs
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_PATH = resolve(__dirname, '../dist').replace(/\\/g, '/');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Kill any running Chrome first so we can use the profile
import { execSync, spawn } from 'child_process';

console.log('Closing any running Chrome instances...');
try { execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'pipe' }); } catch {}
await new Promise(r => setTimeout(r, 2000));

// Launch Chrome with real profile + extension + remote debugging
console.log('Launching Chrome with your profile + extension...');
const chromeArgs = [
  '--remote-debugging-port=9222',
  `--disable-extensions-except=${DIST_PATH.replace(/\//g, '\\')}`,
  `--load-extension=${DIST_PATH.replace(/\//g, '\\')}`,
  '--profile-directory=Default',
  '--no-first-run',
  `--user-data-dir=C:\\Users\\Lenovo\\AppData\\Local\\Google\\Chrome\\User Data`,
];

const chromeProc = spawn(CHROME_PATH, chromeArgs, {
  detached: true,
  stdio: 'ignore',
  shell: false,
});
chromeProc.unref();

console.log('Waiting for Chrome to start...');
await new Promise(r => setTimeout(r, 4000));

// Connect via CDP
console.log('Connecting via CDP...');
let browser;
try {
  browser = await chromium.connectOverCDP('http://localhost:9222');
} catch (e) {
  console.error('Could not connect to Chrome:', e.message);
  console.error('Make sure no other Chrome is running and try again.');
  process.exit(1);
}

const contexts = browser.contexts();
const context = contexts[0];
const pages = context.pages();

console.log(`Connected. ${pages.length} tab(s) open.`);
pages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));

// Find or open LinkedIn profile tab
let linkedinPage = pages.find(p => p.url().includes('linkedin.com/in/'));
if (!linkedinPage) {
  linkedinPage = pages.find(p => p.url().includes('linkedin.com')) ?? pages[0];
  console.log('\nNavigating to LinkedIn...');
  await linkedinPage.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
}

// Forward all console messages from the LinkedIn tab
linkedinPage.on('console', msg => {
  const text = msg.text();
  // Show extension / useful messages
  if (msg.type() === 'error' || text.includes('[SW]') || text.includes('[Content]') || text.includes('optimizer')) {
    console.log(`[TAB ${msg.type().toUpperCase()}] ${text}`);
  }
});
linkedinPage.on('pageerror', e => console.error('[TAB EXCEPTION]', e.message));

console.log('\nCurrent URL:', linkedinPage.url());

const isOnProfile = linkedinPage.url().includes('/in/');
if (!isOnProfile) {
  console.log('\n→ Not on profile page yet. Trying to find your profile link...');

  // Try clicking "Me" menu
  await linkedinPage.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const profileUrl = await linkedinPage.evaluate(() => {
    // Try multiple ways to find the profile link
    const links = Array.from(document.querySelectorAll('a[href*="/in/"]'));
    const meLink = links.find(l => l.closest('.global-nav__me') || l.closest('[data-control-name="identity_welcome_message"]'));
    return meLink?.href ?? links[0]?.href ?? null;
  });

  if (profileUrl) {
    console.log('→ Found profile URL:', profileUrl);
    await linkedinPage.goto(profileUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('⚠ Could not find profile URL. Please navigate to your profile in Chrome.');
    console.log('  Press Enter when you are on your profile page...');
    await new Promise(r => process.stdin.once('data', r));
  }
}

console.log('\nFinal URL:', linkedinPage.url());

// ── Selector health check ─────────────────────────────────────────────────────
console.log('\n════ Selector Health Check ════');
const health = await linkedinPage.evaluate(() => {
  function qs(sels, root = document) {
    for (const s of sels) { try { const e = root.querySelector(s); if (e) return e; } catch {} }
    return null;
  }
  function qsa(sels, root = document) {
    for (const s of sels) { try { const es = [...root.querySelectorAll(s)]; if (es.length) return es; } catch {} }
    return [];
  }

  const sections = {
    fullName:   ['h1.text-heading-xlarge', 'h1'],
    headline:   ['.text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', 'h1 ~ .text-body-medium'],
    about_text: ['#about ~ .pvs-list__outer-container span[aria-hidden="true"]'],
    exp_items:  ['#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated'],
    skill_items:['#skills ~ .pvs-list__outer-container .pvs-list__item--no-padding-in-columns span[aria-hidden="true"]'],
    edit_intro: ['button[aria-label*="Edit intro"]', 'button[aria-label*="Edit your name"]'],
    headline_input: ['input[id*="HEADLINE"]', 'input[name="headline"]'],
  };

  const res = {};
  for (const [k, sels] of Object.entries(sections)) {
    const isList = k.includes('items') || k.includes('skill');
    if (isList) {
      const els = qsa(sels);
      res[k] = { count: els.length, sample: els[0]?.textContent?.trim().slice(0, 60) };
    } else {
      const el = qs(sels);
      res[k] = el ? { found: true, text: el.textContent?.trim().slice(0, 80), tag: el.tagName } : { found: false };
    }
  }
  return res;
});

for (const [k, v] of Object.entries(health)) {
  if ('count' in v) {
    console.log(`  ${v.count > 0 ? '✓' : '✕'} ${k}: ${v.count} items${v.sample ? ` — "${v.sample}"` : ''}`);
  } else {
    console.log(`  ${v.found ? '✓' : '✕'} ${k}${v.found ? `: "${v.text}" <${v.tag}>` : ' NOT FOUND'}`);
  }
}

// ── Full scrape simulation ────────────────────────────────────────────────────
console.log('\n════ Full Scrape Simulation ════');
const scraped = await linkedinPage.evaluate(() => {
  function qs(sels, root = document) { for (const s of sels) { try { const e = root.querySelector(s); if (e) return e; } catch {} } return null; }
  function qsa(sels, root = document) { for (const s of sels) { try { const es = [...root.querySelectorAll(s)]; if (es.length) return es; } catch {} } return []; }
  const TEXT = t => t?.textContent?.trim() ?? '';

  const name = TEXT(qs(['h1.text-heading-xlarge', 'h1']));
  const headline = TEXT(qs(['.text-body-medium.break-words', 'h1 + .text-body-medium']));
  const about = TEXT(qs(['#about ~ .pvs-list__outer-container span[aria-hidden="true"]']));
  const expItems = qsa(['#experience ~ .pvs-list__outer-container li.pvs-list__item--line-separated']);
  const skillItems = qsa(['#skills ~ .pvs-list__outer-container .pvs-list__item--no-padding-in-columns span[aria-hidden="true"]']);

  return {
    isProfilePage: window.location.href.includes('/in/'),
    name, headline: headline.slice(0, 100), about: about.slice(0, 150),
    experienceCount: expItems.length,
    firstExpTitle: expItems[0] ? TEXT(expItems[0].querySelector('.t-bold span[aria-hidden="true"]')) : '(none)',
    skillCount: skillItems.length,
    firstSkill: skillItems[0] ? TEXT(skillItems[0]) : '(none)',
  };
});
console.log(JSON.stringify(scraped, null, 2));

// ── Screenshot ────────────────────────────────────────────────────────────────
try {
  await linkedinPage.screenshot({ path: 'tests/linkedin-profile.png' });
  console.log('\n✓ Screenshot → tests/linkedin-profile.png');
} catch {}

console.log('\n════ Extension is loaded — ready to test ════');
console.log('1. Click the LinkedIn Optimizer icon (top-right toolbar)');
console.log('2. Upload resume → fill form → click "Analyze My Profile"');
console.log('3. This console will show errors from the page');
console.log('');
console.log('For SERVICE WORKER logs:');
console.log('  Go to chrome://extensions → LinkedIn Profile Optimizer → "service worker"');
console.log('');
console.log('Press Ctrl+C to stop.\n');

// Keep running, streaming console output
process.on('SIGINT', async () => {
  console.log('\nClosing...');
  await browser.close();
  process.exit(0);
});

await new Promise(() => {});
