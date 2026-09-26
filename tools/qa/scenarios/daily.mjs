// The Daily Postcard (a photo walk), its reveal and stamp card, a favour claimed
// with a friendship letter, and a frame-time sample.
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 5, { plays: 12 });
  await page.evaluate(async () => {
    const app = window.__app, P = window.__progression;
    for (const t of Object.keys(app.content.faults)) app.save.flags.seen['job:' + t] = true;
    app.save.flags.seen['coach:score'] = true;
    P.refillRequests(app.save, app.content, 'honeycombe');
    await window.__flows.playDaily(app);
  });
  await wait(3000);
  const perf = await page.evaluate(() => {
    const v = window.__app.view;
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) { v.update(1 / 60); v.draw(); }
    return (performance.now() - t0) / 120;
  });
  console.log('avg frame ms (desktop chromium, 2x DPR):', perf.toFixed(2));
  await shot('90-daily-play');
  await tapAll(page, wait, 260);
  await wait(7000);
  await shot('91-daily-reveal');
  const chip = page.locator('.rv-extra:not([disabled])');
  if (await chip.count()) { await chip.first().click({ force: true }); await wait(900); await shot('92-daily-stamp'); await page.locator('.celebrate .btn').first().click({ force: true }); await wait(600); }
  await page.evaluate(async () => {
    const app = window.__app;
    const r = app.save.requests.active[0];
    r.progress = r.count;
    app.save.requests.friendship[r.villager] = 1;
    const { NoticeboardScreen } = await import('/src/ui/screens/noticeboard.js');
    await app.show(new NoticeboardScreen(app), { transition: 'none' });
  });
  await wait(1200);
  await page.locator('.req-note:not(.committee) .btn').first().click({ force: true });
  await wait(1800);
  await shot('93-claim-letter');
}
