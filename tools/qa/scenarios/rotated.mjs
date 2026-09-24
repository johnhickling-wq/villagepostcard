// Portrait phone: the stage turns 90°; play through the tutorial by tapping in screen space.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await shot('r0-title');
  await page.mouse.click(200, 420);
  await wait(800);
  for (let i = 0; i < 2; i++) {
    await page.locator('.letter .btn').click({ force: true }); await wait(300);
    await page.locator('.letter .btn').click({ force: true }); await wait(1200);
  }
  await wait(1500);
  await shot('r1-play');
  const info = await page.evaluate(() => ({ rotated: window.__app.rotated, w: window.__app.width, h: window.__app.height }));
  console.log(JSON.stringify(info));
  // tap each fault by converting stage coords to screen coords: screen = (W - ly, lx)
  const ids = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => f.id));
  for (const id of ids) {
    const p = await page.evaluate((fid) => {
      const f = window.__app.screen.mess.faults.find((x) => x.id === fid);
      const [lx, ly] = window.__app.view.worldToScreen(f.cx, f.cy);
      return [window.innerWidth - ly, lx];
    }, id);
    await page.mouse.click(p[0], p[1]);
    await wait(400);
  }
  const left = await page.evaluate(() => window.__app.screen.session?.left);
  console.log('faults left after screen-space taps:', left);
  await wait(6000);
  await shot('r2-results');
}
