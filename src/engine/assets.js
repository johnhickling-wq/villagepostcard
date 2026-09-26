// Runtime art access. All art is addressed by key through the manifests the
// art build writes (assets/**/manifest.json). Sprites live in atlases; large
// images (plates, map, posters) are separate files. Swapping art = replace the
// source, rerun `python3 tools/art/build.py`; keys never change.

export class Assets {
  constructor(content, base = '') {
    this.content = content;
    this.base = base;
    this.images = new Map(); // url -> Promise<HTMLImageElement>
    this.loaded = new Map(); // url -> HTMLImageElement
    this.urlCache = new Map();
    this.tinted = new Map();
  }

  packDir(pack) { return pack === 'common' ? `${this.base}assets/common/` : `${this.base}assets/villages/${pack}/`; }

  loadImage(url) {
    if (!this.images.has(url)) {
      this.images.set(url, new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { this.loaded.set(url, img); resolve(img); };
        img.onerror = () => reject(new Error(`failed to load ${url}`));
        img.src = url;
      }));
    }
    return this.images.get(url);
  }

  /** Preload every atlas of the given packs, plus listed image keys. */
  async preload(packs, imageKeys = [], onProgress) {
    const urls = new Set();
    for (const pack of packs) {
      const m = this.content.assets[pack];
      for (const s of Object.values(m?.sprites || {})) urls.add(this.packDir(pack) + s.atlas);
    }
    for (const [key, pack, thumb] of imageKeys) {
      const r = this.content.resolve(key, pack);
      if (r) urls.add(this.packDir(r.pack) + (thumb && r.meta.thumb ? r.meta.thumb : r.meta.src));
    }
    let done = 0;
    await Promise.all([...urls].map((u) => this.loadImage(u).then(() => onProgress?.(++done / urls.size))));
  }

  /** Synchronous sprite lookup for drawing: {img, sx, sy, sw, sh, w, h, color} or null. */
  sprite(key, village) {
    const r = this.content.resolve(key, village);
    if (!r || r.kind !== 'sprite') return null;
    const img = this.loaded.get(this.packDir(r.pack) + r.meta.atlas);
    if (!img) return null;
    return { img, sx: r.meta.x, sy: r.meta.y, sw: r.meta.w, sh: r.meta.h, w: r.meta.w, h: r.meta.h, color: r.meta.color, key: r.pack + ':' + key };
  }

  imageUrl(key, village, thumb = false) {
    const r = this.content.resolve(key, village);
    if (!r) return null;
    return this.packDir(r.pack) + (thumb && r.meta.thumb ? r.meta.thumb : r.meta.src);
  }

  async image(key, village, thumb = false) {
    const url = this.imageUrl(key, village, thumb);
    return url ? this.loadImage(url) : null;
  }

  /** Draw a sprite centred on (0,0) of the current transform, scaled to height h. */
  drawSprite(ctx, spr, w, h, flip = false) {
    if (!spr) return;
    if (flip) { ctx.save(); ctx.scale(-1, 1); }
    ctx.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, -w / 2, -h / 2, w, h);
    if (flip) ctx.restore();
  }

  /** A sprite cut out onto its own canvas (for tinting, DOM use...). */
  spriteCanvas(spr, scale = 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(spr.sw * scale));
    c.height = Math.max(1, Math.round(spr.sh * scale));
    c.getContext('2d').drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, 0, 0, c.width, c.height);
    return c;
  }

  /** Data URL of a sprite, for <img> tags in the DOM UI. */
  spriteUrl(key, village, scale = 1) {
    const id = `${village}|${key}|${scale}`;
    if (this.urlCache.has(id)) return this.urlCache.get(id);
    const spr = this.sprite(key, village);
    if (!spr) return '';
    const url = this.spriteCanvas(spr, scale).toDataURL('image/png');
    this.urlCache.set(id, url);
    return url;
  }

  /** Wilted/tired variant of a sprite: browned and desaturated, alpha kept. */
  wilted(spr, amount) {
    const id = `${spr.key}|wilt|${amount.toFixed(2)}`;
    if (this.tinted.has(id)) return this.tinted.get(id);
    const c = this.spriteCanvas(spr);
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'saturation';
    g.globalAlpha = 0.85 * amount;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.55 * amount;
    g.fillStyle = '#a07a3c';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.globalAlpha = 1;
    g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, 0, 0, c.width, c.height);
    const out = { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, w: spr.w, h: spr.h, key: id };
    this.tinted.set(id, out);
    return out;
  }

  /**
   * A planter taken apart for planting: {container, plant, bare} as sprite-like
   * canvases the size of the original. `plant` is the flowers and leaves,
   * `container` the pot without them, `bare` the pot with fresh soil.
   * def: content/common/story.json planters[sprite] {rim, soilW, soilH, keepDark}
   */
  planter(spr, def) {
    const id = `${spr.key}|planter`;
    if (this.tinted.has(id)) return this.tinted.get(id);
    const c = this.spriteCanvas(spr);
    const W = c.width, H = c.height;
    const img = c.getContext('2d').getImageData(0, 0, W, H);
    const d = img.data;
    const rimY = def.rim * H, soilTop = rimY - def.soilH * H * 0.5, drape = rimY + H * 0.22;
    const plant = new ImageData(W, H), pd = plant.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 8) continue;
        const [hu, sa, va] = hsv(d[i], d[i + 1], d[i + 2]);
        let isPlant = false;
        // above the soil it's all flowers (a basket's dark chains stay)
        if (y < soilTop) isPlant = !(def.keepDark && sa < 0.3 && va < 0.55);
        // leaves draped over the front
        else if (y < drape) isPlant = hu >= 65 && hu <= 170 && sa > 0.22 && va > 0.2;
        if (!isPlant) continue;
        for (let k = 0; k < 4; k++) pd[i + k] = d[i + k];
        d[i + 3] = 0;
      }
    }
    const container = canvasOf(img);
    const plantC = canvasOf(plant);
    // bare: the pot, with a mound of fresh soil where the flowers were
    const bare = document.createElement('canvas');
    bare.width = W; bare.height = H;
    const g = bare.getContext('2d');
    g.drawImage(container, 0, 0);
    const sw = def.soilW * W / 2, sh = Math.max(3, def.soilH * H / 2);
    g.fillStyle = '#4e3220';
    g.beginPath(); g.ellipse(W / 2, rimY, sw, sh, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6b4630';
    g.beginPath(); g.ellipse(W / 2, rimY - sh * 0.25, sw * 0.9, sh * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,24,14,0.55)';
    for (let k = 0; k < 14; k++) {
      const a = (k * 2.399) % (Math.PI * 2), r = ((k * 37) % 10) / 10;
      g.beginPath(); g.arc(W / 2 + Math.cos(a) * sw * 0.8 * r, rimY - sh * 0.2 + Math.sin(a) * sh * 0.45 * r, Math.max(1.2, W * 0.008), 0, Math.PI * 2); g.fill();
    }
    const wrap = (cv, k) => ({ img: cv, sx: 0, sy: 0, sw: W, sh: H, w: spr.w, h: spr.h, key: `${id}|${k}`, color: spr.color });
    const out = { container: wrap(container, 'c'), plant: wrap(plantC, 'p'), bare: wrap(bare, 'b'), rim: def.rim };
    this.tinted.set(id, out);
    return out;
  }

  /** A planter's flowers recoloured (leaves stay green): {plant, full}. colour: story.json colours[x] */
  planterTint(spr, def, name, colour) {
    const id = `${spr.key}|tint|${name}`;
    if (this.tinted.has(id)) return this.tinted.get(id);
    const parts = this.planter(spr, def);
    const p = parts.plant.img;
    const c = document.createElement('canvas');
    c.width = p.width; c.height = p.height;
    const g = c.getContext('2d');
    g.drawImage(p, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const [hu, sa, va] = hsv(d[i], d[i + 1], d[i + 2]);
      if (hu >= 65 && hu <= 170 && sa > 0.2) continue; // leaves
      let h2 = colour.hue, s2, v2;
      if (colour.sat < 0.35) { s2 = colour.sat * 0.5; v2 = 0.72 + 0.28 * Math.max(va, colour.light); }
      else { s2 = Math.max(0.45, Math.min(1, (sa * 0.4 + colour.sat * 0.8))); v2 = Math.min(1, 0.35 + va * 0.75); }
      const [r, gg, b] = hsvToRgb(h2, s2, v2);
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
    const full = document.createElement('canvas');
    full.width = c.width; full.height = c.height;
    const fg = full.getContext('2d');
    fg.drawImage(parts.container.img, 0, 0);
    fg.drawImage(c, 0, 0);
    const wrap = (cv, k) => ({ img: cv, sx: 0, sy: 0, sw: cv.width, sh: cv.height, w: spr.w, h: spr.h, key: `${id}|${k}`, color: spr.color });
    const out = { plant: wrap(c, 'p'), full: wrap(full, 'f') };
    this.tinted.set(id, out);
    return out;
  }

  /** Solid silhouette of a sprite in a colour (for outlines/glows). */
  silhouette(spr, color) {
    const id = `${spr.key}|sil|${color}`;
    if (this.tinted.has(id)) return this.tinted.get(id);
    const c = this.spriteCanvas(spr);
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const out = { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, w: spr.w, h: spr.h, key: id };
    this.tinted.set(id, out);
    return out;
  }
}

function canvasOf(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width; c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  return c;
}

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
