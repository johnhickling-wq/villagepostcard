// Portrait phone (VW=390 VH=844): the stage turns 90°; the opening visit is
// played by tapping in screen space, through to its postcard.
import { tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await shot('r0-title');
  await page.mouse.click(200, 420);
  await wait(1200);
  await shot('r1-opening');
  await page.locator('.opening .btn').click({ force: true });
  await wait(2600);
  await shot('r2-brief');
  await page.locator('.brief .btn').click({ force: true });
  await wait(900);
  await shot('r3-coach');
  const info = await page.evaluate(() => ({ rotated: window.__app.rotated, w: window.__app.width, h: window.__app.height }));
  console.log(JSON.stringify(info));
  await tapAll(page, wait, 450);
  const left = await page.evaluate(() => window.__app.screen.session?.left ?? 0);
  console.log('tasks left after screen-space taps:', left);
  await wait(7000);
  await shot('r4-postcard');
}
