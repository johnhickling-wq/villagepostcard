// Settings (with Reduce motion), profile, level-up, keepsake, set complete.
import { seedStory } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 4, { plays: 6 });
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
    showRewardsQueue(app, { levelUps: [{ level: 5, title: 'Keen Amateur', reward: { flashbulbs: 1, cosmetic: 'film-sepia' } }],
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
