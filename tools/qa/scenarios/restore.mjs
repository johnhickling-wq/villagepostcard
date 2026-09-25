// Buy a beautification project and an access project; capture the staging.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; for (const t of Object.keys(window.__app.content.faults)) s.flags.seen['job:' + t] = true; for (const k of Object.keys(window.__app.content.intro.cards)) s.flags.seen['intro:' + k] = true; s.flags.seen.mapIntro = true;
    s.player.fund = 2000; s.player.plays = 6;
    s.villages.honeycombe.scenes['railway-halt'].tier = 3;
    s.villages.honeycombe.projects['open-high-street'] = 1;
    await window.__flows.restoreProject(app, 'halt-paint');
  });
  await wait(700);
  await shot('40-restore-start');
  await wait(1600);
  await shot('41-restore-mid');
  await wait(3200);
  await shot('42-restore-done');
  await page.evaluate(async () => { await window.__flows.restoreProject(window.__app, 'halt-flowers'); });
  await wait(4500);
  await shot('43-restore-flowers');
  await page.evaluate(async () => { const app = window.__app; app.save.villages.honeycombe.scenes['railway-halt'].tier = 3; await window.__flows.restoreProject(app, 'open-village-green'); });
  await wait(1200);
  await shot('44-unlock-mid');
  await wait(2500);
  await shot('45-unlock-done');
  await page.evaluate(() => document.querySelector('.restore-foot .btn')?.click());
  await wait(2500);
  await shot('46-map-after-unlock');
}
