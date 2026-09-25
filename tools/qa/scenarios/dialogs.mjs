// Settings, profile, pause, level-up, keepsake, set complete, purchase, letter from a friend.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app;
    app.save.flags.intro = true; app.save.flags.tutorial = true; for (const t of Object.keys(window.__app.content.faults)) app.save.flags.seen['job:' + t] = true; for (const k of Object.keys(window.__app.content.intro.cards)) app.save.flags.seen['intro:' + k] = true; app.save.flags.seen.mapIntro = true;
    app.save.player.plays = 12; app.save.player.xp = 300;
    await window.__flows.goMap(app, { transition: 'none' });
  });
  await wait(1200);
  await page.locator('.topbar .iconbtn.small').click({ force: true });
  await wait(900);
  await shot('95-settings');
  await page.evaluate(() => document.querySelector('.overlay').click());
  await wait(500);
  await page.locator('.level-badge').click({ force: true });
  await wait(900);
  await shot('96-profile');
  await page.evaluate(() => document.querySelector('.overlay').click());
  await wait(500);
  await page.evaluate(async () => {
    const { showRewardsQueue } = await import('/src/ui/components/rewards.js');
    const app = window.__app;
    const set = app.v.collectibles.sets[1];
    showRewardsQueue(app, { levelUps: [{ level: 5, title: 'Keen Amateur', reward: { flashbulbs: 1, fund: 60, cosmetic: 'film-sepia' } }],
      events: [{ kind: 'collectible', item: set.items[2], set }], sets: [set] });
  });
  await wait(1200);
  await shot('97-levelup');
  await page.locator('.celebrate .btn').first().click({ force: true });
  await wait(900);
  await shot('98-keepsake');
  await page.locator('.celebrate .btn').first().click({ force: true });
  await wait(900);
  await shot('99-set');
}
