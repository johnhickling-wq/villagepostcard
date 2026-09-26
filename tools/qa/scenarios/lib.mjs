// Shared helpers for QA scenarios.

/** Tap every remaining task in screen space (through the rotated stage if need be). */
export async function tapAll(page, wait, gap = 380) {
  for (let guard = 0; guard < 24; guard++) {
    const p = await page.evaluate(() => {
      const app = window.__app, s = app.screen;
      if (!s?.session || s.finishing || s.paused) return s?.paused ? 'paused' : null;
      const id = [...s.session.remaining][0];
      if (!id) return null;
      const f = s.session.byId.get(id);
      const [lx, ly] = app.view.worldToScreen(f.cx, f.cy);
      return app.rotated ? [window.innerWidth - ly, lx] : [lx, ly];
    });
    if (p === 'paused') { await wait(300); continue; }
    if (!p) return;
    await page.mouse.click(p[0], p[1]);
    await wait(gap);
  }
}

/** A save that has played the first n visits of the route (perfectly), sitting on the map. */
export async function seedStory(page, n, extra = {}) {
  await page.evaluate(async ([n, extra]) => {
    const app = window.__app, P = window.__progression, c = app.content;
    const { generateVisit } = await import('/src/core/mess.js');
    const { PlaySession } = await import('/src/core/session.js');
    const { makeSnapshot } = await import('/src/render/stills.js');
    const s = app.save;
    s.flags.intro = true;
    for (const visit of c.village('honeycombe').visits.slice(0, n)) {
      const plan = P.planVisit(s, c, 'honeycombe', visit.id);
      P.beginPlay(s, plan);
      const mess = generateVisit(c, { village: 'honeycombe', visit: visit.id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, cat: false });
      const ss = new PlaySession(c, mess, plan);
      for (const f of mess.faults) ss.tap(f.cx, f.cy, 4);
      for (const t of Object.keys(ss.fixes)) s.flags.seen['job:' + t] = true;
      const before = { effects: plan.effects, fixed: plan.fixed, bloom: plan.bloom };
      const after = { effects: [...new Set([...plan.effects, ...visit.effects])], fixed: plan.fixed, bloom: P.placeBloom(s, c, 'honeycombe', visit.scene, visit.id) };
      P.completeVisit(s, c, plan, ss.results(), makeSnapshot(mess, before, after));
    }
    // feature cards would pop up over whatever the scenario does next
    if (!extra.cards) for (const k of Object.keys(c.intro.cards)) s.flags.seen['intro:' + k] = true;
    Object.assign(s.flags.seen, extra.seen || {});
    if (extra.plays != null) s.player.plays = extra.plays;
    app.persist(true);
    await window.__flows.goMap(app, { transition: 'none' });
  }, [n, extra]);
  await wait(page, 1200);
}

const wait = (page, ms) => page.waitForTimeout(ms);
