// Lightweight particle system, in scene units (so bursts stick to the scene
// while the camera moves). Presets are named by the `particles` field of each
// fault type in content/common/faults.json.

import { Rng } from '../core/rng.js';

const rng = new Rng(Date.now() % 1e9);
const TAU = Math.PI * 2;

export class Particles {
  constructor() { this.list = []; }

  spawn(p) {
    this.list.push({ age: 0, life: 1, vx: 0, vy: 0, ax: 0, ay: 0, rot: 0, vr: 0, size: 6, grow: 0, alpha: 1, drag: 0, ...p });
    if (this.list.length > 600) this.list.shift();
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(g) {
    for (const p of this.list) {
      const k = p.age / p.life;
      const a = p.alpha * (p.fadeIn ? Math.min(1, k * 6) : 1) * (1 - Math.pow(k, p.fadePow || 2));
      if (a <= 0.01) continue;
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      switch (p.kind) {
        case 'spark': {
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = p.color || '#fff6c8';
          const s = p.size * (1 - k * 0.5);
          star(g, s);
          break;
        }
        case 'glow': {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, p.size);
          gr.addColorStop(0, p.color || 'rgba(255,220,120,0.9)');
          gr.addColorStop(1, 'rgba(255,200,80,0)');
          g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, p.size, 0, TAU); g.fill();
          break;
        }
        case 'puff':
          g.fillStyle = p.color || 'rgba(235,228,210,0.7)';
          g.beginPath(); g.arc(0, 0, p.size, 0, TAU); g.fill();
          break;
        case 'confetti':
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case 'petal':
          g.fillStyle = p.color;
          g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, TAU); g.fill();
          break;
        case 'feather':
          g.fillStyle = p.color || '#9aa0a8';
          g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.28, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(60,60,70,0.5)'; g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(-p.size, 0); g.lineTo(p.size, 0); g.stroke();
          break;
        case 'drop':
          g.fillStyle = p.color;
          g.beginPath(); g.arc(0, 0, p.size, 0, TAU); g.fill();
          break;
        case 'dirt':
          g.fillStyle = p.color || '#6b5236';
          g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;
        case 'heart':
          g.fillStyle = p.color || '#e0605a';
          heart(g, p.size);
          break;
        case 'streak':
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = p.color || 'rgba(255,255,255,0.9)';
          g.lineWidth = p.width || 2;
          g.beginPath(); g.moveTo(-p.size, 0); g.lineTo(p.size, 0); g.stroke();
          break;
      }
      g.restore();
    }
  }

  // ---------------------------------------------------------- presets ----
  burst(kind, x, y, o = {}) {
    const fn = PRESETS[kind];
    if (fn) fn(this, x, y, o);
  }
}

function star(g, s) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? s * 0.28 : s;
    const a = (i / 8) * TAU;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

function heart(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.35);
  g.bezierCurveTo(-s, -s * 0.3, -s * 0.4, -s, 0, -s * 0.45);
  g.bezierCurveTo(s * 0.4, -s, s, -s * 0.3, 0, s * 0.35);
  g.fill();
}

const CONFETTI = ['#d9483b', '#f2c14e', '#4f86c6', '#6ea96a', '#f4ecd8', '#e38fb0'];

const PRESETS = {
  sparkle(P, x, y, o) {
    const n = o.n ?? 12;
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, TAU), sp = rng.float(40, 170) * (o.scale || 1);
      P.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rng.float(0.4, 0.8), size: rng.float(5, 11) * (o.scale || 1), vr: rng.float(-4, 4), color: o.color });
    }
    for (let i = 0; i < (o.confetti ?? 8); i++) {
      const a = rng.float(-Math.PI, 0), sp = rng.float(80, 220);
      P.spawn({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 380, drag: 1.5, life: rng.float(0.7, 1.2), size: rng.float(6, 10), vr: rng.float(-12, 12), color: rng.pick(CONFETTI) });
    }
  },
  dust(P, x, y, o) {
    for (let i = 0; i < (o.n ?? 9); i++) {
      const a = rng.float(0, TAU), sp = rng.float(20, 70);
      P.spawn({ kind: 'puff', x: x + rng.float(-10, 10), y: y + rng.float(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 - 15, drag: 2.5, life: rng.float(0.5, 0.9), size: rng.float(6, 12), grow: 18, alpha: 0.7, color: o.color || 'rgba(225,215,190,0.8)' });
    }
    PRESETS.sparkle(P, x, y, { n: 5, confetti: 0, scale: 0.8 });
  },
  dirt(P, x, y) {
    for (let i = 0; i < 12; i++) {
      const a = rng.float(-Math.PI * 0.9, -Math.PI * 0.1), sp = rng.float(80, 200);
      P.spawn({ kind: 'dirt', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 600, life: rng.float(0.5, 0.9), size: rng.float(3, 6), vr: rng.float(-10, 10), color: rng.pick(['#6b5236', '#8a6a44', '#4f3c28']) });
    }
    PRESETS.dust(P, x, y, { n: 5 });
  },
  paint(P, x, y, o) {
    for (let i = 0; i < 14; i++) {
      const a = rng.float(0, TAU), sp = rng.float(60, 190);
      P.spawn({ kind: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, ay: 500, life: rng.float(0.4, 0.8), size: rng.float(2.5, 6), color: o.color || '#4f86c6' });
    }
    PRESETS.sparkle(P, x, y, { n: 8, confetti: 0 });
  },
  glint(P, x, y, o) {
    for (let i = 0; i < 3; i++) P.spawn({ kind: 'streak', x: x + rng.float(-10, 10), y: y + rng.float(-10, 10), rot: -0.8, life: 0.5, size: rng.float(18, 34) * (o.scale || 1), width: 3 });
    PRESETS.sparkle(P, x, y, { n: 10, confetti: 0, color: '#ffffff' });
  },
  petals(P, x, y, o) {
    const cols = o.colors || ['#e8637a', '#f2c14e', '#f7a8c0', '#ffffff', '#b47ad0'];
    for (let i = 0; i < 16; i++) {
      const a = rng.float(-Math.PI, 0), sp = rng.float(60, 180);
      P.spawn({ kind: 'petal', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 140, drag: 1.2, life: rng.float(0.9, 1.5), size: rng.float(4, 7), vr: rng.float(-6, 6), color: rng.pick(cols) });
    }
    PRESETS.sparkle(P, x, y, { n: 6, confetti: 0 });
  },
  feathers(P, x, y) {
    for (let i = 0; i < 7; i++) {
      P.spawn({ kind: 'feather', x: x + rng.float(-12, 12), y: y + rng.float(-10, 10), vx: rng.float(-40, 40), vy: rng.float(-40, 10), ay: 25, drag: 1.4, life: rng.float(1.2, 1.9), size: rng.float(6, 10), vr: rng.float(-3, 3) });
    }
  },
  embers(P, x, y) {
    for (let i = 0; i < 14; i++) {
      P.spawn({ kind: 'glow', x: x + rng.float(-8, 8), y: y + rng.float(-8, 8), vx: rng.float(-30, 30), vy: rng.float(-90, -30), drag: 1, life: rng.float(0.6, 1.2), size: rng.float(4, 9), color: 'rgba(255,210,110,0.95)' });
    }
    PRESETS.sparkle(P, x, y, { n: 8, confetti: 0, color: '#ffe6a0' });
  },
  hearts(P, x, y) {
    for (let i = 0; i < 6; i++) P.spawn({ kind: 'heart', x: x + rng.float(-20, 20), y, vx: rng.float(-20, 20), vy: rng.float(-80, -50), life: 1.2, size: rng.float(7, 11), fadeIn: true });
  },
  confetti(P, x, y, o) {
    for (let i = 0; i < (o.n ?? 40); i++) {
      const a = rng.float(-Math.PI * 0.85, -Math.PI * 0.15), sp = rng.float(150, 420);
      P.spawn({ kind: 'confetti', x: x + rng.float(-30, 30), y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 420, drag: 1.2, life: rng.float(1.2, 2.2), size: rng.float(8, 14), vr: rng.float(-10, 10), color: rng.pick(CONFETTI) });
    }
  },
};
