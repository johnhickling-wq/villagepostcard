export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; s.flags.seen.mapIntro = true;
    s.player.plays = 70; s.player.xp = 7000;
    const all = app.v.projects.map((p) => p.id);
    for (const pid of all) s.villages.honeycombe.projects[pid] = 1;
    let seed = 1;
    for (const sid of app.v.sceneOrder) {
      const sc = s.villages.honeycombe.scenes[sid];
      sc.tier = 3;
      sc.album.golden = { seed: seed++, tier: 3, condition: 'golden', stamps: 3, score: 2000, time: 60, date: '2026-09-20', projects: all };
    }
    await window.__flows.goMap(app, { transition: 'none' });
  });
  await wait(1500);
  await shot('70-map-judging');
  await page.evaluate(() => { window.__flows.judging(window.__app); });
  await wait(5000);
  await shot('71-judging-montage');
  await wait(6000);
  await shot('72-judging-award');
}
