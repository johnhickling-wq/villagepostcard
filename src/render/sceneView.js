// SceneView: draws a scene (clean plate + generated mess + restoration +
// weather + ambient life) on a canvas, handles the camera, and plays every
// fix animation. It also renders still "before"/"after" images for postcards.

import { bakePlate, gradeSprite, gradeColor } from './grade.js';
import { drawCobweb, flakes, peeling, sootScrap } from './textures.js';
import { Particles } from './particles.js';
import { Ambient } from './ambient.js';
import { Ease, springDecay, clamp01, lerp } from '../engine/tween.js';
import { activeProps, activeNeglect, sceneBloom, propGeom, depthScale } from '../core/mess.js';
import { bbox, pointInPoly, shapeBounds, shapeCenter } from '../core/geometry.js';
import { Rng } from '../core/rng.js';

const TAU = Math.PI * 2;
const FIX_DUR = { pop: 0.55, pluck: 0.6, swing: 1.1, hop: 0.7, paint: 0.75, wipe: 0.8, bloom: 0.8, light: 0.9, sweep: 0.6, flap: 1.3 };

export class SceneView {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.app = app;
    this.content = app.content;
    this.assets = app.assets;
    this.particles = new Particles();
    this.cam = { x: 500, y: 750, zoom: 1 };
    this.view = { x: 0, y: 0, w: 844, h: 390 };
    this.time = 0;
    this.fx = new Map();
    this.screenFx = [];
    this.overlays = [];
    this.ready = false;
    this.paperColor = '#e9dfc9';
    this.shake = 0;
  }

  // ------------------------------------------------------------ loading ---
  /**
   * @param o {village, scene, mess?, projects?, condition?, bloom?}
   */
  async load(o) {
    const content = this.content;
    const scene = content.scene(o.village, o.scene);
    this.village = o.village;
    this.scene = scene;
    this.mess = o.mess || null;
    this.projects = new Set(o.projects || []);
    this.condId = o.mess?.condition || o.condition || 'clear';
    this.cond = content.conditions[this.condId];
    this.dark = !!this.cond.dark;
    this.bloom = o.bloom ?? sceneBloom(scene, this.projects);
    this.gradeCache = new Map();
    this.W = scene.size[0];
    this.H = scene.size[1];
    this.plateImg = await this.assets.image(scene.plate, o.village, !!o.thumb);
    this.base = bakePlate(this.plateImg, this.cond, this.bloom, this.W, this.H);
    this.oldBase = null;
    this.baseFade = 1;
    this._buildProps();
    this.neglect = activeNeglect(scene, this.projects);
    this.regionCache = new Map();
    this.restoring = null;
    this.camTween = null;
    this.fx.clear();
    this.particles.list = [];
    this.screenFx = [];
    this.overlays = [];
    this.faults = this.mess ? this.mess.faults : [];
    this.faultByProp = new Map();
    for (const f of this.faults) if (f.prop) this.faultByProp.set(f.prop, f);
    this.water = scene.water || [];
    for (const f of this.faults) {
      if (f.type === 'litter') f.inWater = this.water.some((poly) => pointInPoly(f.x, f.y, poly));
      f.phase = (f.x * 0.013 + f.y * 0.007) % TAU;
    }
    this.cat = this.mess?.cat ? { ...this.mess.cat, found: null } : null;
    this.collectible = this.mess?.collectible ? { ...this.mess.collectible, found: null } : null;
    this.ambient = new Ambient(scene, this.cond, (this.mess?.seed || 7) + 1);
    const r = new Rng((this.mess?.seed || 3) + 11);
    this.litWindows = new Set((scene.regions || []).filter((rg) => rg.tags.includes('window') && r.chance(0.75)).map((rg) => rg.id));
    this.decor = this._activeDecor();
    this.ready = true;
    this.resetCamera();
  }

  /** Sprite by key, colour-graded to match the plate's weather and bloom. */
  spr(key) {
    const raw = this.assets.sprite(key, this.village);
    return raw ? this.graded(raw) : null;
  }

  /** A flat colour graded for this scene's light, as a CSS colour (for drawn-in-code fault art). */
  tone = (hex, a = 1) => {
    const c = gradeColor(hex, this.cond, this.bloom);
    return a < 1 ? c.replace('rgb(', 'rgba(').replace(')', `,${a})`) : c;
  };

  graded(raw) {
    this.gradeCache ||= new Map();
    const id = `${raw.key}|${this.condId}|${this.bloom.toFixed(2)}`;
    let g = this.gradeCache.get(id);
    if (!g) { g = gradeSprite(raw, this.cond, this.bloom); this.gradeCache.set(id, g); }
    return g;
  }

  _buildProps() {
    this.props = activeProps(this.scene, this.projects).map((p) => this._propRuntime(p));
  }

  _propRuntime(p) {
    const g = propGeom(this.content, this.scene, p);
    let spr = this.assets.sprite(p.sprite, this.village);
    if (spr && p.label) spr = this._labelled(spr, p);
    return { ...p, geom: g, spr: spr ? this.graded(spr) : null, rawSpr: spr, appear: null };
  }

  _activeDecor() {
    const out = [];
    for (const r of this.scene.restoration || []) {
      if (!this.projects.has(r.project)) continue;
      for (const d of r.decor || []) out.push({ ...d, project: r.project, appear: null });
    }
    return out;
  }

  /** Sign boards get their lettering painted on in code. */
  _labelled(spr, p) {
    const c = this.assets.spriteCanvas(spr);
    const g = c.getContext('2d');
    const [x0, y0, x1, y1] = p.labelBox || [0.15, 0.3, 0.85, 0.7];
    const bw = (x1 - x0) * c.width, bh = (y1 - y0) * c.height;
    const lines = p.label.split('\n');
    const hand = p.labelFont === 'hand';
    const family = hand ? '"Caveat", cursive' : '"Fraunces", serif';
    let size = bh / lines.length * 0.82;
    g.font = `${hand ? 700 : 800} ${size}px ${family}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    if (widest > bw) size *= bw / widest;
    g.font = `${hand ? 700 : 800} ${size}px ${family}`;
    g.fillStyle = p.labelColor || '#2c2a35';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const y = y0 * c.height + (bh / lines.length) * (i + 0.5);
      g.globalAlpha = 0.92;
      g.fillText(l, (x0 + x1) / 2 * c.width, y);
    });
    return { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, w: spr.w, h: spr.h, key: spr.key + '|' + p.label, color: spr.color };
  }

  // ------------------------------------------------------------- camera ---
  setView(x, y, w, h, { cover = false } = {}) {
    this.view = { x, y, w, h, cover };
    this.fit = (cover ? Math.max(w / this.W, h / this.H) : Math.min(w / this.W, h / this.H)) || 1;
    this.clampCam();
  }

  resetCamera() {
    this.cam = { x: this.W / 2, y: this.H / 2, zoom: 1 };
    if (this.view) this.setView(this.view.x, this.view.y, this.view.w, this.view.h, { cover: this.view.cover });
  }

  get scale() { return this.fit * this.cam.zoom; }

  worldToScreen(x, y) {
    const s = this.scale;
    return [this.view.x + this.view.w / 2 + (x - this.cam.x) * s, this.view.y + this.view.h / 2 + (y - this.cam.y) * s];
  }

  screenToWorld(sx, sy) {
    const s = this.scale;
    return [(sx - this.view.x - this.view.w / 2) / s + this.cam.x, (sy - this.view.y - this.view.h / 2) / s + this.cam.y];
  }

  clampCam() {
    const s = this.scale;
    const halfW = this.view.w / 2 / s, halfH = this.view.h / 2 / s;
    this.cam.x = halfW * 2 >= this.W ? this.W / 2 : Math.max(halfW, Math.min(this.W - halfW, this.cam.x));
    this.cam.y = halfH * 2 >= this.H ? this.H / 2 : Math.max(halfH, Math.min(this.H - halfH, this.cam.y));
  }

  pan(dx, dy) {
    this.cam.x -= dx / this.scale;
    this.cam.y -= dy / this.scale;
    this.clampCam();
  }

  zoomAt(f, sx, sy) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(1, Math.min(3, this.cam.zoom * f));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
    this.clampCam();
  }

  /** Smoothly move the camera so (x, y) is visible at least at `zoom`. */
  focus(x, y, zoom = null, dur = 0.6) {
    const from = { ...this.cam };
    const to = { x, y, zoom: zoom ?? Math.max(this.cam.zoom, 1) };
    this.camTween = { from, to, t: 0, dur };
  }

  // -------------------------------------------------------- fix effects ---
  fix(fault) {
    this.fx.set(fault.id, { t0: this.time, kind: this.content.faults[fault.type].fix });
    const cx = fault.cx, cy = fault.cy;
    const P = this.particles;
    switch (fault.type) {
      case 'litter': P.burst('sparkle', cx, cy, { scale: 1 }); break;
      case 'weeds': P.burst('dirt', fault.x, fault.y); break;
      case 'crooked': P.burst('dust', cx, cy - fault.h * 0.3, { n: 6 }); break;
      case 'toppled': setTimeout(() => P.burst('dust', fault.pivot?.[0] ?? cx, fault.pivot?.[1] ?? cy, { n: 12 }), 380); break;
      case 'faded': break; // particles follow the brush
      case 'grimy': break;
      case 'wilted': setTimeout(() => P.burst('petals', cx, cy - 10), 150); break;
      case 'unlit': P.burst('embers', cx, cy); break;
      case 'cobweb': P.burst('dust', cx, cy, { n: 7, color: 'rgba(255,255,255,0.8)' }); break;
      case 'pigeon': P.burst('feathers', cx, cy); break;
    }
  }

  catFound() {
    if (!this.cat) return;
    this.cat.found = this.time;
    this.particles.burst('hearts', this.cat.cx, this.cat.y - this.cat.h);
  }

  collectibleFound(targetScreen) {
    if (!this.collectible) return;
    this.collectible.found = this.time;
    this.collectible.target = targetScreen;
    this.particles.burst('sparkle', this.collectible.cx, this.collectible.cy, { scale: 1.3 });
  }

  tapRipple(sx, sy, ok) {
    this.screenFx.push({ kind: 'ripple', x: sx, y: sy, t0: this.time, ok });
  }

  popup(x, y, text, o = {}) {
    this.screenFx.push({ kind: 'text', wx: x, wy: y, text, t0: this.time, color: o.color || '#2c2a35', size: o.size || 26, life: o.life || 1.1 });
  }

  showLoupe(fault) {
    const b = shapeBounds(fault.shape);
    const [cx, cy] = shapeCenter(fault.shape);
    const r = Math.max(70, Math.hypot(b.w, b.h) * 0.62);
    this.overlays.push({ kind: 'loupe', x: cx, y: cy, r, t0: this.time, life: 2.6, fault: fault.id });
    const s = this.scale;
    const [sx, sy] = this.worldToScreen(cx, cy);
    const margin = 40;
    if (sx < this.view.x + margin || sx > this.view.x + this.view.w - margin || sy < this.view.y + margin || sy > this.view.y + this.view.h - margin || r * s < 30) {
      this.focus(cx, cy, Math.max(this.cam.zoom, r * s < 30 ? 1.8 : 1));
    }
  }

  showFlash(faults, dur = 2.5) {
    this.overlays.push({ kind: 'flash', t0: this.time, life: dur, faults: faults.map((f) => f.id) });
  }

  showNudge(fault) {
    this.overlays.push({ kind: 'nudge', x: fault.cx, y: fault.cy, t0: this.time, life: 1.4 });
  }

  shakeScreen(amount = 8) { this.shake = amount; }

  // ------------------------------------------------ restoration staging ---
  /** Animate a restoration project arriving: fresh paint, props pop in, grade warms. */
  async playRestore(projectId) {
    const prevBase = this.base;
    this.projects.add(projectId);
    this.bloom = sceneBloom(this.scene, this.projects);
    const oldNeglect = this.neglect;
    this.neglect = activeNeglect(this.scene, this.projects);
    const removed = oldNeglect.filter((n) => n.project === projectId);
    // neglect lifts using the same fix animations as a player fix
    removed.forEach((n, i) => {
      const fake = this._neglectFault(n);
      if (!fake) return;
      this.restoring ||= [];
      this.restoring.push({ ...fake, t0: this.time + 0.4 + i * 0.5 });
      this.fx.set(fake.id, { t0: this.time + 0.4 + i * 0.5, kind: this.content.faults[fake.type].fix });
    });
    const before = new Set(this.props.map((p) => p.id));
    this._buildProps();
    let k = 0;
    for (const p of this.props) {
      if (!before.has(p.id)) {
        p.appear = this.time + 0.8 + k * 0.35;
        k++;
        setTimeout(() => this.particles.burst('sparkle', p.geom.cx, p.geom.cy, { scale: 1.2 }), (0.8 + (k - 1) * 0.35) * 1000);
      }
    }
    const oldDecor = new Set(this.decor.map((d) => JSON.stringify(d.points)));
    this.decor = this._activeDecor();
    for (const d of this.decor) if (!oldDecor.has(JSON.stringify(d.points))) d.appear = this.time + 0.6;
    // crossfade to the warmer grade
    this.oldBase = prevBase;
    this.base = bakePlate(this.plateImg, this.cond, this.bloom, this.W, this.H);
    this.baseFade = 0;
    this.baseFadeStart = this.time + 0.3;
  }

  _neglectFault(n) {
    const region = (this.scene.regions || []).find((r) => r.id === n.target);
    if (!region) return null;
    const [cx, cy] = shapeCenter({ kind: 'poly', pts: region.poly });
    return { id: 'neglect:' + n.target, type: n.type, region: n.target, amount: n.amount, pattern: 5, shape: { kind: 'poly', pts: region.poly }, cx, cy, neglect: true };
  }

  // ------------------------------------------------------------- update ---
  update(dt) {
    if (!this.ready) return;
    this.time += dt;
    this.particles.update(dt);
    this.ambient.update(dt);
    if (this.camTween) {
      const ct = this.camTween;
      ct.t += dt;
      const k = Ease.inOutCubic(clamp01(ct.t / ct.dur));
      this.cam.x = lerp(ct.from.x, ct.to.x, k);
      this.cam.y = lerp(ct.from.y, ct.to.y, k);
      this.cam.zoom = lerp(ct.from.zoom, ct.to.zoom, k);
      this.clampCam();
      if (ct.t >= ct.dur) this.camTween = null;
    }
    if (this.oldBase && this.time > this.baseFadeStart) {
      this.baseFade = Math.min(1, (this.time - this.baseFadeStart) / 1.6);
      if (this.baseFade >= 1) this.oldBase = null;
    }
    this.shake *= Math.exp(-dt * 8);
    this.screenFx = this.screenFx.filter((f) => this.time - f.t0 < (f.life || 0.6));
    this.overlays = this.overlays.filter((o) => this.time - o.t0 < o.life);
  }

  // --------------------------------------------------------------- draw ---
  draw() {
    const g = this.g;
    const c = this.canvas;
    const dpr = c.width / c.clientWidth || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c.clientWidth, c.clientHeight);
    if (!this.ready) return;
    const s = this.scale;
    const sh = this.shake > 0.3 ? [(Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake] : [0, 0];
    const ox = this.view.x + this.view.w / 2 - this.cam.x * s + sh[0];
    const oy = this.view.y + this.view.h / 2 - this.cam.y * s + sh[1];
    // the print sits on the desk with a soft shadow (clamped to the view)
    const px0 = Math.max(ox, this.view.x), py0 = Math.max(oy, this.view.y);
    const px1 = Math.min(ox + this.W * s, this.view.x + this.view.w), py1 = Math.min(oy + this.H * s, this.view.y + this.view.h);
    if (!this.view.cover && px1 > px0 && py1 > py0) {
      g.save();
      g.shadowColor = 'rgba(40,30,20,0.35)';
      g.shadowBlur = 18;
      g.shadowOffsetY = 6;
      g.fillStyle = '#fff';
      g.fillRect(px0, py0, px1 - px0, py1 - py0);
      g.restore();
    }
    g.save();
    g.beginPath();
    g.rect(this.view.x, this.view.y, this.view.w, this.view.h);
    g.clip();
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    this.drawWorld(g, 'live');
    g.restore();
    this.drawScreenFx(g);
  }

  /**
   * Draw the whole scene in scene units into the current transform.
   * state: 'live' | 'before' (all faults unfixed) | 'after' (clean)
   */
  drawWorld(g, state) {
    const W = this.W, H = this.H;
    const live = state === 'live';
    if (this.oldBase && live) {
      g.drawImage(this.oldBase, 0, 0, W, H);
      g.globalAlpha = this.baseFade;
      g.drawImage(this.base, 0, 0, W, H);
      g.globalAlpha = 1;
    } else {
      g.drawImage(this.base, 0, 0, W, H);
    }
    if (live) this.ambient.drawBack(g);

    // --- region overlays: neglect first, then faults -----------------------
    const shown = state === 'after' ? [] : this.faults;
    for (const n of this.neglect) {
      const f = this._neglectFault(n);
      if (f) this.drawRegion(g, f, state === 'before' ? null : this.fx.get(f.id));
    }
    for (const f of this.restoring || []) this.drawRegion(g, f, this.fx.get(f.id));
    if (this.dark) this.drawWindowGlow(g, state);
    for (const f of shown) {
      if (f.type === 'faded' || f.type === 'grimy') this.drawRegion(g, f, state === 'before' ? null : this.fx.get(f.id));
    }

    // --- depth-sorted things ----------------------------------------------
    const items = [];
    for (const p of this.props) items.push({ z: p.pivot === 'top' ? p.y + p.h : p.y, kind: 'prop', p });
    for (const f of shown) {
      if (f.type === 'litter' || f.type === 'weeds') items.push({ z: f.z, kind: 'item', f });
    }
    if (this.cat && state !== 'after') items.push({ z: this.cat.z, kind: 'cat' });
    if (this.collectible && live) items.push({ z: this.collectible.y, kind: 'collectible' });
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.kind === 'prop') this.drawProp(g, it.p, state);
      else if (it.kind === 'item') this.drawItem(g, it.f, state === 'before' ? null : this.fx.get(it.f.id));
      else if (it.kind === 'cat') this.drawCat(g, state);
      else if (it.kind === 'collectible') this.drawCollectible(g);
    }
    for (const d of this.decor) this.drawDecor(g, d, state);
    for (const f of shown) {
      if (f.type === 'cobweb') this.drawCobwebFault(g, f, state === 'before' ? null : this.fx.get(f.id));
      if (f.type === 'pigeon') this.drawPigeon(g, f, state === 'before' ? null : this.fx.get(f.id));
    }
    if (this.dark) this.drawLamps(g, state);
    if (live) {
      this.ambient.drawFront(g);
      this.particles.draw(g);
      this.drawOverlays(g);
    } else if (this.cond.fog) {
      this.ambient.drawFront(g);
    }
  }

  // ---- regions (faded paint / grime) --------------------------------------
  _regionCanvas(f) {
    const key = `${f.type}:${f.region}:${f.amount.toFixed(2)}:${f.pattern}`;
    let c = this.regionCache.get(key);
    if (c && !c.dirty) return c;
    const region = (this.scene.regions || []).find((r) => r.id === f.region);
    const b = bbox(region.poly);
    const u = this.base.unit;
    c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(b.w * u));
    c.height = Math.max(2, Math.ceil(b.h * u));
    const g = c.getContext('2d');
    if (f.type === 'faded') {
      // sun-bleached paper, with torn patches peeled back to bare cream paper
      g.drawImage(this.base, b.x * u, b.y * u, b.w * u, b.h * u, 0, 0, c.width, c.height);
      g.globalCompositeOperation = 'saturation';
      g.globalAlpha = 0.95 * f.amount;
      g.fillStyle = '#888';
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 0.62 * f.amount;
      g.fillStyle = this.tone('#d9d0bc');
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      flakes(g, c.width, c.height, f.pattern, f.amount * 0.6);
      peeling(g, c.width, c.height, f.pattern, f.amount, this.tone);
    } else {
      // a stained scrap of paper stuck over the glass
      sootScrap(g, c.width, c.height, f.pattern, Math.min(1, 0.35 + 0.65 * f.amount), this.tone);
    }
    // cut to the region's shape
    g.globalCompositeOperation = 'destination-in';
    g.globalAlpha = 1;
    g.beginPath();
    region.poly.forEach(([x, y], i) => (i ? g.lineTo((x - b.x) * u, (y - b.y) * u) : g.moveTo((x - b.x) * u, (y - b.y) * u)));
    g.closePath();
    g.fill();
    c.b = b;
    c.poly = region.poly;
    c.region = region;
    this.regionCache.set(key, c);
    return c;
  }

  drawRegion(g, f, fx) {
    const c = this._regionCanvas(f);
    const b = c.b;
    if (!fx || this.time < fx.t0) {
      g.drawImage(c, b.x, b.y, b.w, b.h);
      return;
    }
    const k = clamp01((this.time - fx.t0) / FIX_DUR[fx.kind]);
    if (k >= 1) {
      if (!fx.glinted) {
        fx.glinted = true;
        if (f.type === 'grimy') this.particles.burst('glint', f.cx, f.cy, { scale: Math.max(0.6, b.w / 80) });
        else this.particles.burst('sparkle', f.cx, f.cy, { n: 10, confetti: 0 });
      }
      return;
    }
    if (f.type === 'faded') {
      // a paint brush sweeps down the region, leaving fresh colour behind
      const edge = b.y + b.h * Ease.inOutQuad(k);
      g.save();
      g.beginPath();
      g.moveTo(b.x - 2, b.y + b.h + 2);
      g.lineTo(b.x - 2, edge);
      const waves = 4;
      for (let i = 0; i <= 16; i++) {
        const x = b.x + (b.w * i) / 16;
        g.lineTo(x, edge + Math.sin((i / 16) * TAU * waves / 2 + this.time * 10) * Math.min(8, b.h * 0.05));
      }
      g.lineTo(b.x + b.w + 2, b.y + b.h + 2);
      g.closePath();
      g.clip();
      g.drawImage(c, b.x, b.y, b.w, b.h);
      g.restore();
      // wet highlight along the brush edge
      g.save();
      g.beginPath();
      c.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.clip();
      g.globalAlpha = 0.5 * (1 - k);
      g.fillStyle = '#ffffff';
      g.fillRect(b.x, edge - 5, b.w, 6);
      g.restore();
      if (Math.random() < 0.5) {
        const [r0, g0, b0] = this.content.colorAt(this.scene, f.cx, edge - 6);
        const col = `rgb(${r0},${g0},${b0})`;
        this.particles.burst('paint', b.x + Math.random() * b.w, edge, { color: col });
      }
    } else {
      // three wiping strokes erase the grime
      if (!fx.canvas) {
        fx.canvas = document.createElement('canvas');
        fx.canvas.width = c.width; fx.canvas.height = c.height;
        fx.canvas.getContext('2d').drawImage(c, 0, 0);
        fx.last = 0;
      }
      const eg = fx.canvas.getContext('2d');
      eg.globalCompositeOperation = 'destination-out';
      const W = c.width, H = c.height;
      const steps = 30;
      const from = Math.floor(fx.last * steps), to = Math.floor(k * steps);
      for (let i = from; i <= to; i++) {
        const t = i / steps;
        const stroke = Math.min(2, Math.floor(t * 3));
        const st = t * 3 - stroke;
        const y = H * (0.2 + stroke * 0.32);
        const x = stroke % 2 ? W * (1 - st) : W * st;
        const rad = Math.max(W, H) * 0.38;
        const rg = eg.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(0.7, 'rgba(0,0,0,0.9)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        eg.fillStyle = rg;
        eg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      fx.last = k;
      g.drawImage(fx.canvas, b.x, b.y, b.w, b.h);
      // the cloth
      const stroke = Math.min(2, Math.floor(k * 3));
      const st = k * 3 - stroke;
      const cx = stroke % 2 ? b.x + b.w * (1 - st) : b.x + b.w * st;
      const cy = b.y + b.h * (0.2 + stroke * 0.32);
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.sin(this.time * 20) * 0.2);
      const cs = Math.max(14, Math.min(34, b.w * 0.35));
      g.fillStyle = '#f2e8d2';
      g.strokeStyle = 'rgba(80,60,40,0.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(-cs * 0.6, -cs * 0.4); g.quadraticCurveTo(0, -cs * 0.7, cs * 0.6, -cs * 0.35);
      g.lineTo(cs * 0.5, cs * 0.45); g.quadraticCurveTo(0, cs * 0.6, -cs * 0.55, cs * 0.4);
      g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  drawWindowGlow(g, state) {
    const t = this.time;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const r of this.scene.regions || []) {
      if (!r.tags.includes('window') || !this.litWindows.has(r.id)) continue;
      const fault = this.faults.find((f) => f.region === r.id && f.type === 'grimy');
      const dim = fault && state !== 'after' && !(this.fx.get(fault.id) && this.time > this.fx.get(fault.id).t0) ? 0.35 : 1;
      const flick = 0.9 + 0.1 * Math.sin(t * 3 + r.poly[0][0]);
      g.globalAlpha = 0.55 * dim * flick;
      g.beginPath();
      r.poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      const b = bbox(r.poly);
      const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, '#ffcf6e');
      gr.addColorStop(1, '#ff9a3c');
      g.fillStyle = gr;
      g.fill();
    }
    g.restore();
  }

  drawLamps(g, state) {
    for (const l of this.scene.lamps || []) {
      const fault = this.faults.find((f) => f.lamp === l.id);
      let on = 1;
      if (fault && state !== 'after') {
        const fx = this.fx.get(fault.id);
        if (state === 'before' || !fx || this.time < fx.t0) on = 0;
        else {
          const k = clamp01((this.time - fx.t0) / FIX_DUR.light);
          on = k < 0.3 ? Ease.outBack(k / 0.3) * 1.3 * (0.6 + 0.4 * Math.random()) : lerp(1.3, 1, (k - 0.3) / 0.7);
        }
      }
      if (on <= 0) {
        g.save();
        g.globalAlpha = 0.45;
        g.fillStyle = '#1a1a2a';
        g.beginPath(); g.arc(l.x, l.y, l.r * 0.75, 0, TAU); g.fill();
        g.restore();
        continue;
      }
      const flick = 0.94 + 0.06 * Math.sin(this.time * 7 + l.x);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const R = l.r * 4.2;
      const gr = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, R);
      gr.addColorStop(0, `rgba(255,214,130,${0.85 * on * flick})`);
      gr.addColorStop(0.18, `rgba(255,190,90,${0.45 * on})`);
      gr.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(l.x, l.y, R, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,245,210,${0.8 * on})`;
      g.beginPath(); g.arc(l.x, l.y, l.r * 0.45, 0, TAU); g.fill();
      g.restore();
    }
    for (const d of this.decor) {
      if (d.kind !== 'lights') continue;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const [x, y] of catenary(d.points, d.sag, 40)) {
        const gr = g.createRadialGradient(x, y, 0, x, y, 22);
        gr.addColorStop(0, 'rgba(255,220,140,0.8)');
        gr.addColorStop(1, 'rgba(255,200,100,0)');
        g.fillStyle = gr;
        g.fillRect(x - 22, y - 22, 44, 44);
      }
      g.restore();
    }
  }

  // ---- props ---------------------------------------------------------------
  drawProp(g, p, state) {
    if (!p.spr) return;
    const f = state === 'after' ? null : this.faultByProp.get(p.id);
    const fx = f && state === 'live' ? this.fx.get(f.id) : null;
    const k = fx ? clamp01((this.time - fx.t0) / FIX_DUR[fx.kind]) : 0;
    const geo = p.geom;
    let appear = 1;
    if (p.appear != null && state === 'live') {
      if (this.time < p.appear) return;
      appear = clamp01((this.time - p.appear) / 0.6);
    }
    g.save();
    // pivot
    g.translate(geo.px, geo.py);
    let angle = 0, sx = 1, sy = 1, dy = 0, spr = p.spr;
    if (p.sway) angle += Math.sin(this.time * 1.3 + geo.px) * 0.02;
    if (f?.type === 'crooked') {
      const t = fx ? this.time - fx.t0 : 0;
      angle += fx && t >= 0 ? f.angle * springDecay(t, 13, 4.8) : f.angle;
    } else if (f?.type === 'toppled') {
      // rotate about the bottom corner it fell over
      const [pvx, pvy] = f.pivot;
      g.translate(pvx - geo.px, pvy - geo.py);
      const e = fx ? Ease.outBack(k, 2.2) : 0;
      g.rotate(f.angle * (1 - e));
      g.translate(-(pvx - geo.px), -(pvy - geo.py));
      if (fx) dy = -Math.sin(Math.PI * Math.min(1, k * 1.4)) * geo.h * 0.12;
      if (fx && k > 0.55 && k < 0.95) { const q = (k - 0.55) / 0.4; sy = 1 - 0.1 * Math.sin(q * Math.PI); sx = 1 + 0.06 * Math.sin(q * Math.PI); }
    } else if (f?.type === 'wilted') {
      const amt = f.amount * (fx ? 1 - Ease.outCubic(k) : 1);
      sy = 1 - 0.1 * amt;
      if (fx) { const b = Math.sin(Math.min(1, k * 1.5) * Math.PI) * 0.12; sy += b; sx += b * 0.5; }
      spr = amt > 0.02 ? this.graded(this.assets.wilted(p.rawSpr, amt)) : p.spr;
    }
    const neg = this.neglect.find((n) => n.target === p.id);
    if (neg && neg.type === 'wilted' && state !== 'after') spr = this.graded(this.assets.wilted(p.rawSpr, neg.amount));
    g.rotate(angle);
    if (appear < 1) { const b = Ease.outBack(appear, 2.5); sx *= b; sy *= b; }
    // draw so that the pivot stays fixed
    const w = geo.w, h = geo.h;
    const cy = geo.top ? h / 2 : -h / 2;
    g.translate(0, dy);
    g.scale(sx, sy);
    g.translate(0, cy);
    this.assets.drawSprite(g, spr, w, h, p.flip);
    g.restore();
  }

  // ---- litter & weeds --------------------------------------------------------
  drawItem(g, f, fx) {
    const spr = this.spr(f.sprite);
    if (!spr) return;
    let k = 0;
    if (fx && this.time >= fx.t0) {
      k = clamp01((this.time - fx.t0) / FIX_DUR[fx.kind]);
      if (k >= 1) return;
    }
    g.save();
    if (f.type === 'litter') {
      let bob = 0, wob = 0;
      if (f.inWater) { bob = Math.sin(this.time * 1.8 + f.phase) * 3; wob = Math.sin(this.time * 1.3 + f.phase) * 0.06; }
      g.translate(f.cx, f.cy + bob);
      g.rotate(f.rot + wob);
      if (k > 0) {
        const up = k < 0.3 ? Ease.outBack(k / 0.3) : 1;
        const shrink = k < 0.3 ? 1 + 0.25 * up : Math.max(0, 1.25 * (1 - Ease.inBack((k - 0.3) / 0.7)));
        g.translate(0, -40 * Ease.outCubic(k));
        g.rotate(k * TAU * 0.8);
        g.scale(shrink, shrink);
      }
      this.assets.drawSprite(g, spr, f.w, f.h, f.flip);
      if (f.inWater && k === 0) {
        g.rotate(-(f.rot + wob));
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(0, f.h * 0.28, f.w * 0.55, f.h * 0.08, 0, 0, TAU); g.stroke();
      }
    } else {
      // weeds sway, then get yanked out
      g.translate(f.x, f.y);
      let rot = f.rot + Math.sin(this.time * 1.6 + f.phase) * 0.05;
      let dy = 0, sy = 1, alpha = 1;
      if (k > 0) {
        if (k < 0.25) { sy = 1 + 0.25 * (k / 0.25); rot += Math.sin(k * 60) * 0.06; }
        else { const q = (k - 0.25) / 0.75; dy = -f.h * 1.2 * Ease.outCubic(q); sy = 1.25 - 0.2 * q; rot += q * 0.8; alpha = 1 - q; }
      }
      g.globalAlpha = alpha;
      g.translate(0, dy);
      g.rotate(rot);
      g.scale(1, sy);
      g.translate(0, -f.h / 2);
      this.assets.drawSprite(g, spr, f.w, f.h, f.flip);
    }
    g.restore();
  }

  drawCobwebFault(g, f, fx) {
    let k = 0;
    if (fx && this.time >= fx.t0) { k = clamp01((this.time - fx.t0) / FIX_DUR.sweep); if (k >= 1) return; }
    g.save();
    if (k > 0) {
      g.translate(f.x, f.y);
      g.rotate((f.corner === 'tl' ? 1 : -1) * k * 2.5);
      g.scale(1 - k, 1 - k);
      g.translate(-f.x, -f.y);
    }
    drawCobweb(g, f.x, f.y, f.webSize, f.corner, f.pattern, 1 - k * 0.5);
    g.restore();
  }

  drawPigeon(g, f, fx) {
    let k = 0;
    if (fx && this.time >= fx.t0) { k = clamp01((this.time - fx.t0) / FIX_DUR.flap); if (k >= 1) return; }
    const dir = f.flip ? -1 : 1;
    g.save();
    if (k === 0) {
      const peck = Math.max(0, Math.sin(this.time * 1.4 + f.phase * 3) - 0.85) * 3;
      g.translate(f.cx, f.cy);
      g.rotate(peck * 0.25 * dir);
      this.assets.drawSprite(g, this.spr(f.sprite), f.w, f.h, f.flip);
    } else {
      const spr = this.spr(f.fly);
      const x = f.cx + dir * 420 * Ease.inQuad(k);
      const y = f.cy - 360 * Ease.outQuad(k) + Math.sin(k * 30) * 6;
      g.translate(x, y);
      g.scale(1, 0.85 + 0.25 * Math.abs(Math.sin(k * 40)));
      g.globalAlpha = 1 - Math.max(0, (k - 0.7) / 0.3);
      this.assets.drawSprite(g, spr, f.w * 1.3, f.h * 1.1, dir < 0);
    }
    g.restore();
  }

  drawCat(g, state) {
    const c = this.cat;
    const spr = this.spr(c.sprite);
    if (!spr) return;
    let k = 0;
    if (c.found != null && state === 'live') { k = clamp01((this.time - c.found) / 0.9); if (k >= 1) return; }
    g.save();
    const breathe = 1 + Math.sin(this.time * 2.2) * 0.012;
    g.translate(c.cx, c.y);
    if (k > 0) {
      g.translate((c.flip ? -1 : 1) * 160 * k, -Math.sin(k * Math.PI) * 120 - k * 40);
      g.globalAlpha = 1 - k * k;
    }
    g.scale(1, breathe);
    g.translate(0, -c.h / 2);
    this.assets.drawSprite(g, spr, c.w, c.h, c.flip);
    g.restore();
  }

  drawCollectible(g) {
    const c = this.collectible;
    const spr = this.assets.sprite(c.sprite, this.village);
    if (!spr) return;
    const size = c.size;
    const h = size, w = (size * spr.w) / spr.h;
    let x = c.cx, y = c.cy + Math.sin(this.time * 2) * 2, sc = 1, alpha = 1;
    if (c.found != null) {
      const k = clamp01((this.time - c.found) / 0.8);
      if (k >= 1) return;
      sc = 1 + 0.6 * Math.sin(Math.min(1, k * 2) * Math.PI / 2) - 0.8 * Math.max(0, k - 0.5);
      if (c.target) {
        const [tx, ty] = this.screenToWorld(c.target[0], c.target[1]);
        const q = Ease.inCubic(Math.max(0, (k - 0.3) / 0.7));
        x = lerp(x, tx, q); y = lerp(y, ty, q);
      }
      alpha = 1 - Math.max(0, (k - 0.8) / 0.2);
    }
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.scale(sc, sc);
    g.rotate(Math.sin(this.time * 1.5) * 0.05);
    g.shadowColor = 'rgba(255,240,180,0.9)';
    g.shadowBlur = 8;
    this.assets.drawSprite(g, spr, w, h);
    g.restore();
    // periodic glint
    const ph = (this.time % 2.4) / 2.4;
    if (c.found == null && ph < 0.25) {
      const a = Math.sin((ph / 0.25) * Math.PI);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.fillStyle = '#fff8d8';
      g.translate(x + w * 0.3, y - h * 0.3);
      g.rotate(this.time);
      const s = 12;
      g.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.22 : s; const an = (i / 8) * TAU; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      g.fill();
      g.restore();
    }
  }

  drawDecor(g, d, state) {
    let appear = 1;
    if (d.appear != null && state === 'live') {
      if (this.time < d.appear) return;
      appear = clamp01((this.time - d.appear) / 1.2);
    }
    const pts = catenary(d.points, d.sag, d.kind === 'lights' ? 40 : 30);
    const n = Math.max(2, Math.round(pts.length * appear));
    g.save();
    g.strokeStyle = 'rgba(50,40,35,0.8)';
    g.lineWidth = 1.6;
    g.beginPath();
    pts.slice(0, n).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    const cols = ['#d9483b', '#f2c14e', '#4f86c6', '#f4ecd8', '#6ea96a', '#e38fb0'].map((c) => gradeColor(c, this.cond, this.bloom));
    pts.slice(1, n - 1).forEach(([x, y], i) => {
      if (d.kind === 'lights') {
        g.fillStyle = this.dark ? '#fff2c4' : '#f6e6b0';
        g.strokeStyle = 'rgba(60,50,40,0.6)';
        g.beginPath(); g.ellipse(x, y + 5, 3.5, 5, 0, 0, TAU); g.fill(); g.stroke();
        return;
      }
      g.save();
      g.translate(x, y);
      g.rotate(Math.sin(this.time * 3 + i) * 0.12);
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.lineTo(0, 22); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,30,25,0.35)'; g.lineWidth = 0.8; g.stroke();
      g.restore();
    });
    g.restore();
  }

  // ---- hint overlays -----------------------------------------------------------
  drawOverlays(g) {
    for (const o of this.overlays) {
      const k = (this.time - o.t0) / o.life;
      if (o.kind === 'loupe') {
        const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        const r = o.r * (0.9 + 0.1 * Math.sin(this.time * 6));
        g.save();
        g.globalAlpha = 0.45 * a;
        g.fillStyle = '#1c1a26';
        g.beginPath();
        g.rect(0, 0, this.W, this.H);
        g.arc(o.x, o.y, r, 0, TAU, true);
        g.fill('evenodd');
        g.globalAlpha = a;
        g.strokeStyle = '#c9a24a';
        g.lineWidth = 9;
        g.beginPath(); g.arc(o.x, o.y, r, 0, TAU); g.stroke();
        g.strokeStyle = '#f5e2a8';
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(o.x, o.y, r - 5, 0, TAU); g.stroke();
        const ang = 0.8;
        g.strokeStyle = '#5a3d24';
        g.lineWidth = 14;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(o.x + Math.cos(ang) * (r + 6), o.y + Math.sin(ang) * (r + 6));
        g.lineTo(o.x + Math.cos(ang) * (r + 70), o.y + Math.sin(ang) * (r + 70));
        g.stroke();
        g.restore();
      } else if (o.kind === 'flash') {
        const a = k < 0.1 ? 1 : Math.max(0, 1 - (k - 0.1) / 0.9);
        g.save();
        for (const id of o.faults) {
          if (this.fx.has(id)) continue;
          const f = this.faults.find((x) => x.id === id);
          g.globalAlpha = a;
          g.lineWidth = 4;
          g.setLineDash([10, 7]);
          g.lineDashOffset = -this.time * 40;
          g.strokeStyle = '#fff4c2';
          g.shadowColor = '#ffcf4a';
          g.shadowBlur = 14;
          g.beginPath();
          if (f.shape.kind === 'circle') g.arc(f.shape.x, f.shape.y, f.shape.r + 6, 0, TAU);
          else {
            const b = shapeBounds(f.shape);
            g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 12, b.h / 2 + 12, 0, 0, TAU);
          }
          g.stroke();
        }
        g.restore();
        if (k < 0.12) {
          g.save();
          g.globalAlpha = 0.85 * (1 - k / 0.12);
          g.fillStyle = '#fffdf4';
          g.fillRect(0, 0, this.W, this.H);
          g.restore();
        }
      } else if (o.kind === 'nudge') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const a = Math.sin(k * Math.PI) * 0.8;
        g.fillStyle = `rgba(255,248,210,${a})`;
        for (let i = 0; i < 3; i++) {
          const an = this.time * 2 + i * 2.1;
          const x = o.x + Math.cos(an) * 26, y = o.y + Math.sin(an) * 26;
          g.beginPath(); g.arc(x, y, 4 + 2 * Math.sin(this.time * 8 + i), 0, TAU); g.fill();
        }
        g.restore();
      }
    }
  }

  drawScreenFx(g) {
    for (const f of this.screenFx) {
      const age = this.time - f.t0;
      if (f.kind === 'ripple') {
        const k = age / 0.6;
        g.save();
        g.globalAlpha = 1 - k;
        g.strokeStyle = f.ok ? '#fffaf0' : '#e0605a';
        g.lineWidth = f.ok ? 3 : 2.5;
        g.beginPath(); g.arc(f.x, f.y, 10 + k * (f.ok ? 34 : 18), 0, TAU); g.stroke();
        if (!f.ok) {
          const s = 7 * (1 - k * 0.5);
          g.beginPath();
          g.moveTo(f.x - s, f.y - s); g.lineTo(f.x + s, f.y + s);
          g.moveTo(f.x + s, f.y - s); g.lineTo(f.x - s, f.y + s);
          g.stroke();
        }
        g.restore();
      } else if (f.kind === 'text') {
        const k = age / f.life;
        const [x, y] = this.worldToScreen(f.wx, f.wy);
        const pop = k < 0.15 ? Ease.outBack(k / 0.15, 3) : 1;
        g.save();
        g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        g.translate(x, y - 50 * Ease.outCubic(k));
        g.scale(pop, pop);
        g.font = `700 ${f.size}px "Caveat", cursive`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(255,250,238,0.95)';
        g.strokeText(f.text, 0, 0);
        g.fillStyle = f.color;
        g.fillText(f.text, 0, 0);
        g.restore();
      }
    }
  }

  // --------------------------------------------------------------- stills ---
  /** Render the scene into a new canvas: state 'before' (messy) or 'after'. */
  renderStill(state, width = 900) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * this.H) / this.W);
    const g = c.getContext('2d');
    const k = width / this.W;
    g.setTransform(k, 0, 0, k, 0, 0);
    const savedFx = this.fx;
    const savedRestoring = this.restoring;
    this.fx = new Map();
    this.restoring = null;
    this.drawWorld(g, state);
    this.fx = savedFx;
    this.restoring = savedRestoring;
    return c;
  }
}

/** Points along a sagging string through the given anchor points. */
export function catenary(points, sag = 40, spacing = 30) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / spacing));
    for (let j = i === 0 ? 0 : 1; j <= n; j++) {
      const t = j / n;
      out.push([lerp(x0, x1, t), lerp(y0, y1, t) + Math.sin(t * Math.PI) * sag]);
    }
  }
  return out;
}
