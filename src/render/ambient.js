// Ambient life drawn over the plate: chimney smoke, swallows, butterflies,
// shimmering water, fog banks, fireflies, drips... chosen by the condition's
// `ambient` list and the scene's slots (chimneys, water). All in scene units.

import { Rng } from '../core/rng.js';
import { randomPointInPoly, bbox } from '../core/geometry.js';

const TAU = Math.PI * 2;

export class Ambient {
  constructor(scene, cond, seed = 1) {
    this.scene = scene;
    this.cond = cond;
    this.r = new Rng(seed);
    this.t = 0;
    this.kinds = new Set(cond.ambient || []);
    this.smoke = [];
    this.birds = [];
    this.nextFlock = 2 + this.r.float(0, 4);
    this.butterflies = [];
    this.motes = [];
    this.fireflies = [];
    this.bats = [];
    this.nextBat = 4;
    this.drips = [];
    this.glints = [];
    this.leaves = [];
    this.fog = [];
    this.stars = [];
    const [W, H] = scene.size;
    const zones = scene.zones || [];
    if (this.kinds.has('butterflies') && zones.length) {
      for (let i = 0; i < 3; i++) {
        const z = this.r.pick(zones);
        const [x, y] = randomPointInPoly(z.poly, this.r);
        this.butterflies.push({ x, y: y - 60, tx: x, ty: y - 60, phase: this.r.float(0, TAU), color: this.r.pick(['#f2c14e', '#e8f0ff', '#f39a6b', '#b8d6ff']), s: this.r.float(0.8, 1.2) });
      }
    }
    if (this.kinds.has('motes')) {
      for (let i = 0; i < 40; i++) this.motes.push({ x: this.r.float(0, W), y: this.r.float(H * 0.2, H), vx: this.r.float(4, 14), vy: this.r.float(-6, 3), s: this.r.float(1.5, 3.5), p: this.r.float(0, TAU) });
    }
    if (this.kinds.has('fireflies')) {
      for (let i = 0; i < 22; i++) {
        const z = zones.length ? this.r.pick(zones) : null;
        const [x, y] = z ? randomPointInPoly(z.poly, this.r) : [this.r.float(0, W), this.r.float(H * 0.6, H)];
        this.fireflies.push({ x, y: y - this.r.float(10, 90), p: this.r.float(0, TAU), sp: this.r.float(0.6, 1.4) });
      }
    }
    if (this.kinds.has('stars')) {
      for (let i = 0; i < 40; i++) this.stars.push({ x: this.r.float(0, W), y: this.r.float(0, H * 0.28), s: this.r.float(0.8, 2.2), p: this.r.float(0, TAU) });
    }
    if (this.kinds.has('fog')) {
      for (let i = 0; i < 14; i++) this.fog.push({ x: this.r.float(-300, W), y: this.r.float(H * 0.25, H * 0.95), rx: this.r.float(260, 520), ry: this.r.float(60, 140), v: this.r.float(6, 18), a: this.r.float(0.18, 0.4) });
    }
    if (this.kinds.has('clouds-dark')) this.darkSky = true;
  }

  update(dt) {
    this.t += dt;
    const r = this.r;
    const [W, H] = this.scene.size;
    // smoke
    const dusk = this.kinds.has('stars');
    for (const [cx, cy] of this.scene.chimneys || []) {
      if (r.chance(dt * 2.4)) this.smoke.push({ x: cx + r.float(-4, 4), y: cy, vx: r.float(6, 16), vy: r.float(-26, -16), s: r.float(6, 9), age: 0, life: r.float(3, 4.5), dark: dusk });
    }
    for (const p of this.smoke) { p.age += dt; p.x += (p.vx + p.age * 5) * dt; p.y += p.vy * dt; p.s += dt * 9; }
    this.smoke = this.smoke.filter((p) => p.age < p.life);

    // swallows
    if (this.kinds.has('swallows')) {
      this.nextFlock -= dt;
      if (this.nextFlock <= 0) {
        const dir = r.chance(0.5) ? 1 : -1;
        const y0 = r.float(H * 0.05, H * 0.3);
        for (let i = 0; i < r.int(2, 4); i++) {
          this.birds.push({ x: dir > 0 ? -40 - i * r.float(30, 70) : W + 40 + i * r.float(30, 70), y: y0 + r.float(-40, 40), vx: dir * r.float(170, 240), vy: r.float(-15, 15), p: r.float(0, TAU), s: r.float(8, 12) });
        }
        this.nextFlock = r.float(6, 13);
      }
      for (const b of this.birds) { b.x += b.vx * dt; b.y += (b.vy + Math.sin(this.t * 3 + b.p) * 25) * dt; b.p += dt * 14; }
      this.birds = this.birds.filter((b) => b.x > -200 && b.x < W + 200);
    }

    for (const b of this.butterflies) {
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 10 || r.chance(dt * 0.3)) {
        b.tx = Math.max(40, Math.min(W - 40, b.x + r.float(-160, 160)));
        b.ty = Math.max(H * 0.35, Math.min(H - 60, b.y + r.float(-100, 100)));
      }
      b.x += (b.tx - b.x) * dt * 0.8 + Math.sin(this.t * 5 + b.phase) * 20 * dt;
      b.y += (b.ty - b.y) * dt * 0.8 + Math.cos(this.t * 7 + b.phase) * 30 * dt;
    }
    for (const m of this.motes) {
      m.x += m.vx * dt; m.y += (m.vy + Math.sin(this.t + m.p) * 6) * dt;
      if (m.x > W + 10) m.x = -10;
    }
    for (const f of this.fireflies) { f.x += Math.sin(this.t * f.sp + f.p) * 14 * dt; f.y += Math.cos(this.t * f.sp * 0.8 + f.p) * 10 * dt; }
    for (const f of this.fog) { f.x += f.v * dt; if (f.x - f.rx > W) f.x = -f.rx; }

    if (this.kinds.has('bats')) {
      this.nextBat -= dt;
      if (this.nextBat <= 0) {
        const dir = r.chance(0.5) ? 1 : -1;
        this.bats.push({ x: dir > 0 ? -30 : W + 30, y: r.float(H * 0.08, H * 0.3), vx: dir * r.float(140, 200), p: 0, s: r.float(10, 14) });
        this.nextBat = r.float(7, 14);
      }
      for (const b of this.bats) { b.x += b.vx * dt; b.y += Math.sin(this.t * 9 + b.x * 0.02) * 60 * dt; b.p += dt * 22; }
      this.bats = this.bats.filter((b) => b.x > -60 && b.x < W + 60);
    }

    if (this.kinds.has('drips')) {
      if (r.chance(dt * 6)) this.drips.push({ x: r.float(0, W), y: r.float(0, H * 0.6), vy: r.float(500, 700), age: 0 });
      for (const d of this.drips) { d.age += dt; d.y += d.vy * dt; }
      this.drips = this.drips.filter((d) => d.age < 0.5);
      if (r.chance(dt * 0.8) && this.scene.zones?.length) {
        const z = r.pick(this.scene.zones);
        const [x, y] = randomPointInPoly(z.poly, r);
        this.glints.push({ x, y, age: 0, life: 0.7, s: r.float(10, 18) });
      }
    }
    // water shimmer
    for (const poly of this.scene.water || []) {
      if (r.chance(dt * 3.5)) {
        const [x, y] = randomPointInPoly(poly, r);
        this.glints.push({ x, y, age: 0, life: r.float(0.5, 1), s: r.float(8, 16), water: true });
      }
    }
    for (const g of this.glints) g.age += dt;
    this.glints = this.glints.filter((g) => g.age < g.life);
  }

  /** Behind props (fog far layers, stars, smoke). */
  drawBack(g) {
    const [W, H] = this.scene.size;
    for (const s of this.stars) {
      const a = 0.35 + 0.35 * Math.sin(this.t * 2 + s.p);
      g.fillStyle = `rgba(255,250,220,${a})`;
      g.beginPath(); g.arc(s.x, s.y, s.s, 0, TAU); g.fill();
    }
    if (this.darkSky) {
      const gr = g.createLinearGradient(0, 0, 0, H * 0.4);
      gr.addColorStop(0, 'rgba(50,60,80,0.35)');
      gr.addColorStop(1, 'rgba(50,60,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H * 0.4);
    }
    for (const p of this.smoke) {
      const k = p.age / p.life;
      g.fillStyle = p.dark ? `rgba(150,150,170,${0.28 * (1 - k)})` : `rgba(245,242,235,${0.4 * (1 - k)})`;
      g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill();
    }
    for (const gl of this.glints) {
      const k = gl.age / gl.life;
      const a = Math.sin(k * Math.PI);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(gl.x - gl.s, gl.y); g.lineTo(gl.x + gl.s, gl.y);
      if (!gl.water) { g.moveTo(gl.x, gl.y - gl.s * 0.6); g.lineTo(gl.x, gl.y + gl.s * 0.6); }
      g.stroke();
      g.restore();
    }
  }

  /** In front of everything (fog, birds, fireflies). */
  drawFront(g) {
    const [W, H] = this.scene.size;
    const ink = 'rgba(40,40,52,0.85)';
    for (const b of this.birds) {
      const f = Math.sin(b.p) * 0.6;
      g.strokeStyle = ink; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(b.x - b.s, b.y - b.s * f);
      g.quadraticCurveTo(b.x - b.s * 0.4, b.y - b.s * 0.2, b.x, b.y);
      g.quadraticCurveTo(b.x + b.s * 0.4, b.y - b.s * 0.2, b.x + b.s, b.y - b.s * f);
      g.stroke();
    }
    for (const b of this.bats) {
      const f = Math.sin(b.p);
      g.fillStyle = 'rgba(25,20,35,0.9)';
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.s, b.y - b.s * 0.6 * f);
      g.lineTo(b.x - b.s * 0.5, b.y + 2);
      g.lineTo(b.x, b.y + 3);
      g.lineTo(b.x + b.s * 0.5, b.y + 2);
      g.lineTo(b.x + b.s, b.y - b.s * 0.6 * f);
      g.closePath(); g.fill();
    }
    for (const b of this.butterflies) {
      const f = Math.abs(Math.sin(this.t * 14 + b.phase));
      g.save();
      g.translate(b.x, b.y);
      g.fillStyle = b.color;
      g.strokeStyle = 'rgba(40,40,50,0.6)';
      g.lineWidth = 0.8;
      for (const s of [-1, 1]) {
        g.beginPath(); g.ellipse(s * 5 * f * b.s, -2, 6 * f * b.s + 1, 5 * b.s, s * 0.4, 0, TAU); g.fill(); g.stroke();
        g.beginPath(); g.ellipse(s * 4 * f * b.s, 4, 4 * f * b.s + 0.8, 3.5 * b.s, -s * 0.3, 0, TAU); g.fill(); g.stroke();
      }
      g.restore();
    }
    for (const m of this.motes) {
      g.fillStyle = `rgba(255,236,170,${0.35 + 0.3 * Math.sin(this.t * 2 + m.p)})`;
      g.beginPath(); g.arc(m.x, m.y, m.s, 0, TAU); g.fill();
    }
    if (this.fireflies.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const f of this.fireflies) {
        const a = Math.max(0, Math.sin(this.t * 2.2 * f.sp + f.p));
        const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14);
        gr.addColorStop(0, `rgba(220,255,140,${0.9 * a})`);
        gr.addColorStop(1, 'rgba(220,255,140,0)');
        g.fillStyle = gr;
        g.fillRect(f.x - 14, f.y - 14, 28, 28);
      }
      g.restore();
    }
    for (const d of this.drips) {
      g.strokeStyle = 'rgba(210,225,240,0.55)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - 2, d.y + 18); g.stroke();
    }
    if (this.fog.length) {
      const fogCfg = this.cond.fog || { color: '#eef1ec', density: 0.5 };
      // depth haze: thicker in the distance
      const farY = this.scene.depth.farY;
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, hexA(fogCfg.color, 0.1));
      gr.addColorStop(Math.min(0.95, farY / H), hexA(fogCfg.color, 0.42 * fogCfg.density / 0.55));
      gr.addColorStop(1, hexA(fogCfg.color, 0.06));
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      for (const f of this.fog) {
        const rg = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.rx);
        rg.addColorStop(0, hexA(fogCfg.color, f.a));
        rg.addColorStop(1, hexA(fogCfg.color, 0));
        g.save();
        g.translate(f.x, f.y);
        g.scale(1, f.ry / f.rx);
        g.translate(-f.x, -f.y);
        g.fillStyle = rg;
        g.beginPath(); g.arc(f.x, f.y, f.rx, 0, TAU); g.fill();
        g.restore();
      }
    }
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
