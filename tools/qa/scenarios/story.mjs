// A new player's opening: title -> one-sentence opening -> the Halt (brief,
// coached tidy) -> the reveal -> the map -> the High Street -> the Green.
// Taps are made in screen space, like a finger.
const tapAll = async (page, wait, gap = 380) => {
  for (let guard = 0; guard < 20; guard++) {
    const p = await page.evaluate(() => {
      const s = window.__app.screen;
      if (!s?.session || s.finishing) return null;
      const id = [...s.session.remaining][0];
      if (!id) return null;
      const f = s.session.byId.get(id);
      return window.__app.view.worldToScreen(f.cx, f.cy);
    });
    if (!p) return;
    await page.mouse.click(p[0], p[1]);
    await wait(gap);
  }
};
const briefGo = async (page, wait) => { await page.locator('.brief .btn').click({ force: true }); await wait(500); const j = page.locator('.job-card .btn'); if (await j.count()) { await j.click({ force: true }); await wait(400); } };

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(3000);
  await shot('s00-title');
  await page.mouse.click(420, 200);
  await wait(1200);
  await shot('s01-opening');
  await page.locator('.opening .btn').click({ force: true });
  await wait(2600);
  await shot('s02-brief');
  await briefGo(page, wait);
  await wait(600);
  await shot('s03-coach');
  await tapAll(page, wait);
  await wait(1200);
  await shot('s04-reveal-before');
  await wait(1100);
  await shot('s05-reveal-wipe');
  await wait(2200);
  await shot('s06-reveal-after');
  await wait(2600);
  await shot('s07-postcard');
  const st = await page.evaluate(() => ({ visits: Object.keys(window.__app.save.villages.honeycombe.visits), journal: Object.keys(window.__app.save.villages.honeycombe.journal), active: window.__app.save.active }));
  console.log(JSON.stringify(st));
  await page.locator('.rv-next').click({ force: true });
  await wait(2600);
  await shot('s08-map');
  const c = page.locator('.intro-card .btn'); if (await c.count()) { await shot('s08b-card'); await c.click({ force: true }); await wait(500); }
  await page.locator('.next-ribbon').click({ force: true });
  await wait(2800);
  await shot('s09-hs-brief');
  await briefGo(page, wait);
  await wait(400);
  await shot('s10-hs-play');
  // tap the faded kiosk first: it is the job
  const k = await page.evaluate(() => { const f = window.__app.screen.mess.faults.find((x) => x.region === 'kiosk'); return window.__app.view.worldToScreen(f.cx, f.cy); });
  await page.mouse.click(k[0], k[1]);
  await wait(500);
  await shot('s11-kiosk-painting');
  await tapAll(page, wait);
  await wait(6500);
  await shot('s12-hs-postcard');
  await page.locator('.rv-next').click({ force: true });
  await wait(2800);
  const c2 = page.locator('.intro-card .btn'); if (await c2.count()) await c2.click({ force: true });
  await wait(600);
  await shot('s13-map-green');
  console.log(JSON.stringify(await page.evaluate(() => window.__progression.nextStep(window.__app.save, window.__app.content, 'honeycombe').label)));
}
