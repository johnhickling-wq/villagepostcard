// Content validator: checks every village pack for broken references and
// impossible data before the bot plays it. Run: npm run validate
import { loadFromDisk } from './lib/node-content.mjs';
import { polyArea, bbox } from '../src/core/geometry.js';
import { generateVisit, allProps as everyProp } from '../src/core/mess.js';

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
  for (const k of ['name', 'label', 'verb', 'action', 'actionIcon', 'intro', 'points', 'strategy', 'fix', 'sfx', 'phrase']) if (f[k] == null) err(`fault ${id}`, `missing "${k}"`);
  if (!c.resolve(f.actionArt || `tools/${f.actionIcon}`, null)) warn(`fault ${id}`, `no cut-paper art for ${f.actionArt || `tools/${f.actionIcon}`}; the bar falls back to a line icon`);
  if (f.pool && !c.items[f.pool]) err(`fault ${id}`, `unknown item pool "${f.pool}"`);
}
for (const [pool, items] of Object.entries(c.items)) {
  if (pool === 'cat') { for (const p of Object.values(items.poses)) sprite(p.sprite, null, 'cat'); continue; }
  for (const [id, it] of Object.entries(items)) { sprite(it.sprite, null, `item ${pool}/${id}`); if (it.fly) sprite(it.fly, null, `item ${id}`); }
}
for (const t of c.tiers) for (const cond of Object.keys(t.conditions)) if (!c.conditions[cond]) err(`tier ${t.tier}`, `unknown condition ${cond}`);
// the step-by-step introduction
for (const t of c.intro.storyJobs || []) if (!c.faults[t]) err('intro', `unknown job "${t}"`);
const FEATURES = ['loupe', 'zoom', 'journal', 'cat', 'combo', 'level', 'walks', 'collectibles', 'requests', 'flash', 'daily', 'travel'];
for (const f of [...Object.keys(c.intro.features || {}), ...(c.intro.afterFinale || [])]) if (!FEATURES.includes(f)) err('intro', `unknown feature "${f}"`);
for (const f of Object.keys(c.intro.cards || {})) if (!(f in (c.intro.features || {})) && !(c.intro.afterFinale || []).includes(f)) err('intro', `card for "${f}", which has no unlock point`);
for (const f of Object.keys(c.intro.coach || {})) if (!['loupe', 'loupeClearer', 'zoom', 'score', 'combo', 'flash'].includes(f)) warn('intro', `coach line "${f}" is never used`);
// the story rules
const story = c.story;
for (const op of story.ops) if (!c.faults[op]) err('story', `unknown operation "${op}"`);
for (const [id, inc] of Object.entries(story.incidents)) {
  if (!c.conditions[inc.condition]) err(`incident ${id}`, `unknown condition ${inc.condition}`);
  for (const op of inc.ops) if (!story.ops.includes(op)) err(`incident ${id}`, `unknown operation ${op}`);
  for (const it of inc.items) if (!c.items.litter[it]) err(`incident ${id}`, `unknown litter item ${it}`);
}
for (const key of Object.keys(story.planters)) if (!c.resolve(key, null)) err('story planters', `missing art "${key}"`);

for (const [vid, v] of Object.entries(c.villages)) {
  const W = (s) => `${vid}/${s}`;
  if (!v.sceneOrder.includes(v.start)) err(W('village'), `start scene "${v.start}" not in scenes`);
  // postcards and album slots take one shape per village
  const ar = (sid) => v.scenes[sid].size[0] / v.scenes[sid].size[1];
  for (const sid of v.sceneOrder) if (Math.abs(ar(sid) - ar(v.start)) > 0.01) err(W(sid), `aspect ${ar(sid).toFixed(2)} differs from the start scene's ${ar(v.start).toFixed(2)}`);
  sprite(v.map.image, vid, W('map'));
  validateVisits(v, vid, W);
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
    const effects = new Set((s.restoration || []).map((r) => r.effect));
    for (const n of s.neglect || []) {
      if (!ids.has(n.target)) err(`${where} neglect`, `unknown target ${n.target}`);
      if (!effects.has(n.effect)) err(`${where} neglect`, `unknown effect ${n.effect}`);
      if (!['faded', 'grimy', 'wilted'].includes(n.type)) err(`${where} neglect`, `type ${n.type} can't be persistent`);
    }
    for (const r of s.restoration || []) {
      if (!r.effect) err(`${where} restoration`, 'a layer needs an effect id');
      for (const [pid, col] of Object.entries(r.tints || {})) {
        if (!story.colours[col]) err(`${where} ${r.effect}`, `unknown colour ${col}`);
        const p = everyProp(s).find((q) => q.id === pid);
        if (!p) err(`${where} ${r.effect}`, `tint for unknown prop ${pid}`);
        else if (!story.planters[p.sprite]) err(`${where} ${r.effect}`, `${pid} (${p.sprite}) isn't a planter, so its flowers can't be recoloured`);
      }
      for (const pid of Object.keys(r.labels || {})) if (!everyProp(s).some((q) => q.id === pid)) err(`${where} ${r.effect}`, `label for unknown prop ${pid}`);
    }
    for (const cat of s.cats || []) if (!c.items.cat.poses[cat.pose]) err(`${where} cat`, `unknown pose ${cat.pose}`);
    if (!(s.cats || []).length) warn(where, 'no cat spots: Marmalade can’t hide here');
    const tagged = (t) => allProps.some((p) => (p.tags || []).includes(t));
    if (!tagged('tiltable')) warn(where, 'no tiltable props: no "crooked" faults possible');
    if (!(s.regions || []).some((r) => r.tags.includes('window'))) warn(where, 'no windows: no "grimy" faults');
    if (!(s.lamps || []).length) warn(where, 'no lamps: dusk has no "unlit" faults here');
  }
}

/** The restoration route: a graph with no cycles or dead ends, real targets, allowed
 *  operations, every layer committed once, and work that generates cleanly in route order. */
function validateVisits(v, vid, W) {
  const visits = v.visits || [];
  if (!visits.length) { err(W('visits'), 'no visits.json route'); return; }
  const byId = new Map();
  for (const vt of visits) {
    if (byId.has(vt.id)) err(W(`visit ${vt.id}`), 'duplicate id');
    byId.set(vt.id, vt);
  }
  if (visits[0].scene !== v.start) err(W('visits'), `the first visit should be at the start scene ${v.start}`);
  if (visits[0].after?.length) err(W('visits'), 'the first visit must have no prerequisites');
  const layerOwner = new Map();
  for (const vt of visits) {
    const where = W(`visit ${vt.id}`);
    const scene = v.scenes[vt.scene];
    if (!scene) { err(where, `unknown scene ${vt.scene}`); continue; }
    if (!['restoration', 'incident', 'committee'].includes(vt.kind)) err(where, `unknown kind ${vt.kind}`);
    if (!v.villagers[vt.villager]) err(where, `unknown villager ${vt.villager}`);
    for (const k of ['title', 'goal', 'brief', 'improved', 'reaction']) if (!vt[k]) err(where, `missing "${k}"`);
    if (vt.kind !== 'incident' && !vt.stage) warn(where, 'no "stage" label for the place');
    for (const a of vt.after || []) if (!byId.has(a)) err(where, `unknown prerequisite ${a}`);
    if (vt.condition && !c.conditions[vt.condition]) err(where, `unknown condition ${vt.condition}`);
    const incident = vt.incident ? story.incidents[vt.incident] : null;
    if (vt.kind === 'incident' && !incident) err(where, `incident visits need an incident from story.json (got ${vt.incident})`);
    if (incident && vt.effects.length) err(where, 'an incident is temporary: it can’t make permanent effects');
    const layers = new Set((scene.restoration || []).map((r) => r.effect));
    for (const e of vt.effects) {
      if (!layers.has(e)) err(where, `effect ${e} is not a restoration layer of ${vt.scene}`);
      if (layerOwner.has(e)) err(where, `effect ${e} is already made by ${layerOwner.get(e)}`);
      layerOwner.set(e, vt.id);
    }
    const taskIds = new Set();
    const props = new Map(everyProp(scene).map((p) => [p.id, p]));
    for (const t of vt.tasks) {
      const tw = `${where} task ${t.id}`;
      if (taskIds.has(t.id)) err(tw, 'duplicate task id');
      taskIds.add(t.id);
      const f = c.faults[t.op];
      if (!story.ops.includes(t.op) || !f) { err(tw, `unknown operation ${t.op}`); continue; }
      if (incident && !incident.ops.includes(t.op)) err(tw, `${t.op} isn't allowed after ${vt.incident} (allowed: ${incident.ops.join(', ')})`);
      if (t.target) {
        if (f.strategy === 'region' && !(scene.regions || []).some((r) => r.id === t.target)) err(tw, `no region ${t.target}`);
        if ((f.strategy === 'prop' || f.strategy === 'plant') && !props.has(t.target)) err(tw, `no prop ${t.target}`);
        if (f.strategy === 'lamp' && !(scene.lamps || []).some((l) => l.id === t.target)) err(tw, `no lamp ${t.target}`);
        if (f.strategy === 'plant') {
          const p = props.get(t.target);
          if (p && !story.planters[p.sprite]) err(tw, `${t.target} (${p.sprite}) has no planter definition in story.json`);
          if (t.colour && !story.colours[t.colour]) err(tw, `unknown colour ${t.colour}`);
          const layer = (scene.restoration || []).find((r) => (r.props || []).some((q) => q.id === t.target));
          if (layer && !t.colour && !vt.effects.includes(layer.effect)) err(tw, `plants ${t.target}, but its layer ${layer.effect} is made by another visit`);
        }
        const neg = (scene.neglect || []).find((n) => n.target === t.target);
        if (neg && ['faded', 'grimy', 'wilted'].includes(t.op) && neg.type !== t.op) warn(tw, `${t.target} looks ${neg.type} but the job is ${t.op}`);
      } else {
        if (f.strategy !== 'spawn') err(tw, `${t.op} needs a target`);
        const slots = f.slot === 'edges' ? scene.edges || [] : scene.zones || [];
        for (const z of t.zones || t.edges || []) if (!slots.some((x) => x.id === z)) err(tw, `no ${f.slot} "${z}" in ${vt.scene}`);
        for (const it of t.items || []) {
          if (!c.items[f.pool][it]) err(tw, `unknown ${f.pool} item ${it}`);
          if (incident && !incident.items.includes(it)) err(tw, `${it} isn't ${vt.incident} debris`);
        }
      }
    }
  }
  for (const sid of v.sceneOrder) {
    const here = visits.filter((x) => x.scene === sid);
    if (!here.length) err(W(sid), 'no visit ever goes here');
    if (here.filter((x) => x.restores).length !== 1) err(W(sid), `needs exactly one visit marked "restores" (has ${here.filter((x) => x.restores).length})`);
    for (const r of v.scenes[sid].restoration || []) if (!layerOwner.has(r.effect)) err(W(sid), `restoration layer ${r.effect} is never made by a visit`);
  }
  const finales = visits.filter((x) => x.finale);
  if (finales.length !== 1) err(W('visits'), `needs exactly one finale visit (has ${finales.length})`);
  // reachability, no cycles: play the route in order, then check nothing is left
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const vt of visits) if (!done.has(vt.id) && (vt.after || []).every((a) => done.has(a))) { done.add(vt.id); progress = true; }
  }
  for (const vt of visits) if (!done.has(vt.id)) err(W(`visit ${vt.id}`), 'can never become available (a cycle or a missing prerequisite)');
  const order = visits.map((x) => x.id);
  for (const vt of visits) for (const a of vt.after || []) if (order.indexOf(a) > order.indexOf(vt.id)) warn(W(`visit ${vt.id}`), `listed before its prerequisite ${a}`);
  if (finales[0]) {
    const needs = new Set();
    const walk = (id) => { for (const a of byId.get(id)?.after || []) if (!needs.has(a)) { needs.add(a); walk(a); } };
    walk(finales[0].id);
    for (const vt of visits) if (vt !== finales[0] && !needs.has(vt.id)) err(W(`visit ${vt.id}`), 'the finale does not require it, so judging could start without it');
  }
  // every neglect is lifted by some visit
  for (const sid of v.sceneOrder) {
    for (const n of v.scenes[sid].neglect || []) {
      if (!layerOwner.has(n.effect)) err(W(`${sid} neglect ${n.target}`), `its effect ${n.effect} is never made`);
    }
  }
  // legacy (save v2) mapping
  for (const [p, sid] of Object.entries(v.legacy?.access || {})) if (!v.scenes[sid]) err(W('legacy'), `${p} opens unknown scene ${sid}`);
  for (const e of v.legacy?.effects || []) if (!layerOwner.has(e)) err(W('legacy'), `old project ${e} has no layer`);
  // generation in route order: every task placed, for many seeds
  const effects = new Set(), fixed = {};
  for (const vt of visits) {
    for (let seed = 1; seed <= 25; seed++) {
      const m = generateVisit(c, { village: vid, visit: vt, seed, effectsDone: effects, fixed: fixed[vt.scene] || [], cat: seed % 2 === 0 });
      if (m.problems.length) { err(W(`visit ${vt.id}`), `seed ${seed}: ${m.problems.join('; ')}`); break; }
      if (m.skipped.length) { err(W(`visit ${vt.id}`), `in route order these tasks are already done: ${m.skipped.join(', ')}`); break; }
    }
    for (const e of vt.effects) effects.add(e);
    for (const t of vt.tasks) if (t.target && ['faded', 'grimy', 'wilted'].includes(t.op)) (fixed[vt.scene] ||= []).push(t.target);
  }
}

console.log(`Validated ${Object.keys(c.villages).length} village pack(s).`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);
console.log(errors.length ? `\n${errors.length} error(s).` : '\nNo errors.');
process.exit(errors.length ? 1 : 0);
