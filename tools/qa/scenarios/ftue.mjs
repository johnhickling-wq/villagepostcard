// Full first-time flow: title -> letters -> tutorial -> results -> map -> first project -> High Street.
export default async function ({ page, shot, wait, url }) {
  const tapFaults = async () => {
    const ids = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => f.id));
    for (const id of ids) {
      const p = await page.evaluate((fid) => { const f = window.__app.screen.mess.faults.find((x) => x.id === fid); return window.__app.view.worldToScreen(f.cx, f.cy); }, id);
      await page.mouse.click(p[0], p[1]);
      await wait(420);
    }
  };
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.mouse.click(420, 300);
  await wait(800);
  for (let i = 0; i < 2; i++) {
    await page.locator('.letter .btn').click({ force: true }); await wait(300);
    await page.locator('.letter .btn').click({ force: true }); await wait(1200);
  }
  await wait(1500);
  await tapFaults();
  await wait(12000);
  // dismiss celebrations
  for (let i = 0; i < 4; i++) { const b = page.locator('.celebrate .btn'); if (await b.count()) { await b.first().click({ force: true }); await wait(700); } }
  await shot('60-results-end');
  await page.locator('.results-buttons .btn.teal').click({ force: true });
  await wait(2500);
  await shot('61-map-first');
  await page.locator('.pin[data-scene="high-street"]').click({ force: true });
  await wait(900);
  await shot('62-locked-sheet');
  await page.locator('.project-card .btn').first().click({ force: true });
  await wait(4500);
  await shot('63-unlock');
  await page.locator('.restore-foot .btn').click({ force: true });
  await wait(2500);
  await shot('64-map-unlocked');
  await page.locator('.pin[data-scene="high-street"]').click({ force: true });
  await wait(900);
  await page.locator('.ss-play').click({ force: true });
  await wait(3000);
  await shot('65-highstreet-play');
  const st = await page.evaluate(() => ({ plays: window.__app.save.player.plays, fund: window.__app.save.player.fund, xp: window.__app.save.player.xp, req: window.__app.save.requests.active.length }));
  console.log(JSON.stringify(st));
}
