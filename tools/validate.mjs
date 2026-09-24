// Content validator: checks every village pack for broken references and
// impossible data before the bot plays it. Run: npm run validate
import { loadFromDisk } from './lib/node-content.mjs';
import { polyArea, bbox } from '../src/core/geometry.js';

const c = await loadFromDisk();
const errors = [], warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const sprite = (key, vid, where) => { if (!c.resolve(key, vid)) err(where, `missing art "${key}"`); };
const inBounds = (pts, W, H, where) => {
  for (const [x, y] of pts) if (x < 0 || y < 0 || x > W || y > H) { err(where, `point ${x},${y} outside the scene`); return; }
};

// common data
for (const [id, f] of Object.entries(c.faults)) {
  for (const k of ['name', 'label', 'verb', 'points', 'strategy', 'fix', 'sfx', 'phrase']) if (f[k] == null) err(`fault ${id}`, `missing "${k}"`);
  if (f.pool && !c.items[f.pool]) err(`fault ${id}`, `unknown item pool "${f.pool}"`);
}
for (const [pool, items] of Object.entries(c.items)) {
  if (pool === 'cat') { for (const p of Object.values(items.poses)) sprite(p.sprite, null, 'cat'); continue; }
  for (const [id, it] of Object.entries(items)) { sprite(it.sprite, null, `item ${pool}/${id}`); if (it.fly) sprite(it.fly, null, `item ${id}`); }
}
for (const t of c.tiers) for (const cond of Object.keys(t.conditions)) if (!c.conditions[cond]) err(`tier ${t.tier}`, `unknown condition ${cond}`);

for (const [vid, v] of Object.entries(c.villages)) {
  const W = (s) => `${vid}/${s}`;
  if (!v.sceneOrder.includes(v.start)) err(W('village'), `start scene "${v.start}" not in scenes`);
  sprite(v.map.image, vid, W('map'));
  const projectIds = new Set(v.projects.map((p) => p.id));
  const unlocked = new Set([v.start]);
  for (const p of v.projects) {
    if (!v.scenes[p.scene]) err(W(`project ${p.id}`), `unknown scene ${p.scene}`);
    if (p.unlocks) {
      if (!v.scenes[p.unlocks]) err(W(`project ${p.id}`), `unlocks unknown scene ${p.unlocks}`);
      if (unlocked.has(p.unlocks)) err(W(`project ${p.id}`), `scene ${p.unlocks} unlocked twice`);
      unlocked.add(p.unlocks);
    }
    if (!v.villagers[p.villager]) err(W(`project ${p.id}`), `unknown villager ${p.villager}`);
  }
  for (const sid of v.sceneOrder) if (!unlocked.has(sid)) err(W(sid), 'no project unlocks this scene');
  if (!v.map.pins) err(W('map'), 'no pins');
  for (const sid of v.sceneOrder) if (!v.map.pins[sid]) err(W(sid), 'no map pin');
  // villagers
  const kinds = c.requests.templates.map((t) => t.kind);
  for (const [id, vg] of Object.entries(v.villagers)) {
    sprite(vg.portrait, vid, W(`villager ${id}`));
    if (vg.letterOnly) continue;
    for (const k of kinds) if (!vg.lines[k]?.length) warn(W(`villager ${id}`), `no lines for request kind "${k}"`);
    if ((vg.letters || []).length < c.requests.friendship.levels.length) warn(W(`villager ${id}`), 'fewer letters than friendship levels');
    if (vg.home && !v.scenes[vg.home]) err(W(`villager ${id}`), `unknown home ${vg.home}`);
  }
  // collectibles
  const setIds = new Set(v.collectibles.sets.map((s) => s.id));
  for (const s of v.collectibles.sets) for (const it of s.items) { sprite(it.sprite, vid, W(`collectible ${it.id}`)); if (!it.text) warn(W(it.id), 'no flavour text'); }
  // scenes
  for (const sid of v.sceneOrder) {
    const s = v.scenes[sid];
    const where = W(sid);
    const [SW, SH] = s.size;
    sprite(s.plate, vid, where);
    if (!v.villagers[s.villager]) err(where, `unknown villager ${s.villager}`);
    for (const set of s.sets || []) if (!setIds.has(set)) err(where, `unknown collectible set ${set}`);
    if (!s.zones?.length) err(where, 'no ground zones (litter needs somewhere to go)');
    for (const z of s.zones || []) { inBounds(z.poly, SW, SH, `${where} zone ${z.id}`); if (polyArea(z.poly) < 2000) warn(`${where} zone ${z.id}`, 'very small'); }
    for (const e of s.edges || []) inBounds(e.line, SW, SH, `${where} edge ${e.id}`);
    const ids = new Set();
    for (const r of s.regions || []) {
      if (ids.has(r.id)) err(where, `duplicate region id ${r.id}`);
      ids.add(r.id);
      if (r.poly.length < 3) err(`${where} region ${r.id}`, 'needs 3+ points');
      inBounds(r.poly, SW, SH, `${where} region ${r.id}`);
      const b = bbox(r.poly);
      if (b.w < 8 || b.h < 8) warn(`${where} region ${r.id}`, 'tiny');
    }
    const allProps = [...(s.props || []), ...(s.restoration || []).flatMap((r) => r.props || [])];
    for (const p of allProps) {
      if (ids.has(p.id)) err(where, `duplicate id ${p.id}`);
      ids.add(p.id);
      sprite(p.sprite, vid, `${where} prop ${p.id}`);
      if (!(p.h > 0)) err(`${where} prop ${p.id}`, 'needs a height');
    }
    for (const l of s.lamps || []) ids.add(l.id);
    for (const n of s.neglect || []) {
      if (!ids.has(n.target)) err(`${where} neglect`, `unknown target ${n.target}`);
      if (!projectIds.has(n.project)) err(`${where} neglect`, `unknown project ${n.project}`);
    }
    for (const r of s.restoration || []) if (!projectIds.has(r.project)) err(`${where} restoration`, `unknown project ${r.project}`);
    for (const cat of s.cats || []) if (!c.items.cat.poses[cat.pose]) err(`${where} cat`, `unknown pose ${cat.pose}`);
    if (!(s.cats || []).length) warn(where, 'no cat spots: Marmalade can’t hide here');
    const tagged = (t) => allProps.some((p) => (p.tags || []).includes(t));
    if (!tagged('tiltable')) warn(where, 'no tiltable props: no "crooked" faults possible');
    if (!(s.regions || []).some((r) => r.tags.includes('window'))) warn(where, 'no windows: no "grimy" faults');
    if (!(s.lamps || []).length) warn(where, 'no lamps: dusk has no "unlit" faults here');
  }
}

console.log(`Validated ${Object.keys(c.villages).length} village pack(s).`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s).` : '\nNo errors.');
process.exit(errors.length ? 1 : 0);
