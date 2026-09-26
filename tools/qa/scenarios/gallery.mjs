// Every scene at a high tier under a different condition, mid-play.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  const scenes = ['railway-halt', 'high-street', 'village-green', 'weavers-row', 'old-mill', 'bee-and-bramble', 'st-aldhelms', 'rose-cottage'];
  const conds = ['storm', 'dusk', 'mist', 'golden', 'dusk', 'storm', 'mist', 'golden'];
  const tier = +(process.env.TIER || 5);
  for (let i = 0; i < scenes.length; i++) {
    await page.evaluate(async ([sid, cond, tier]) => {
      const app = window.__app;
      const s = app.save;
      s.flags.intro = true; s.flags.tutorial = true; for (const t of Object.keys(window.__app.content.faults)) s.flags.seen['job:' + t] = true; for (const k of Object.keys(window.__app.content.intro.cards)) s.flags.seen['intro:' + k] = true; s.flags.seen.mapIntro = true;
      const v = app.v;
      for (const p of v.projects) if (p.unlocks) s.villages.honeycombe.projects[p.id] = 1;
      await window.__flows.playScene(app, sid, { tier, condition: cond, seed: 1000 + sid.length });
    }, [scenes[i], conds[i], tier]);
    await wait(2200);
    await shot(`30-${i}-${scenes[i]}-${conds[i]}`);
  }
}
