// Content loading and lookup. All game content (scenes, items, villagers,
// requests, collectibles, conditions...) is JSON under /content, and all art
// metadata is in /assets/**/manifest.json. This module is DOM-free: the
// browser passes a fetch-based loader, Node (bot, validator) passes an fs one.

const COMMON_FILES = ['faults', 'items', 'tiers', 'conditions', 'scoring', 'levels', 'requests', 'notes', 'cosmetics'];

export async function loadContent(readJson) {
  const common = {};
  await Promise.all(COMMON_FILES.map(async (f) => { common[f] = await readJson(`content/common/${f}.json`); }));
  const index = await readJson('content/villages/index.json');
  const assets = { common: await readJson('assets/common/manifest.json') };
  const villages = {};
  for (const entry of index.villages) {
    if (!entry.playable) continue;
    const base = `content/villages/${entry.id}`;
    const village = await readJson(`${base}/village.json`);
    const scenes = {};
    await Promise.all(village.scenes.map(async (sid) => { scenes[sid] = await readJson(`${base}/scenes/${sid}.json`); }));
    const villagers = await readJson(`${base}/villagers.json`);
    const collectibles = await readJson(`${base}/collectibles.json`);
    assets[entry.id] = await readJson(`assets/villages/${entry.id}/manifest.json`);
    villages[entry.id] = { ...village, sceneOrder: village.scenes, scenes, villagers, collectibles };
  }
  return new Content(common, index, villages, assets);
}

export class Content {
  constructor(common, index, villages, assets) {
    Object.assign(this, common);
    this.index = index;
    this.villages = villages;
    this.assets = assets;
    this._decodedGrids = new Map();
    // denormalise: give every scene a back-reference to its village id
    for (const [vid, v] of Object.entries(villages)) {
      for (const s of Object.values(v.scenes)) s.village = vid;
    }
  }

  tier(n) { return this.tiers.find((t) => t.tier === n) || this.tiers[this.tiers.length - 1]; }

  village(id) { return this.villages[id]; }

  scene(villageId, sceneId) { return this.villages[villageId]?.scenes[sceneId]; }

  /** Resolve an asset key: village manifest first, then common. Returns
   *  {pack, key, meta} or null. */
  resolve(key, villageId) {
    if (villageId && this.assets[villageId]) {
      const m = this.assets[villageId];
      if (m.sprites?.[key]) return { pack: villageId, key, meta: m.sprites[key], kind: 'sprite' };
      if (m.images?.[key]) return { pack: villageId, key, meta: m.images[key], kind: 'image' };
    }
    const c = this.assets.common;
    if (c.sprites?.[key]) return { pack: 'common', key, meta: c.sprites[key], kind: 'sprite' };
    if (c.images?.[key]) return { pack: 'common', key, meta: c.images[key], kind: 'image' };
    return null;
  }

  /** Sprite metadata {w, h, color} in pixels (aspect ratio is what matters). */
  spriteMeta(key, villageId) {
    const r = this.resolve(key, villageId);
    return r ? r.meta : { w: 100, h: 100, color: '#808080' };
  }

  plateMeta(scene) { return this.resolve(scene.plate, scene.village)?.meta; }

  /** Average plate colour [r,g,b] at scene coordinates (x, y). */
  colorAt(scene, x, y) {
    const meta = this.plateMeta(scene);
    if (!meta?.grid) return [128, 128, 128];
    let g = this._decodedGrids.get(scene.plate + scene.village);
    if (!g) {
      g = { ...meta.grid, bytes: decodeBase64(meta.grid.rgb) };
      this._decodedGrids.set(scene.plate + scene.village, g);
    }
    const cx = Math.max(0, Math.min(g.w - 1, Math.floor(x / g.cell)));
    const cy = Math.max(0, Math.min(g.h - 1, Math.floor(y / g.cell)));
    const i = (cy * g.w + cx) * 3;
    return [g.bytes[i], g.bytes[i + 1], g.bytes[i + 2]];
  }
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceptual-ish colour distance (0..~200). */
export function colorDistance(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3;
}

function decodeBase64(s) {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(s, 'base64'));
}
