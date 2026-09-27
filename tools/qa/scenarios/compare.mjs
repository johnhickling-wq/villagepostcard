// Clear-weather before/after of every scene, as the player first finds it
// (its first visit's work in place, nothing restored) and fully restored, plus
// a whole-game contact sheet. Writes JPEGs to the output folder:
//   compare-<scene>.jpg     before above after
//   contact-before.jpg      every scene untreated
//   contact-after.jpg       every scene completed
//   contact-partial.jpg     every scene part-restored (its first visit done)
// COND=golden (etc.) renders another weather instead of clear.
import { writeFile } from 'node:fs/promises';

export default async function ({ page, wait, url }) {
  const out = process.argv[3] || 'scratch_art/shots';
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  const res = await page.evaluate(async (cond) => {
    const app = window.__app, c = app.content, vid = app.village;
    const { SceneView } = await import('/src/render/sceneView.js');
    const { generateVisit } = await import('/src/core/mess.js');
    const view = new SceneView(document.createElement('canvas'), app);
    const v = c.village(vid);
    const W = 1200;
    const shots = {};
    const sheets = { before: [], partial: [], after: [] };
    for (const sid of v.sceneOrder) {
      const scene = c.scene(vid, sid);
      const all = (scene.restoration || []).map((r) => r.effect);
      const visits = v.visits.filter((x) => x.scene === sid);
      const first = visits[0];
      // effects done before the first visit here, in route order
      const idx = v.visits.indexOf(first);
      const prior = v.visits.slice(0, idx).flatMap((x) => x.effects);
      const mess = generateVisit(c, { village: vid, visit: first.id, seed: 7, effectsDone: prior, fixed: [], cat: false });
      mess.condition = cond; // the same light for before and after
      await view.load({ village: vid, scene: sid, mess, effects: prior, fixed: [], bloom: 0, condition: cond });
      const before = view.renderStill('before', W);
      const partialFx = [...prior, ...first.effects];
      await view.load({ village: vid, scene: sid, effects: partialFx, fixed: first.tasks.filter((t) => t.target).map((t) => t.target), bloom: first.restores ? 1 : 1 / Math.max(1, visits.filter((x) => x.kind === 'restoration').length), condition: cond });
      const partial = view.renderStill('after', W);
      await view.load({ village: vid, scene: sid, effects: all, fixed: visits.flatMap((x) => x.tasks.filter((t) => t.target).map((t) => t.target)), bloom: 1, condition: cond });
      const after = view.renderStill('after', W);
      const pair = document.createElement('canvas');
      pair.width = W; pair.height = before.height * 2 + 8;
      const g = pair.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, pair.width, pair.height);
      g.drawImage(before, 0, 0); g.drawImage(after, 0, before.height + 8);
      shots[sid] = pair.toDataURL('image/jpeg', 0.86);
      sheets.before.push(before); sheets.partial.push(partial); sheets.after.push(after);
    }
    const sheet = (list) => {
      const cw = 600, ch = 300, cols = 2, rows = Math.ceil(list.length / cols);
      const s = document.createElement('canvas');
      s.width = cw * cols + 6 * (cols - 1); s.height = ch * rows + 6 * (rows - 1);
      const g = s.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, s.width, s.height);
      list.forEach((im, i) => g.drawImage(im, (i % cols) * (cw + 6), Math.floor(i / cols) * (ch + 6), cw, ch));
      return s.toDataURL('image/jpeg', 0.86);
    };
    return { shots, contact: { before: sheet(sheets.before), partial: sheet(sheets.partial), after: sheet(sheets.after) } };
  }, process.env.COND || 'clear');
  const save = (name, data) => writeFile(`${out}/${name}.jpg`, Buffer.from(data.split(',')[1], 'base64'));
  const tag = process.env.COND && process.env.COND !== 'clear' ? `-${process.env.COND}` : '';
  for (const [sid, d] of Object.entries(res.shots)) { await save(`compare-${sid}${tag}`, d); console.log('wrote', `compare-${sid}${tag}`); }
  for (const [k, d] of Object.entries(res.contact)) { await save(`contact-${k}${tag}`, d); console.log('wrote', `contact-${k}${tag}`); }
}
