// Tap each kind of job and capture its fix animation mid-flight: a scripted
// photo walk for the weather jobs, then a visit for planting and replanting.
import { seedStory } from './lib.mjs';

async function tapEach(page, shot, wait, prefix) {
  const faults = await page.evaluate(() => window.__app.screen.mess.faults.map((f) => ({ id: f.id, type: f.type })));
  for (const f of faults) {
    await page.evaluate((fid) => { const v = window.__app.view; const f = window.__app.screen.mess.faults.find((x) => x.id === fid); v.cam = { x: f.cx, y: f.cy, zoom: 2.4 }; v.clampCam(); }, f.id);
    await wait(150);
    const p2 = await page.evaluate((fid) => { const f = window.__app.screen.mess.faults.find((x) => x.id === fid); return window.__app.view.worldToScreen(f.cx, f.cy); }, f.id);
    await shot(`${prefix}-${f.id}-a`);
    await page.mouse.click(p2[0], p2[1]);
    await wait(f.type === 'plant' ? 450 : f.type === 'crooked' || f.type === 'pigeon' ? 250 : 180);
    await shot(`${prefix}-${f.id}-b`);
    await wait(1100);
    if (f.type === 'plant') await shot(`${prefix}-${f.id}-c`);
  }
}

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 3, { plays: 20 });
  await page.evaluate(async () => {
    const s = window.__app.save;
    for (const t of Object.keys(window.__app.content.faults)) s.flags.seen['job:' + t] = true;
    s.flags.seen['coach:score'] = true;
    await window.__flows.playWalk(window.__app, 'high-street', { tier: 5, condition: 'dusk', seed: 77, script: ['faded', 'grimy', 'crooked', 'toppled', 'litter', 'weeds', 'cobweb', 'pigeon', 'unlit', 'wilted'] });
  });
  await wait(2800);
  await shot('50-fixes-before');
  await tapEach(page, shot, wait, '51');
  // planting (the Halt's tubs), then the colour request's replanting
  await page.evaluate(() => window.__flows.playVisit(window.__app, 'halt-refresh'));
  await wait(2600);
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  await tapEach(page, shot, wait, '52');
  await wait(4000);
  await page.evaluate(async () => {
    const s = window.__app.save;
    for (const id of ['row-restore', 'mill-race', 'hs-fete', 'pub-garden', 'green-flourish', 'church-restore', 'mill-storm', 'cottage-garden']) {
      const v = window.__app.content.visit('honeycombe', id);
      s.villages.honeycombe.visits[id] = { done: 1 };
      for (const e of v.effects) s.villages.honeycombe.effects[e] = 1;
    }
    await window.__flows.playVisit(window.__app, 'halt-colours');
  });
  await wait(2600);
  await shot('53-colours-brief');
  await page.locator('.brief .btn').click({ force: true });
  await wait(500);
  await tapEach(page, shot, wait, '54');
}
