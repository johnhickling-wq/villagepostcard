// The mess generator. Given a clean scene, a mastery tier, a condition and a
// seed, it decides exactly what is wrong with the scene: which litter lies
// where, which sign hangs crooked, which door has faded... Every fault comes
// with a known hit shape, a subtlety (0 = obvious, 1 = very subtle) and a
// salience score, so the game can hit-test it, the renderer can draw it and
// the bot can judge whether it's fair. Nothing here touches the DOM.

import { Rng, seedOf, bySubtlety, clamp, lerp } from './rng.js';
import * as G from './geometry.js';
import { colorDistance, hexToRgb } from './content.js';
import { calibrate } from './sim.js';

const DEG = Math.PI / 180;
const MARGIN = 14; // keep hit shapes this far inside the scene edges

export function depthScale(scene, y) {
  const d = scene.depth;
  const t = clamp((y - d.farY) / (d.nearY - d.farY), -0.3, 1.1);
  return Math.max(0.3, lerp(d.farScale, d.nearScale, t));
}

/** Tag match where the wanted tag may be a string or a list of alternatives. */
export const hasTag = (tags, want) => (Array.isArray(want) ? want.some((w) => (tags || []).includes(w)) : (tags || []).includes(want));

const doneSet = (projects) => (projects instanceof Set ? projects : new Set(projects || []));

/** Props present in the clean scene for the current restoration state. */
export function activeProps(scene, projectsDone) {
  const done = doneSet(projectsDone);
  const removed = new Set();
  const props = [...(scene.props || [])];
  for (const r of scene.restoration || []) {
    if (!done.has(r.project)) continue;
    props.push(...(r.props || []));
    for (const id of r.removes || []) removed.add(id);
  }
  return props.filter((p) => !removed.has(p.id));
}

/** Persistent neglect (faded/grimy regions, wilted props) not yet restored. */
export function activeNeglect(scene, projectsDone) {
  const done = doneSet(projectsDone);
  return (scene.neglect || []).filter((n) => !done.has(n.project));
}

/** 0..1 how restored (and therefore how lovely) this scene currently is. */
export function sceneBloom(scene, projectsDone) {
  const done = doneSet(projectsDone);
  const projects = scene.bloomProjects || (scene.restoration || []).map((r) => r.project);
  if (!projects.length) return 1;
  return projects.filter((p) => done.has(p)).length / projects.length;
}

/** Geometry of a prop in the clean scene: rect centre, size, pivot. */
export function propGeom(content, scene, prop) {
  const meta = content.spriteMeta(prop.sprite, scene.village);
  const h = prop.h;
  const w = prop.w || (h * meta.w) / meta.h;
  const top = prop.pivot === 'top';
  return { w, h, px: prop.x, py: prop.y, cx: prop.x, cy: top ? prop.y + h / 2 : prop.y - h / 2, top };
}

/** Polygon of a prop after rotating it by `angle` (radians) about a pivot. */
export function propPoly(g, angle = 0, pivot = null) {
  const pts = G.rectPoly(g.cx, g.cy, g.w, g.h, 0);
  const [ox, oy] = pivot || [g.px, g.py];
  const c = Math.cos(angle), s = Math.sin(angle);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

function inScene(scene, shape) {
  const b = G.shapeBounds(shape);
  const [W, H] = scene.size;
  return b.x >= MARGIN && b.y >= MARGIN && b.x + b.w <= W - MARGIN && b.y + b.h <= H - MARGIN;
}

/**
 * @param {Content} content
 * @param {object} o  {village, scene, tier, condition?, seed, projectsDone?, collectible?, script?}
 */
export function generateMess(content, o) {
  const village = content.village(o.village);
  const scene = village.scenes[o.scene];
  const rng = new Rng(seedOf('mess', o.village, o.scene, o.tier, o.seed));
  const tier = content.tier(o.tier);
  const condId = o.condition || rng.fork('cond').weighted(tier.conditions);
  const cond = content.conditions[condId];
  const done = doneSet(o.projectsDone);
  const props = activeProps(scene, done);
  const neglect = activeNeglect(scene, done);
  const offset = (scene.difficultyOffset || 0) + (village.difficultyBase || 0);

  const ctx = {
    content, scene, village, rng, tier, cond, condId, props,
    neglected: new Set(neglect.map((n) => n.target)),
    used: new Set(), faults: [], minSize: tier.minSize,
  };

  // ---- how many faults, of which types --------------------------------
  const count = o.script ? o.script.length
    : rng.int(tier.faults[0], tier.faults[1]) + Math.round(offset * 1.5);
  const capacity = capacities(ctx);
  const weights = {};
  for (const [type, w] of Object.entries(tier.types)) {
    const f = content.faults[type];
    if (!f || !capacity[type]) continue;
    if (f.requires === 'dark' && !cond.dark) continue;
    weights[type] = w * f.weight * (cond.faultMods?.[type] ?? 1) * (scene.mess?.types?.[type] ?? 1);
  }

  const plan = o.script ? o.script.slice() : planTypes(rng.fork('plan'), weights, capacity, count);
  const subRng = rng.fork('subtlety');
  const [s0, s1] = tier.subtlety;
  let id = 0;
  for (const type of plan) {
    const subtlety = clamp(subRng.float(s0, s1) + offset * 0.08, 0, 1);
    let fault = makeFault(ctx, type, subtlety);
    if (!fault && !o.script) {
      // fall back to litter, which can nearly always be placed
      fault = makeFault(ctx, 'litter', subtlety);
    }
    if (fault) {
      fault.id = `f${id++}`;
      ctx.faults.push(fault);
    }
  }

  for (const f of ctx.faults) f.salience = salience(ctx, f);

  const mess = {
    village: o.village, scene: o.scene, tier: o.tier, condition: condId, seed: o.seed,
    faults: ctx.faults,
    cat: placeCat(ctx),
    collectible: o.collectible ? placeCollectible(ctx, o.collectible) : null,
    neglect, props: props.map((p) => p.id),
  };
  Object.assign(mess, calibrate(content, mess, seedOf('cal', o.seed, o.scene, o.tier)));
  return mess;
}

// ---------------------------------------------------------------------------

/** Small regions (distant windows) only become faults at higher tiers. */
function regionBigEnough(ctx, r) {
  const b = G.bbox(r.poly);
  return Math.sqrt(b.w * b.h) >= ctx.minSize * 0.55;
}

function capacities(ctx) {
  const { scene, props, neglected } = ctx;
  const cap = {};
  for (const [type, f] of Object.entries(ctx.content.faults)) {
    switch (f.strategy) {
      case 'spawn': cap[type] = f.slot === 'edges' ? Math.min(4, (scene.edges || []).length * 2) : ((scene.zones || []).length ? 9 : 0); break;
      case 'prop': cap[type] = props.filter((p) => hasTag(p.tags, f.tag) && !neglected.has(p.id)).length; break;
      case 'region': cap[type] = (scene.regions || []).filter((r) => hasTag(r.tags, f.tag) && !neglected.has(r.id) && regionBigEnough(ctx, r)).length; break;
      case 'lamp': cap[type] = (scene.lamps || []).length; break;
      case 'corner': cap[type] = Math.min(3, (scene.regions || []).filter((r) => hasTag(r.tags, f.tag)).length); break;
      case 'perch': cap[type] = Math.min(3, (scene.perches || []).length); break;
      default: cap[type] = 0;
    }
  }
  return cap;
}

/** Choose fault types: variety first, then weighted with diminishing returns. */
function planTypes(rng, weights, capacity, count) {
  const w = { ...weights };
  const left = { ...capacity };
  const plan = [];
  const distinct = Math.min(4, Object.keys(w).length);
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const pool = {};
    for (const [t, v] of Object.entries(w)) {
      if (left[t] <= 0) continue;
      if (seen.size < distinct && seen.has(t)) continue;
      pool[t] = v;
    }
    const t = rng.weighted(Object.keys(pool).length ? pool : Object.fromEntries(Object.entries(w).filter(([k]) => left[k] > 0)));
    if (!t) break;
    plan.push(t);
    seen.add(t);
    left[t]--;
    w[t] *= t === 'litter' ? 0.88 : 0.7;
  }
  return plan;
}

function makeFault(ctx, type, subtlety) {
  const f = ctx.content.faults[type];
  switch (f.strategy) {
    case 'spawn': return spawnItem(ctx, type, f, subtlety);
    case 'prop': return propFault(ctx, type, f, subtlety);
    case 'region': return regionFault(ctx, type, f, subtlety);
    case 'lamp': return lampFault(ctx, type, f, subtlety);
    case 'corner': return cornerFault(ctx, type, f, subtlety);
    case 'perch': return perchFault(ctx, type, f, subtlety);
  }
  return null;
}

function clearOfOthers(ctx, shape, spacing) {
  const b = G.shapeBounds(shape);
  const [cx, cy] = G.shapeCenter(shape);
  for (const other of ctx.faults) {
    const ob = G.shapeBounds(other.shape);
    if (G.boundsOverlap(b, ob) > 0.1) return false;
    const [ox, oy] = G.shapeCenter(other.shape);
    if (Math.hypot(cx - ox, cy - oy) < spacing) return false;
  }
  return true;
}

/** Litter must not hide behind a prop that is drawn in front of it. */
function notOccluded(ctx, shape, baseY) {
  const b = G.shapeBounds(shape);
  for (const p of ctx.props) {
    const g = propGeom(ctx.content, ctx.scene, p);
    if (g.top) continue; // hanging props float above the ground
    if (p.y <= baseY) continue; // prop is behind the item
    const pb = { x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h };
    if (G.boundsOverlap(b, pb) > 0.25) return false;
  }
  for (const occ of ctx.scene.occluders || []) {
    if (G.pointInPoly(b.x + b.w / 2, b.y + b.h / 2, occ.poly)) return false;
  }
  return true;
}

function itemWeights(ctx, pool) {
  const themes = { general: 1, ...(ctx.scene.mess?.themes || {}) };
  for (const [t, m] of Object.entries(ctx.cond.themeMods || {})) themes[t] = (themes[t] || 0.3) * m;
  const w = {};
  for (const [id, item] of Object.entries(pool)) {
    let s = 0;
    for (const [t, v] of Object.entries(item.themes || { general: 1 })) s += v * (themes[t] || 0);
    if (s > 0) w[id] = s;
  }
  return w;
}

function spawnItem(ctx, type, f, subtlety) {
  const { content, scene, rng } = ctx;
  const pool = content.items[f.pool];
  const weights = itemWeights(ctx, pool);
  // already-used items are less likely, for variety
  for (const flt of ctx.faults) if (flt.item && weights[flt.item]) weights[flt.item] *= 0.35;
  const camo = bySubtlety(f.camouflage, subtlety);
  const want = 1 + Math.round(camo * 6);
  const slots = f.slot === 'edges' ? scene.edges : scene.zones;
  if (!slots?.length) return null;
  const slotWeights = Object.fromEntries(slots.map((s, i) => [i, (s.weight ?? 1) * (s.poly ? Math.sqrt(G.polyArea(s.poly)) : 300)]));
  const valid = [];
  for (let attempt = 0; attempt < 60 && valid.length < want; attempt++) {
    const itemId = rng.weighted(weights);
    const item = pool[itemId];
    const slot = slots[+rng.weighted(slotWeights)];
    let x, y;
    if (slot.line) {
      [x, y] = G.randomPointOnPolyline(slot.line, rng);
      y += rng.float(-4, 6);
    } else {
      [x, y] = G.randomPointInPoly(slot.poly, rng);
    }
    const ds = depthScale(scene, y) * (slot.scale ?? 1);
    const meta = content.spriteMeta(item.sprite, scene.village);
    const h = item.size * ds * bySubtlety(f.sizeMul, subtlety);
    const w = (h * meta.w) / meta.h;
    if (Math.sqrt(w * h) < ctx.minSize) continue;
    const lie = type === 'litter';
    const rot = lie ? rng.float(-1, 1) * (item.lie ? 70 : 32) * DEG : rng.float(-6, 6) * DEG;
    const cx = x, cy = lie ? y - h * 0.3 : y - h / 2;
    const shape = { kind: 'poly', pts: G.rectPoly(cx, cy, w * 0.92, h * 0.92, rot) };
    if (!inScene(scene, shape)) continue;
    if (!clearOfOthers(ctx, shape, (f.spacing || 50) * ds)) continue;
    if (!notOccluded(ctx, shape, y)) continue;
    const ground = content.colorAt(scene, cx, cy);
    const contrast = colorDistance(hexToRgb(meta.color), ground);
    valid.push({ itemId, item, x, y, cx, cy, w, h, rot, shape, contrast });
  }
  if (!valid.length) return null;
  const pick = camo > 0.05 ? valid.reduce((a, b) => (a.contrast <= b.contrast ? a : b)) : valid[0];
  return {
    type, subtlety, item: pick.itemId, sprite: pick.item.sprite,
    x: pick.x, y: pick.y, cx: pick.cx, cy: pick.cy, w: pick.w, h: pick.h, rot: pick.rot,
    flip: rng.chance(0.5), contrast: pick.contrast, shape: pick.shape, size: G.shapeSize(pick.shape),
    z: pick.y,
  };
}

function propFault(ctx, type, f, subtlety) {
  const { content, scene, rng } = ctx;
  const candidates = ctx.props.filter((p) => hasTag(p.tags, f.tag) && !ctx.used.has(p.id) && !ctx.neglected.has(p.id));
  if (!candidates.length) return null;
  const p = rng.pick(candidates);
  ctx.used.add(p.id);
  const g = propGeom(content, scene, p);
  const fault = { type, subtlety, prop: p.id, sprite: p.sprite, z: p.y, cx: g.cx, cy: g.cy, w: g.w, h: g.h };
  if (type === 'crooked') {
    const sign = p.tiltSign || rng.sign();
    fault.angle = sign * bySubtlety(f.angle, subtlety) * DEG * (p.tiltScale ?? 1);
    fault.shape = { kind: 'poly', pts: propPoly(g, fault.angle) };
  } else if (type === 'toppled') {
    const sign = p.fallSign || rng.sign();
    fault.angle = sign * bySubtlety(f.angle, subtlety) * DEG;
    fault.pivot = [g.px + sign * g.w / 2, g.py];
    fault.shape = { kind: 'poly', pts: propPoly(g, fault.angle, fault.pivot) };
  } else {
    fault.amount = bySubtlety(f.amount, subtlety);
    fault.shape = { kind: 'poly', pts: propPoly(g, 0) };
  }
  if (!inScene(scene, fault.shape) && type === 'toppled') {
    // fell out of frame: fall the other way instead
    fault.angle = -fault.angle;
    fault.pivot = [g.px + Math.sign(fault.angle) * g.w / 2, g.py];
    fault.shape = { kind: 'poly', pts: propPoly(g, fault.angle, fault.pivot) };
  }
  fault.size = G.shapeSize(fault.shape);
  [fault.cx, fault.cy] = G.shapeCenter(fault.shape);
  return fault;
}

function regionFault(ctx, type, f, subtlety) {
  const { scene, rng } = ctx;
  const candidates = (scene.regions || []).filter((r) => hasTag(r.tags, f.tag) && !ctx.used.has(r.id) && !ctx.neglected.has(r.id) && regionBigEnough(ctx, r));
  if (!candidates.length) return null;
  const r = rng.pick(candidates);
  ctx.used.add(r.id);
  const shape = { kind: 'poly', pts: r.poly };
  const [cx, cy] = G.shapeCenter(shape);
  return {
    type, subtlety, region: r.id, amount: bySubtlety(f.amount, subtlety), pattern: rng.int(0, 1e6),
    shape, cx, cy, size: G.shapeSize(shape), z: -1,
  };
}

function lampFault(ctx, type, f, subtlety) {
  const { scene, rng } = ctx;
  const candidates = (scene.lamps || []).filter((l) => !ctx.used.has(l.id));
  if (!candidates.length) return null;
  const l = rng.pick(candidates);
  ctx.used.add(l.id);
  const shape = { kind: 'circle', x: l.x, y: l.y, r: l.r * 1.25 };
  return { type, subtlety, lamp: l.id, shape, cx: l.x, cy: l.y, size: G.shapeSize(shape), z: -1 };
}

function cornerFault(ctx, type, f, subtlety) {
  const { scene, rng } = ctx;
  const regions = (scene.regions || []).filter((r) => hasTag(r.tags, f.tag) && !ctx.used.has('web:' + r.id));
  for (let attempt = 0; attempt < 8 && regions.length; attempt++) {
    const r = rng.pick(regions);
    const b = G.bbox(r.poly);
    const size = bySubtlety(f.size, subtlety) * clamp(Math.sqrt(b.w * b.h) / 110, 0.7, 1.3);
    const corner = rng.pick(['tl', 'tr']);
    const x = corner === 'tl' ? b.x : b.x + b.w;
    const y = b.y;
    const cx = x + (corner === 'tl' ? 1 : -1) * size * 0.32, cy = y + size * 0.32;
    const shape = { kind: 'circle', x: cx, y: cy, r: size * 0.5 };
    if (!inScene(scene, shape) || !clearOfOthers(ctx, shape, 30)) continue;
    ctx.used.add('web:' + r.id);
    return { type, subtlety, region: r.id, corner, x, y, cx, cy, webSize: size, pattern: rng.int(0, 1e6), shape, size: G.shapeSize(shape), z: 1e5 };
  }
  return null;
}

function perchFault(ctx, type, f, subtlety) {
  const { content, scene, rng } = ctx;
  const pool = content.items[f.pool];
  const perches = (scene.perches || []).filter((p, i) => !ctx.used.has('perch' + i));
  for (let attempt = 0; attempt < 6 && perches.length; attempt++) {
    const p = rng.pick(perches);
    const itemId = rng.pick(Object.keys(pool));
    const item = pool[itemId];
    const meta = content.spriteMeta(item.sprite, scene.village);
    const h = item.size * (p.s ?? depthScale(scene, p.y)) * bySubtlety(f.sizeMul, subtlety);
    const w = (h * meta.w) / meta.h;
    const cx = p.x, cy = p.y - h / 2;
    const shape = { kind: 'poly', pts: G.rectPoly(cx, cy, w, h, 0) };
    if (!inScene(scene, shape) || !clearOfOthers(ctx, shape, 40)) continue;
    ctx.used.add('perch' + scene.perches.indexOf(p));
    return {
      type, subtlety, item: itemId, sprite: item.sprite, fly: item.fly, x: p.x, y: p.y, cx, cy, w, h,
      flip: p.flip ?? rng.chance(0.5), shape, size: G.shapeSize(shape), z: 1e5 - 1,
    };
  }
  return null;
}

function placeCat(ctx) {
  const { content, scene, rng } = ctx;
  const spots = scene.cats || [];
  if (!spots.length) return null;
  const spot = rng.fork('cat').pick(spots);
  const pose = content.items.cat.poses[spot.pose];
  const meta = content.spriteMeta(pose.sprite, scene.village);
  const h = pose.size * (spot.s ?? depthScale(scene, spot.y));
  const w = (h * meta.w) / meta.h;
  const cx = spot.x, cy = spot.y - h / 2;
  return { sprite: pose.sprite, pose: spot.pose, x: spot.x, y: spot.y, cx, cy, w, h, flip: !!spot.flip, z: spot.z ?? spot.y,
    shape: { kind: 'poly', pts: G.rectPoly(cx, cy, w, h, 0) } };
}

function placeCollectible(ctx, item) {
  const { scene, rng } = ctx;
  const r = rng.fork('collectible');
  const zones = scene.zones || [];
  for (let attempt = 0; attempt < 40 && zones.length; attempt++) {
    const z = r.pick(zones);
    const [x, y] = G.randomPointInPoly(z.poly, r);
    const size = Math.max(52, 62 * depthScale(scene, y));
    const shape = { kind: 'circle', x, y: y - size * 0.4, r: size * 0.55 };
    if (!inScene(scene, shape) || !clearOfOthers(ctx, shape, 60)) continue;
    return { id: item.id, sprite: item.sprite, x, y, cx: x, cy: y - size * 0.4, size, shape, z: y };
  }
  return null;
}

/** How easy a fault is to notice, roughly 0.1 (very hard) .. 1.5 (jumps out). */
function salience(ctx, f) {
  const { scene, cond } = ctx;
  const type = ctx.content.faults[f.type];
  const sizeTerm = clamp(f.size / 110, 0.25, 1.4);
  let contrast;
  switch (f.type) {
    case 'litter': case 'weeds': contrast = 0.35 + 0.65 * clamp(f.contrast / 80, 0, 1); break;
    case 'crooked': contrast = clamp(Math.abs(f.angle) / DEG / 16, 0.3, 1.25); break;
    case 'toppled': contrast = 1.1; break;
    case 'faded': case 'grimy': case 'wilted': contrast = 0.3 + 0.75 * f.amount; break;
    case 'unlit': contrast = 1.2; break;
    case 'cobweb': contrast = 0.55; break;
    case 'pigeon': contrast = 0.9; break;
    default: contrast = 0.8;
  }
  let vis = cond.visibility ?? 1;
  if (cond.depthFade) {
    const t = clamp((f.cy - scene.depth.farY * 0.6) / (scene.size[1] - scene.depth.farY * 0.6), 0, 1);
    vis *= 1 - cond.depthFade * (1 - t);
  }
  if (cond.dark && f.type !== 'unlit') vis *= 0.9;
  const [W, H] = scene.size;
  const dc = Math.hypot((f.cx - W / 2) / W, (f.cy - H * 0.55) / H);
  const central = 1 - clamp(dc, 0, 0.6) * 0.25;
  return +(sizeTerm * contrast * vis * (type.salience ?? 1) * central).toFixed(3);
}
