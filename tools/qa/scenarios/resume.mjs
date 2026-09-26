// Interruptions: reload part-way through a visit (finished tasks stay
// finished), and reload during the reveal just after the last tap (the
// visit counts once, its rewards once).
import { seedStory } from './lib.mjs';

const tapOne = async (page) => {
  const p = await page.evaluate(() => { const s = window.__app.screen; const id = [...s.session.remaining][0]; const f = s.session.byId.get(id); return window.__app.view.worldToScreen(f.cx, f.cy); });
  await page.mouse.click(p[0], p[1]);
};

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 2);
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'green-tidy'));
  await wait(2600);
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  const j = page.locator('.job-card .btn'); if (await j.count()) await j.click({ force: true });
  await wait(400);
  for (let i = 0; i < 3; i++) { await tapOne(page); await wait(700); }
  const before = await page.evaluate(() => ({ left: window.__app.screen.session.left, done: window.__app.save.villages.honeycombe.progress['green-tidy']?.done }));
  console.log('before reload', JSON.stringify(before));
  await page.reload();
  await wait(3000);
  await page.mouse.click(420, 200); // title: carry on
  await wait(3200);
  await shot('r1-welcome-back');
  const after = await page.evaluate(() => ({ screen: window.__app.screen.constructor.name, left: window.__app.screen.session?.left }));
  console.log('after reload', JSON.stringify(after), after.left === before.left ? 'OK: finished tasks kept' : 'MISMATCH');
  await page.locator('.brief .btn').click({ force: true });
  await wait(600);
  await shot('r2-carrying-on');
  // finish, and reload in the middle of the reveal
  for (let g = 0; g < 12; g++) { const left = await page.evaluate(() => window.__app.screen.session?.left); if (!left) break; await tapOne(page); await wait(450); }
  const xp = await page.evaluate(() => window.__app.save.player.xp);
  await wait(900);
  await page.reload();
  await wait(3000);
  const st = await page.evaluate(() => ({ done: !!window.__app.save.villages.honeycombe.visits['green-tidy'], journal: !!window.__app.save.villages.honeycombe.journal['green-tidy'], active: window.__app.save.active, xp: window.__app.save.player.xp, visits: window.__app.save.stats.visits }));
  console.log('after mid-reveal reload', JSON.stringify(st), `xp at last tap ${xp}`, st.done && st.xp === xp ? 'OK: counted once' : 'CHECK');
  await page.mouse.click(420, 200);
  await wait(2500);
  await shot('r3-after-reload');
}
