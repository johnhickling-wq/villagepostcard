// Mid-story save: the map, a place sheet with a visit in progress, the daily sheet.
import { seedStory } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 6, { plays: 10 });
  await page.evaluate(() => { const s = window.__app.save; s.villages.honeycombe.progress['hs-fete'] = { play: window.__progression.planVisit(s, window.__app.content, 'honeycombe', 'hs-fete'), done: ['litter.1'], cat: false, collectible: false, hints: 0, t: 12 }; });
  await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' }));
  await wait(1800);
  await shot('10-map');
  await page.evaluate(() => window.__app.screen.placeSheet('high-street'));
  await wait(1500);
  await shot('11-place-sheet');
  await page.evaluate(() => document.querySelector('.overlay')?.click());
  await wait(600);
  await page.evaluate(() => window.__app.screen.placeSheet('old-mill'));
  await wait(1500);
  await shot('12-place-restored');
  await page.evaluate(() => document.querySelector('.overlay')?.click());
  await wait(600);
  await page.evaluate(() => window.__app.screen.dailySheet());
  await wait(900);
  await shot('13-daily-sheet');
}
