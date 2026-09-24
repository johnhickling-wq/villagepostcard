// QA harness: drives the game in a phone-sized Chromium and saves screenshots.
//   node tools/qa/shots.mjs [scenario] [outdir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const scenario = process.argv[2] || 'smoke';
const out = process.argv[3] || 'scratch_art/shots';
await mkdir(out, { recursive: true });
const url = process.env.URL || 'http://localhost:5173/';
const exe = process.env.CHROMIUM || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: +(process.env.VW || 844), height: +(process.env.VH || 390) }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const wait = (ms) => page.waitForTimeout(ms);

try {
  const mod = await import(`./scenarios/${scenario}.mjs`);
  await mod.default({ page, shot, wait, url, logs });
} catch (e) {
  console.error('SCENARIO FAILED', e);
  await shot('failure');
} finally {
  console.log(logs.filter((l) => !l.includes('[debug]')).slice(-40).join('\n'));
  await browser.close();
}
