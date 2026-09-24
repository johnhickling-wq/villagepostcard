// Fresh start -> letters -> tutorial scene -> fix everything -> results -> map
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.mouse.click(420, 300);
  await wait(800);
  for (let i = 0; i < 2; i++) {
    await page.locator('.letter .btn').click({ force: true }); // finish typing
    await wait(300);
    await page.locator('.letter .btn').click({ force: true });
    await wait(1200);
  }
  await wait(1500);
  await shot('03-play-start');
  const faults = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => f.id));
  let i = 0;
  for (const id of faults) {
    const pos = await page.evaluate((fid) => {
      const s = window.__app.screen;
      const f = s.mess.faults.find((x) => x.id === fid);
      return window.__app.view.worldToScreen(f.cx, f.cy);
    }, id);
    await page.mouse.click(pos[0], pos[1]);
    await wait(i === 1 ? 1200 : 350);
    if (i === 1) await shot('04-play-midfix');
    i++;
  }
  await wait(700);
  await shot('05-viewfinder');
  await wait(3500);
  await shot('06-results-print');
  await wait(4000);
  await shot('07-results');
  await page.mouse.click(10, 10);
  await wait(3000);
  await shot('08-results-rewards');
}
