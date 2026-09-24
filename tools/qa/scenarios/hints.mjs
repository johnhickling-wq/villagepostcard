// Loupe, flashbulb, mis-taps -> shaky hands, pinch zoom, pause sheet, cat.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; s.player.flashbulbs = 3;
    for (const p of app.v.projects) if (p.unlocks) s.villages.honeycombe.projects[p.id] = 1;
    await window.__flows.playScene(app, 'weavers-row', { tier: 3, condition: 'golden', seed: 5 });
  });
  await wait(2500);
  await page.evaluate(() => { const s = window.__app.screen.session; s.loupeReadyAt = 0; });
  await page.locator('.tool.loupe').click({ force: true });
  await wait(700);
  await shot('80-loupe');
  await wait(2500);
  await page.locator('.tool.flash').click({ force: true });
  await wait(600);
  await shot('81-flash');
  await wait(2500);
  for (let i = 0; i < 3; i++) { await page.mouse.click(30 + i * 5, 300); await wait(120); }
  await wait(250);
  await shot('82-shaky');
  await wait(2500);
  // cat
  const cat = await page.evaluate(() => { const c = window.__app.screen.mess.cat; return c ? window.__app.view.worldToScreen(c.cx, c.cy) : null; });
  if (cat) { await page.mouse.click(cat[0], cat[1]); await wait(350); await shot('83-cat'); }
  await wait(1500);
  // zoom
  await page.evaluate(() => { const v = window.__app.view; v.zoomAt(2.2, 195, 420); });
  await wait(400);
  await shot('84-zoomed');
  await page.locator('.hud-pause').click({ force: true });
  await wait(700);
  await shot('85-pause');
}
