// Small phone (run with VW=667 VH=375) and tablet (VW=1024 VH=768) checks of
// the screens most sensitive to space: a visit in progress, the reveal's
// postcard and rail, the map, a place sheet and the journal.
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  const tag = `${process.env.VW || 844}x${process.env.VH || 390}`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 3); // three visits done
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'halt-refresh'));
  await wait(2600);
  await shot(`c-${tag}-1-brief`);
  await page.locator('.brief .btn').click({ force: true });
  await wait(600);
  const j = page.locator('.job-card .btn'); if (await j.count()) { await shot(`c-${tag}-2-jobcard`); await j.click({ force: true }); await wait(400); }
  await shot(`c-${tag}-3-play`);
  await tapAll(page, wait);
  await wait(6500);
  await shot(`c-${tag}-4-postcard`);
  await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' }));
  await wait(2500);
  const c = page.locator('.intro-card .btn'); if (await c.count()) { await c.click({ force: true }); await wait(500); }
  await shot(`c-${tag}-5-map`);
  await page.evaluate(() => window.__app.screen.placeSheet('railway-halt'));
  await wait(1200);
  await shot(`c-${tag}-6-place`);
  await page.evaluate(() => document.querySelector('.overlay')?.click());
  await wait(500);
  await page.evaluate(async () => { const { AlbumScreen } = await import('/src/ui/screens/album.js'); await window.__app.show(new AlbumScreen(window.__app), { transition: 'none' }); });
  await wait(2500);
  await shot(`c-${tag}-7-journal`);
}
