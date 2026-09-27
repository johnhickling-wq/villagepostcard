// Every visit of the route (or VISITS=id,id), played the way a player reaches
// it: the save has played every earlier visit in route order. For each one:
// the brief, the scene at the start of play (the job card dismissed), and the
// scene after every job is done and the reveal has run, with checks that the
// visit counts once and earlier restoration is still in force.
//   node tools/qa/shots.mjs visits [outdir]         (VW/VH for other sizes)
import { seedStory, tapAll } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  const route = await page.evaluate(() => window.__app.content.village('honeycombe').visits.map((v) => v.id));
  const want = process.env.VISITS ? process.env.VISITS.split(',') : route;
  let failures = 0;
  for (const id of want) {
    const n = route.indexOf(id);
    // hold the old run's saves first, or its pagehide save writes it back
    await page.evaluate(() => { window.__app.holdSaves = true; localStorage.clear(); });
    await page.reload();
    await wait(2200);
    await seedStory(page, n, { plays: n });
    const before = await page.evaluate(() => Object.keys(window.__app.save.villages.honeycombe.effects));
    await page.evaluate((vid) => window.__flows.playVisit(window.__app, vid), id);
    await wait(2600);
    const tag = String(n + 1).padStart(2, '0');
    await shot(`v${tag}-${id}-a-brief`);
    await page.locator('.brief .btn').click({ force: true }).catch(() => {});
    await wait(500);
    const j = page.locator('.job-card .btn');
    if (await j.count()) { await shot(`v${tag}-${id}-b-jobcard`); await j.click({ force: true }); }
    await wait(900);
    await shot(`v${tag}-${id}-c-play`);
    await tapAll(page, wait, 520);
    await wait(5200);
    await shot(`v${tag}-${id}-d-reveal`);
    const st = await page.evaluate((vid) => {
      const s = window.__app.save, vs = s.villages.honeycombe;
      return { done: !!vs.visits[vid], journal: !!vs.journal[vid], visits: s.stats.visits, effects: Object.keys(vs.effects), active: s.active };
    }, id);
    const kept = before.every((e) => st.effects.includes(e));
    const ok = st.done && st.journal && st.visits === n + 1 && kept && !st.active;
    if (!ok) failures++;
    console.log(ok ? 'OK  ' : 'FAIL', id, JSON.stringify({ done: st.done, journal: st.journal, visits: st.visits, earlierKept: kept }));
  }
  console.log(failures ? `VISITS: ${failures} FAILURE(S)` : `VISITS: ALL ${want.length} OK`);
}
