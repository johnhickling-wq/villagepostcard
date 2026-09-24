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
