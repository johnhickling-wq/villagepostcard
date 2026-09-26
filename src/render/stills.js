// Postcards in the journal and album are re-rendered, never stored as images.
//
//   render version 2 (the restoration update onwards): the entry is a snapshot
//     of its moment: the exact faults of that play and the permanent state
//     before and after it (effects, fixed things, warmth). Later restoration
//     never changes an old card.
//   no version (save v2 album cards): a seed and a project list, redrawn by
//     the legacy generator path with the restoration-update layers left out,
//     exactly as they were drawn when taken.

import { SceneView } from './sceneView.js';
import { generateMess } from '../core/mess.js';
import { hash } from '../core/rng.js';

export const RENDER_VERSION = 2;

const cache = new Map();
let view = null;
let queue = Promise.resolve();

const KEEP = ['id', 'type', 'sprite', 'item', 'x', 'y', 'cx', 'cy', 'w', 'h', 'rot', 'flip', 'angle', 'pivot', 'amount', 'pattern',
  'region', 'prop', 'lamp', 'corner', 'webSize', 'fly', 'colour', 'replant', 'from', 'z'];
const round = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(round) : v);

/** Just what the renderer needs to redraw a play's faults. */
export function compactFaults(faults) {
  return faults.map((f) => Object.fromEntries(KEEP.filter((k) => f[k] != null).map((k) => [k, round(f[k])])));
}

/**
 * A postcard's render description.
 * before/after: {effects, fixed, bloom, staged?}: the permanent state either side of the play
 */
export function makeSnapshot(mess, before, after) {
  return {
    rv: RENDER_VERSION, scene: mess.scene, condition: mess.condition, seed: mess.seed,
    ...(mess.visit ? { visit: mess.visit } : {}),
    before: { effects: [...before.effects], fixed: [...(before.fixed || [])], bloom: round(before.bloom), staged: [...(mess.staged || [])] },
    after: { effects: [...after.effects], fixed: [...(after.fixed || [])], bloom: round(after.bloom) },
    faults: compactFaults(mess.faults),
  };
}

export function renderPostcard(app, sceneId, entry, { width = 240, before = false, village = app.village } = {}) {
  const key = `${village}|${sceneId}|${entry.rv || 1}|${hash(JSON.stringify(entry))}|${width}|${before}`;
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue.then(async () => {
    view ||= new SceneView(document.createElement('canvas'), app);
    const thumb = width <= 480;
    if (entry.rv >= 2) {
      const base = { village, scene: sceneId, condition: entry.condition, thumb };
      await view.load({ ...base, effects: entry.after.effects, fixed: entry.after.fixed, bloom: entry.after.bloom });
      const after = view.renderStill('after', width).toDataURL('image/jpeg', 0.85);
      let beforeUrl = null;
      if (before) {
        const mess = { scene: sceneId, condition: entry.condition, seed: entry.seed, faults: entry.faults.map((f) => ({ ...f })), staged: entry.before.staged, cat: null, collectible: null };
        await view.load({ ...base, mess, effects: entry.before.effects, fixed: entry.before.fixed, bloom: entry.before.bloom });
        beforeUrl = view.renderStill('before', width).toDataURL('image/jpeg', 0.85);
      }
      return { after, before: beforeUrl };
    }
    const mess = generateMess(app.content, {
      village, scene: sceneId, tier: entry.tier, condition: entry.condition, seed: entry.seed,
      projectsDone: entry.projects || [], legacy: true,
      script: Array.isArray(entry.script) ? entry.script : null, types: entry.types || null, cat: entry.cat !== false,
    });
    await view.load({ village, scene: sceneId, mess, effects: entry.projects || [], legacy: true, thumb });
    const after = view.renderStill('after', width).toDataURL('image/jpeg', 0.85);
    const beforeUrl = before ? view.renderStill('before', width).toDataURL('image/jpeg', 0.85) : null;
    return { after, before: beforeUrl };
  }));
  cache.set(key, job);
  return job;
}

/**
 * A place as it stands in a given permanent state, tidy, for the judges'
 * tour and the finale comparison.
 */
export function renderPlace(app, sceneId, state, { width = 480, condition = 'golden', village = app.village } = {}) {
  const key = `place|${village}|${sceneId}|${hash(JSON.stringify(state))}|${width}|${condition}`;
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue.then(async () => {
    view ||= new SceneView(document.createElement('canvas'), app);
    await view.load({ village, scene: sceneId, condition, effects: state.effects, fixed: state.fixed, bloom: state.bloom, thumb: width <= 480 });
    return view.renderStill('after', width).toDataURL('image/jpeg', 0.86);
  }));
  cache.set(key, job);
  return job;
}
