// Every scene on a photo walk in a different weather (tier from TIER, default 5),
// on a fully restored village.
import { seedStory } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 14, { plays: 20 });
  const scenes = ['railway-halt', 'high-street', 'village-green', 'weavers-row', 'old-mill', 'bee-and-bramble', 'st-aldhelms', 'rose-cottage'];
  const conds = ['storm', 'dusk', 'mist', 'golden', 'dusk', 'storm', 'mist', 'golden'];
  const tier = +(process.env.TIER || 5);
  for (let i = 0; i < scenes.length; i++) {
    await page.evaluate(async ([sid, cond, tier]) => {
      const s = window.__app.save;
      for (const t of Object.keys(window.__app.content.faults)) s.flags.seen['job:' + t] = true;
      s.flags.seen['coach:score'] = true;
      await window.__flows.playWalk(window.__app, sid, { tier, condition: cond, seed: 1000 + sid.length });
    }, [scenes[i], conds[i], tier]);
    await wait(2600);
    await shot(`30-${i}-${scenes[i]}-${conds[i]}`);
  }
}
