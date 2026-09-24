// Procedural textures: grime for windows, flaking for faded paint, cobwebs.
import { Rng } from '../core/rng.js';

let grimeTex = null;

/** A 256px tile of greasy smudges and streaks. */
export function grimeTexture() {
  if (grimeTex) return grimeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = new Rng(77);
  g.fillStyle = 'rgba(120,104,78,0.55)';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = r.float(0, 256), y = r.float(0, 256), rad = r.float(8, 46);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r.chance(0.6);
    gr.addColorStop(0, dark ? `rgba(70,58,40,${r.float(0.25, 0.55)})` : `rgba(190,176,140,${r.float(0.15, 0.35)})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.save(); g.translate(dx, dy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
  }
  // rain streaks
  g.strokeStyle = 'rgba(90,76,56,0.35)';
  for (let i = 0; i < 40; i++) {
    const x = r.float(0, 256), y = r.float(-30, 256), len = r.float(20, 70);
    g.lineWidth = r.float(1, 3);
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + r.float(-4, 4), y + len / 3, x + r.float(-4, 4), y + (2 * len) / 3, x + r.float(-3, 3), y + len);
    g.stroke();
  }
  // speckles
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r.chance(0.5) ? 'rgba(60,50,35,0.4)' : 'rgba(210,200,170,0.3)';
    g.fillRect(r.float(0, 256), r.float(0, 256), r.float(0.8, 2.2), r.float(0.8, 2.2));
  }
  grimeTex = c;
  return c;
}

/** Draw a procedural cobweb in the corner of a rectangle. */
export function drawCobweb(g, x, y, size, corner, seed, alpha = 1) {
  const r = new Rng(seed);
  const dir = corner === 'tl' ? 1 : -1;
  const threads = 6 + r.int(0, 2);
  const angles = [];
  for (let i = 0; i < threads; i++) {
    const a = (i / (threads - 1)) * (Math.PI / 2) + r.float(-0.08, 0.08);
    angles.push(a);
  }
  const pt = (a, d) => [x + dir * Math.cos(a) * d, y + Math.sin(a) * d];
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(250,250,245,0.85)';
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 2;
  g.lineWidth = Math.max(0.8, size * 0.018);
  for (const a of angles) {
    const d = size * r.float(0.85, 1.1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(...pt(a, d));
    g.stroke();
  }
  g.lineWidth = Math.max(0.6, size * 0.012);
  const rings = 5;
  for (let k = 1; k <= rings; k++) {
    const d = (k / rings) * size * 0.95;
    g.beginPath();
    angles.forEach((a, i) => {
      const [px, py] = pt(a, d * r.float(0.92, 1.05));
      if (i === 0) g.moveTo(px, py);
      else {
        const [qx, qy] = pt((a + angles[i - 1]) / 2, d * 0.86);
        g.quadraticCurveTo(qx, qy, px, py);
      }
    });
    g.stroke();
  }
  g.restore();
}

/** Scatter of paint flakes/cracks over a region canvas (for faded paint). */
export function flakes(g, w, h, seed, amount) {
  const r = new Rng(seed);
  const n = Math.round((w * h) / 350 * amount);
  for (let i = 0; i < n; i++) {
    const x = r.float(0, w), y = r.float(0, h), s = r.float(1, 4.5);
    g.fillStyle = r.chance(0.65) ? `rgba(236,228,210,${0.5 * amount})` : `rgba(90,80,64,${0.35 * amount})`;
    g.beginPath();
    g.ellipse(x, y, s, s * r.float(0.4, 1), r.float(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = `rgba(80,70,55,${0.3 * amount})`;
  g.lineWidth = 1;
  for (let i = 0; i < n / 10; i++) {
    let x = r.float(0, w), y = r.float(0, h);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += r.float(-8, 8); y += r.float(2, 10); g.lineTo(x, y); }
    g.stroke();
  }
}
