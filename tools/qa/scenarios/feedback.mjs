// The playtest bug button: a report on a job in a visit (picture, the spot,
// what is there, a note), one on a menu screen with no spot, then the list:
// sending opens a filled-in GitHub issue, copying and deleting work.
// Writes the reports' pictures to the output folder.
import { writeFile } from 'node:fs/promises';
import { seedStory } from './lib.mjs';

let failures = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) failures++; };
const all = (page) => page.evaluate(async () => (await import('/src/dev/feedback.js')).reports.all());

export default async function ({ page, shot, wait, url }) {
  const out = process.argv[3] || 'scratch_art/shots';
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('postcard-perfect-dev'); });
  await page.reload();
  await wait(2800);
  check(await page.locator('.dev-bug').count() === 1, 'the bug button is on the title screen');
  await seedStory(page, 6);
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'mill-race'));
  await wait(2800);
  await page.locator('.brief .btn').click({ force: true });
  await wait(700);
  // capture window.open instead of leaving the page
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });

  // 1. a job in a visit
  await page.locator('.dev-bug').click();
  await page.waitForSelector('.dev-mark', { timeout: 15000 });
  const paused = await page.evaluate(() => window.__app.screen.paused);
  check(paused, 'the visit pauses while reporting');
  await shot('f1-mark');
  const p = await page.evaluate(() => { const f = window.__app.screen.mess.faults.find((x) => x.id === 'mill-sign'); return window.__app.view.worldToScreen(f.cx, f.cy); });
  await page.mouse.click(p[0], p[1]);
  await page.waitForSelector('.dev-form', { timeout: 10000 });
  const pointed = await page.locator('.dev-pointed').textContent();
  check(/mill-sign/.test(pointed), `it knows what was tapped (${pointed})`);
  await page.locator('.dev-kind', { hasText: 'Art' }).click();
  await page.locator('.dev-note-input').fill('The flour sign looks a bit blurry next to the doors.');
  await shot('f2-form');
  await page.locator('.dev-form .btn.teal').click();
  await wait(800);
  let rs = await all(page);
  check(rs.length === 1 && rs[0].pointed?.job?.id === 'mill-sign' && rs[0].kind === 'Art' && rs[0].context.play?.visit === 'mill-race', 'the report is kept with the job, the kind and the visit');
  check(rs[0].image?.length > 20000, `with a picture (${Math.round((rs[0].image?.length || 0) / 1024)} KB)`);
  check(!(await page.evaluate(() => window.__app.screen.paused)), 'the visit carries on afterwards');
  await writeFile(`${out}/f-report1.jpg`, Buffer.from(rs[0].image.split(',')[1], 'base64'));

  // 2. a menu screen, no spot
  await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' }));
  await wait(1500);
  await page.locator('.dev-bug').click();
  await page.waitForSelector('.dev-mark', { timeout: 15000 });
  await page.locator('.dev-mark-bar .btn').click();
  await page.waitForSelector('.dev-form', { timeout: 10000 });
  await page.locator('.dev-note-input').fill('The ribbon text wraps oddly.');
  await page.locator('.dev-form .btn', { hasText: 'Save and send' }).click();
  await wait(800);
  rs = await all(page);
  const opened = await page.evaluate(() => window.__opened);
  check(rs.length === 2 && rs[1].context.screen === 'MapScreen' && rs[1].sent, 'a map report, sent at once');
  check(opened.length === 1 && opened[0].startsWith('https://github.com/johnhickling-wq/villagepostcard/issues/new?title=%5BPlaytest%5D') && opened[0].length < 8000, `…as a filled-in GitHub issue (${opened[0]?.length} chars)`);
  await writeFile(`${out}/f-report2.jpg`, Buffer.from(rs[1].image.split(',')[1], 'base64'));
  console.log(decodeURIComponent(opened[0].split('body=')[1]).slice(0, 900));

  // 3. the list
  await page.locator('.topbar [aria-label="Settings"]').click();
  await wait(500);
  await page.locator('[data-act="developer"]').click();
  await wait(600);
  await page.locator('.dev-row', { hasText: 'Your reports' }).locator('button').click();
  await wait(900);
  await shot('f3-list');
  check(await page.locator('.dev-report-row').count() === 2, 'both reports are listed');
  await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
  await page.locator('.dev-report-row').nth(1).locator('button', { hasText: 'Copy' }).click();
  await wait(300);
  check(/flour sign/.test(await page.evaluate(() => window.__copied) || ''), 'Copy puts the report text on the clipboard');
  await page.locator('.dev-report-row').nth(1).locator('button', { hasText: 'Send to GitHub' }).click();
  await wait(500);
  check((await page.evaluate(() => window.__opened.length)) === 2, 'Send to GitHub opens an issue for one report');
  await page.locator('.dev-reports-head button', { hasText: 'Clear sent' }).click();
  await wait(500);
  check((await all(page)).length === 0, 'Clear sent removes sent reports');
  console.log(failures ? `FEEDBACK: ${failures} FAILURE(S)` : 'FEEDBACK: ALL OK');
}
