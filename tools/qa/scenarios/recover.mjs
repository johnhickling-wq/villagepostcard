// An unreadable save is never silently replaced: the player is offered the
// backup (or a new village) and the bad save is kept aside. Then a visit and
// its reveal with Reduce motion on (a crossfade, no flash or confetti).
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 2);
  await page.evaluate(() => {
    const good = localStorage.getItem('postcard-perfect/save');
    localStorage.setItem('postcard-perfect/save/backup', good);
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
  console.log('before choosing, bad save kept aside:', aside, '| after choosing the backup:', JSON.stringify(st));
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
