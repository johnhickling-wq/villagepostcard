// An unreadable save is never silently replaced: the player is told, the bad
// save is kept aside and a new village begins. An older development save
// starts afresh with a word. Then a visit and
// its reveal with Reduce motion on (a crossfade, no flash or confetti).
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 2);
  await page.evaluate(() => {
    window.__app.holdSaves = true;
    localStorage.setItem('postcard-perfect/save', '{"v":3,"villages":{ this is not json');
  });
  await page.reload();
  await wait(3200);
  await shot('x1-unreadable');
  const aside = await page.evaluate(() => !!localStorage.getItem('postcard-perfect/save/unreadable'));
  await page.locator('.modal .btn.teal').click({ force: true });
  await wait(1500);
  const st = await page.evaluate(() => ({ visits: Object.keys(window.__app.save.villages.honeycombe.visits), unreadableKept: !!localStorage.getItem('postcard-perfect/save/unreadable') }));
  console.log('bad save kept aside before choosing:', aside, '| after:', JSON.stringify(st), st.visits.length === 0 && st.unreadableKept ? 'OK' : 'CHECK');
  // an older development save: a fresh village, settings kept, and a word on the title
  await page.evaluate(() => { window.__app.holdSaves = true; const s = JSON.parse(localStorage.getItem('postcard-perfect/save')); s.v = 3; s.settings.music = false; s.villages.honeycombe.visits['halt-tidy'] = { done: 1 }; localStorage.setItem('postcard-perfect/save', JSON.stringify(s)); });
  await page.reload();
  await wait(3600);
  await shot('x1b-older-save');
  const older = await page.evaluate(() => ({ v: window.__app.save.v, visits: Object.keys(window.__app.save.villages.honeycombe.visits).length, music: window.__app.save.settings.music, toast: document.querySelector('.toast')?.textContent || '' }));
  console.log('older save:', JSON.stringify(older), older.visits === 0 && older.music === false ? 'OK' : 'CHECK');
  // reduced motion
  await page.evaluate(() => { window.__app.save.settings.reducedMotion = true; window.__app.applySettings(); window.__flows.playVisit(window.__app, 'green-tidy'); });
  await wait(2600);
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  const j = page.locator('.job-card .btn'); if (await j.count()) await j.click({ force: true });
  await wait(300);
  await tapAll(page, wait);
  await wait(1900);
  await shot('x2-reduced-crossfade');
  await wait(4000);
  await shot('x3-reduced-postcard');
  console.log('reduced motion class:', await page.evaluate(() => document.documentElement.classList.contains('reduced-motion')));
}
