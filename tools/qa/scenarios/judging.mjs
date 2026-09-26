// The final visit, then the judges' tour of the restored village, the rosette,
// and the choice to stay.
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 13, { plays: 20 });
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'green-judging'));
  await wait(2600);
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  await tapAll(page, wait);
  await wait(7000);
  await shot('70-final-postcard');
  await page.locator('.rv-next').click({ force: true });
  await wait(4500);
  await shot('71-judging-tour');
  await wait(3500);
  await shot('72-judging-wiped');
  await page.evaluate(() => { window.__app.screen.fast = true; });
  await wait(9000);
  await shot('73-award');
  for (let i = 0; i < 6; i++) {
    const b = page.locator('.letter .btn, .celebrate .btn');
    if (await b.count()) { await b.first().click({ force: true }); await wait(400); await b.first().click({ force: true }).catch(() => {}); await wait(900); }
  }
  await wait(1000);
  await shot('74-ending');
  await page.locator('.judge-end .btn.teal').click({ force: true });
  await wait(2500);
  await shot('75-map-after');
  console.log(JSON.stringify(await page.evaluate(() => ({ judged: !!window.__app.vs.judged, restored: window.__progression.placesRestored(window.__app.save, window.__app.content, 'honeycombe') }))));
}
