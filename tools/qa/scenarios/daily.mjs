// Daily postcard flow, request claim with friendship letter, and a perf sample.
export default async function ({ page, shot, wait, url }) {
  const tapFaults = async () => {
    const ids = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => f.id));
    for (const id of ids) {
      const p = await page.evaluate((fid) => { const f = window.__app.screen.mess.faults.find((x) => x.id === fid); return window.__app.view.worldToScreen(f.cx, f.cy); }, id);
      await page.mouse.click(p[0], p[1]);
      await wait(260);
    }
  };
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app, P = window.__progression;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; s.flags.seen.mapIntro = true;
    s.player.plays = 6;
    for (const p of app.v.projects.slice(0, 7)) s.villages.honeycombe.projects[p.id] = 1;
    P.refillRequests(s, app.content, 'honeycombe');
    await window.__flows.playDaily(app);
  });
  await wait(2500);
  // perf sample: time 120 frames of update+draw
  const perf = await page.evaluate(() => {
    const v = window.__app.view;
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) { v.update(1 / 60); v.draw(); }
    return (performance.now() - t0) / 120;
  });
  console.log('avg frame ms (desktop chromium, 2x DPR):', perf.toFixed(2));
  await shot('90-daily-play');
  await tapFaults();
  await wait(9000);
  await shot('91-daily-results');
  for (let i = 0; i < 5; i++) { const b = page.locator('.celebrate .btn'); if (await b.count()) { await shot(`92-daily-celebrate-${i}`); await b.first().click({ force: true }); await wait(700); } }
  // claim a request
  await page.evaluate(async () => {
    const app = window.__app;
    const r = app.save.requests.active[0];
    r.progress = r.count;
    app.save.requests.friendship[r.villager] = 1; // next claim reaches friendship level 1
    const { NoticeboardScreen } = await import('/src/ui/screens/noticeboard.js');
    await app.show(new NoticeboardScreen(app), { transition: 'none' });
  });
  await wait(1200);
  await page.locator('.req-note .btn').first().click({ force: true });
  await wait(1800);
  await shot('93-claim-letter');
}
