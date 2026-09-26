// Stuck in a visit: the loupe is offered after a quiet spell (then more
// clearly), a tap on tomorrow's job gets a friendly word, exploratory taps
// cost nothing, zoom and "Whole scene", the pause sheet. Then a photo walk's
// loupe and flashbulb.
import { seedStory } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 1); // the Halt is tidied; its window is tomorrow's job
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'hs-refresh'));
  await wait(2600);
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  const j = page.locator('.job-card .btn'); if (await j.count()) await j.click({ force: true });
  await wait(400);
  // exploratory taps on empty street: no penalty, no lockout
  for (let i = 0; i < 5; i++) { await page.mouse.click(420 + i * 8, 370); await wait(90); }
  await wait(300);
  await shot('h1-explore');
  const st = await page.evaluate(() => ({ misses: window.__app.screen.session.misses, penalties: window.__app.screen.session.penalties }));
  console.log('exploratory taps', JSON.stringify(st));
  // a quiet spell: the loupe is offered
  await page.evaluate(() => { window.__app.screen.session.lastProgress = window.__app.screen.session.t - 13; });
  await wait(600);
  await shot('h2-loupe-offer');
  await page.evaluate(() => { window.__app.screen.session.lastProgress = window.__app.screen.session.t - 27; });
  await wait(600);
  await shot('h3-loupe-clearer');
  await page.locator('.tool.loupe').click({ force: true });
  await wait(700);
  await shot('h4-loupe');
  await wait(2500);
  // zoom in, then "Whole scene"
  await page.evaluate(() => { const v = window.__app.view; v.zoomAt(2.2, 420, 250); });
  await wait(400);
  await shot('h5-zoomed');
  await page.locator('.zoom-reset').click({ force: true });
  await wait(700);
  await page.locator('.hud-pause').click({ force: true });
  await wait(700);
  await shot('h6-pause');
  await page.evaluate(() => document.querySelector('.sheet .btn.teal').click());
  await wait(600);
  // tomorrow's job at the Halt: the grimy window (done later, in "Plant the station tubs")
  await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' }));
  await wait(800);
  await page.evaluate(() => { const a = window.__app; a.save.villages.honeycombe.visits['hs-refresh'] = { done: 1 }; a.save.villages.honeycombe.visits['green-tidy'] = { done: 1 }; delete a.save.villages.honeycombe.progress['hs-refresh']; });
  await page.evaluate(() => window.__flows.playWalk(window.__app, 'railway-halt'));
  await wait(3200);
  const j2 = page.locator('.job-card .btn'); if (await j2.count()) await j2.click({ force: true });
  await wait(400);
  const win = await page.evaluate(() => { const r = window.__app.content.scene('honeycombe', 'railway-halt').regions.find((x) => x.id === 'win-left'); const xs = r.poly.map((p) => p[0]), ys = r.poly.map((p) => p[1]); return window.__app.view.worldToScreen((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2); });
  await page.mouse.click(win[0], win[1]);
  await wait(400);
  await shot('h7-later');
  console.log('walk misses after tapping tomorrow’s window', await page.evaluate(() => window.__app.screen.session.penalties));
}
