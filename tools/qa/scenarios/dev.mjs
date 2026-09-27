// The developer panel (Settings -> Developer): every kind of jump, through
// the interface, then back to the real village.
import { seedStory, tapAll } from './lib.mjs';

let failures = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) failures++; };
const state = (page) => page.evaluate(() => {
  const a = window.__app, vs = a.save.villages.honeycombe, s = a.screen;
  return { screen: s?.constructor.name, visit: s?.visit?.id || null, mode: s?.play?.mode || null, left: s?.session?.left ?? null,
    done: Object.keys(vs.visits).length, judged: !!vs.judged, dev: !!a.save.flags.devVillage, tier: s?.play?.tier ?? null, cond: s?.play?.condition ?? null };
});

async function openDev(page, wait) {
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.click()));
  await wait(400);
  if (!(await page.locator('.topbar [aria-label="Settings"]').count())) { await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' })); await wait(1200); }
  await page.locator('.screen:last-child .topbar [aria-label="Settings"]').click();
  await wait(500);
  await page.locator('[data-act="developer"]').click();
  await wait(600);
}
const row = (page, text) => page.locator('.dev-row', { hasText: text }).first();

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 2); // the tester's own village
  await openDev(page, wait);
  await shot('d0-panel');

  await row(page, 'Open up the Post Office').locator('button', { hasText: 'Play' }).click();
  await wait(3200);
  let s = await state(page);
  check(s.visit === 'shop-restore' && s.done === 4 && s.dev, `Play visit 5 as first met (${JSON.stringify(s)})`);
  await shot('d1-play-fresh');

  await openDev(page, wait);
  await row(page, 'Spruce up the pub garden').locator('button', { hasText: 'Resume' }).click();
  await wait(3200);
  s = await state(page);
  check(s.visit === 'pub-garden' && s.left > 0 && s.left < 7, `Resume half-way (${s.left} left)`);
  await shot('d2-resume');

  await openDev(page, wait);
  await row(page, 'Spruce up the Green').locator('button', { hasText: 'One to go' }).click();
  await wait(3200);
  s = await state(page);
  check(s.visit === 'green-tidy' && s.left === 1, `One to go (${s.left} left)`);
  await page.locator('.brief .btn').click({ force: true }).catch(() => {});
  await wait(500);
  await tapAll(page, wait);
  await wait(6000);
  s = await state(page);
  check(s.screen === 'RevealScreen', `…one tap reaches the reveal (${s.screen})`);
  await shot('d3-reveal');

  await openDev(page, wait);
  await row(page, 'Open up the Post Office').locator('button', { hasText: 'Map' }).click();
  await wait(2500);
  s = await state(page);
  check(s.screen === 'MapScreen' && s.done === 4, `Map as you arrive (${JSON.stringify(s)})`);
  await shot('d4-map');

  await openDev(page, wait);
  await page.locator('.dev-walk select').nth(0).selectOption('village-shop');
  await page.locator('.dev-walk select').nth(1).selectOption('3');
  await page.locator('.dev-walk .btn').click();
  await wait(3500);
  s = await state(page);
  check(s.mode === 'walk' && s.tier === 3 && s.cond === 'mist', `Photo walk: the shop, postcard 3 (${s.tier}, ${s.cond})`);
  await shot('d5-walk');

  await openDev(page, wait);
  await page.locator('.dev-walk select').nth(0).selectOption('old-mill');
  await page.locator('.dev-walk select').nth(1).selectOption('6');
  await page.locator('.dev-walk select').nth(2).selectOption('dusk');
  await page.locator('.dev-walk select').nth(3).selectOption('0');
  await page.locator('.dev-walk .btn').click();
  await wait(3500);
  s = await state(page);
  check(s.mode === 'walk' && s.tier === 6 && s.cond === 'dusk' && s.done === 0, `Free Play at dusk on an untouched village (${JSON.stringify(s)})`);
  await shot('d6-walk-dusk');

  await openDev(page, wait);
  await row(page, 'The Daily Postcard').locator('button').click();
  await wait(3500);
  s = await state(page);
  check(s.mode === 'walk', 'The Daily Postcard');

  await openDev(page, wait);
  await row(page, 'Judging Day').locator('button').click();
  await wait(4000);
  s = await state(page);
  check(s.screen === 'JudgingScreen', `Judging Day (${s.screen})`);
  await shot('d7-judging');

  await openDev(page, wait);
  await row(page, 'After the judging').locator('button').click();
  await wait(2500);
  s = await state(page);
  check(s.screen === 'MapScreen' && s.judged, 'After the judging');
  await shot('d8-after');

  // from the pause menu, mid-visit
  await openDev(page, wait);
  await row(page, 'Tidy the platform').locator('button', { hasText: 'Resume' }).click();
  await wait(3200);
  await page.locator('.brief .btn').click({ force: true }).catch(() => {});
  await wait(500);
  await page.locator('[aria-label="Pause"]').click();
  await wait(500);
  await page.locator('.pause [data-act="developer"]').click();
  await wait(700);
  await shot('d8b-dev-from-pause');
  await row(page, 'Paint the Weavers').locator('button', { hasText: 'Play' }).click();
  await wait(3200);
  s = await state(page);
  check(s.visit === 'row-restore', `From the pause menu: jump to another visit (${s.visit})`);

  // back to the real village (two visits done), after a reload for good measure
  await page.reload();
  await wait(2800);
  await page.mouse.click(420, 200);
  await wait(2500);
  await openDev(page, wait);
  await shot('d9-panel-in-test-village');
  await Promise.all([page.waitForNavigation(), page.locator('.dev-real .btn').click()]);
  await wait(2800);
  s = await state(page);
  const stash = await page.evaluate(() => localStorage.getItem('postcard-perfect/save/dev-real'));
  check(s.done === 2 && !s.dev && !stash, `Back to my real village (${s.done} visits, test flag ${s.dev})`);
  console.log(failures ? `DEV: ${failures} FAILURE(S)` : 'DEV: ALL OK');
}
