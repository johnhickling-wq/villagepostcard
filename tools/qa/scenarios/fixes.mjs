// Tap each fault type and capture its fix animation mid-flight.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true;
    for (const p of app.v.projects) if (p.unlocks) s.villages.honeycombe.projects[p.id] = 1;
    await window.__flows.playScene(app, 'high-street', { tier: 5, condition: 'dusk', seed: 77, script: ['faded', 'grimy', 'crooked', 'toppled', 'litter', 'weeds', 'cobweb', 'pigeon', 'unlit', 'wilted'] });
  });
  await wait(2000);
  await shot('50-fixes-before');
  const faults = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => ({ id: f.id, type: f.type })));
  for (const f of faults) {
    const pos = await page.evaluate((fid) => {
      const f = window.__app.screen.mess.faults.find((x) => x.id === fid);
      const [x, y] = window.__app.view.worldToScreen(f.cx, f.cy);
      return [x, y];
    }, f.id);
    // zoom the camera onto the fault so the animation is visible in the shot
    await page.evaluate((fid) => { const v = window.__app.view; const f = window.__app.screen.mess.faults.find((x) => x.id === fid); v.cam = { x: f.cx, y: f.cy, zoom: 2.4 }; v.clampCam(); }, f.id);
    await wait(150);
    const p2 = await page.evaluate((fid) => { const f = window.__app.screen.mess.faults.find((x) => x.id === fid); return window.__app.view.worldToScreen(f.cx, f.cy); }, f.id);
    await shot(`51-${f.type}-a`);
    await page.mouse.click(p2[0], p2[1]);
    await wait(f.type === 'crooked' || f.type === 'pigeon' ? 250 : 180);
    await shot(`51-${f.type}-b`);
    await wait(900);
  }
}
