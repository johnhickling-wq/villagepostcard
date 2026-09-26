// Mid-game save: several scenes open, some projects done; screenshot the map and sheets.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app, P = window.__progression;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; for (const t of Object.keys(window.__app.content.faults)) s.flags.seen['job:' + t] = true; for (const k of Object.keys(window.__app.content.intro.cards)) s.flags.seen['intro:' + k] = true; s.flags.seen.mapIntro = true;
    s.player.fund = 900; s.player.xp = 600; s.player.plays = 14;
    const vs = s.villages.honeycombe;
    for (const pid of ['open-high-street', 'halt-paint', 'halt-flowers', 'open-village-green', 'hs-paint']) vs.projects[pid] = 1;
    vs.scenes['railway-halt'].tier = 4; vs.scenes['high-street'].tier = 3; vs.scenes['village-green'].tier = 1;
    vs.scenes['railway-halt'].album = { clear: { seed: 5, tier: 1, condition: 'clear', stamps: 3, score: 1500, projects: [] }, golden: { seed: 6, tier: 2, condition: 'golden', stamps: 2, score: 1700, projects: [] } };
    P.refillRequests(s, app.content, 'honeycombe');
    await window.__flows.goMap(app, { transition: 'none' });
  });
  await wait(1500);
  await shot('10-map');
  await page.evaluate(() => window.__app.screen.sceneSheet('high-street'));
  await wait(900);
  await shot('11-scene-sheet');
  await page.evaluate(() => { document.querySelector('.overlay')?.click(); });
  await wait(600);
  await page.evaluate(() => window.__app.screen.lockedSheet('weavers-row'));
  await wait(900);
  await shot('12-locked-sheet');
  await page.evaluate(() => { document.querySelector('.overlay')?.click(); });
  await wait(600);
  await page.evaluate(() => window.__app.screen.dailySheet());
  await wait(900);
  await shot('13-daily-sheet');
}
