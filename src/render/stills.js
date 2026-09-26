// Re-render postcards from their saved seeds (the save never stores images).
// A private SceneView on an offscreen canvas regenerates the exact mess of
// the original play and draws "before" and "after" stills.

import { SceneView } from './sceneView.js';
import { generateMess } from '../core/mess.js';

const cache = new Map();
let view = null;
let queue = Promise.resolve();

export function renderPostcard(app, sceneId, entry, { width = 240, before = false } = {}) {
  const key = `${sceneId}|${entry.seed}|${entry.tier}|${entry.condition}|${width}|${before}|${(entry.projects || []).length}`;
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue.then(async () => {
    view ||= new SceneView(document.createElement('canvas'), app);
    const mess = generateMess(app.content, {
      village: app.village, scene: sceneId, tier: entry.tier, condition: entry.condition, seed: entry.seed,
      projectsDone: entry.projects || [],
      script: Array.isArray(entry.script) ? entry.script : null, types: entry.types || null, cat: entry.cat !== false,
    });
    await view.load({ village: app.village, scene: sceneId, mess, projects: entry.projects || [], thumb: width <= 480 });
    const after = view.renderStill('after', width).toDataURL('image/jpeg', 0.85);
    const beforeUrl = before ? view.renderStill('before', width).toDataURL('image/jpeg', 0.85) : null;
    return { after, before: beforeUrl };
  }));
  cache.set(key, job);
  return job;
}
