// Procedural textures: grime scraps for windows, peeling for faded paint, cobwebs.
import { Rng } from '../core/rng.js';

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

/** A jagged torn-paper outline around (cx, cy): points for a path. */
function tornBlob(r, cx, cy, rx, ry, n = 12) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.float(-0.15, 0.15);
    const k = r.float(0.7, 1.05);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

function tracePath(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/** No grading: colours as written. */
const plain = (hex, a = 1) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Faded paint, cut-paper style: the coloured paper has peeled away in torn
 * patches to bare cream paper beneath, and a corner has lifted and curled.
 * Drawn over the bleached region; bold shapes that read at phone size.
 * `tone(hex, alpha)` grades a colour for the scene's light (dusk, mist...).
 */
export function peeling(g, w, h, seed, amount, tone = plain) {
  const r = new Rng(seed);
  const m = Math.min(w, h);
  const patches = 1 + Math.round(2 * amount);
  for (let i = 0; i < patches; i++) {
    const s = m * r.float(0.16, 0.28) * (0.6 + 0.6 * amount);
    const cx = r.float(0.2, 0.8) * w, cy = r.float(0.15, 0.85) * h;
    const pts = tornBlob(r, cx, cy, s * r.float(0.8, 1.3), s * r.float(0.7, 1.1));
    // a shadow on one side sells the paper's thickness
    g.save();
    g.translate(m * 0.02, m * 0.025);
    g.fillStyle = tone('#46372a', 0.45);
    tracePath(g, pts);
    g.fill();
    g.restore();
    g.fillStyle = tone('#f2ead7');
    tracePath(g, pts);
    g.fill();
    // fibres at the torn edge
    g.strokeStyle = tone('#ffffff', 0.7);
    g.lineWidth = Math.max(1, m * 0.012);
    tracePath(g, pts);
    g.stroke();
  }
  // a lifted corner, curling towards the viewer
  const left = r.chance(0.5);
  const f = m * (0.22 + 0.2 * amount);
  const x0 = left ? 0 : w, sx = left ? 1 : -1;
  g.fillStyle = tone('#3c2d1e', 0.4);
  g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + sx * f * 1.15, 0); g.lineTo(x0, f * 1.15); g.closePath(); g.fill();
  g.fillStyle = tone('#e4d8bd');
  g.beginPath(); g.moveTo(x0 + sx * f, 0); g.quadraticCurveTo(x0 + sx * f * 0.35, f * 0.35, x0, f); g.lineTo(x0 + sx * f * 0.62, f * 0.62); g.closePath(); g.fill();
  g.strokeStyle = tone('#5a4832', 0.55);
  g.lineWidth = Math.max(1, m * 0.012);
  g.stroke();
}

/**
 * Grime, cut-paper style: a torn, see-through scrap of stained brown paper
 * stuck over the glass. It muddies the glazing bars, which is what the eye
 * catches. `alpha` comes from the fault's amount.
 */
export function sootScrap(g, w, h, seed, alpha, tone = plain) {
  const r = new Rng(seed);
  const m = Math.min(w, h);
  const inset = m * 0.06;
  // torn outline: a rectangle with ragged edges, just inside the window
  const pts = [];
  const side = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + r.float(-1, 1) * inset * 0.8, y0 + (y1 - y0) * t + r.float(-1, 1) * inset * 0.8]); } };
  side(inset, inset, w - inset, inset, 6);
  side(w - inset, inset, w - inset, h - inset, 7);
  side(w - inset, h - inset, inset, h - inset, 6);
  side(inset, h - inset, inset, inset, 7);
  g.save();
  g.globalAlpha = alpha;
  g.translate(m * 0.02, m * 0.03);
  g.fillStyle = tone('#281e14', 0.5);
  tracePath(g, pts);
  g.fill();
  g.restore();
  g.save();
  // see-through, so the glazing bars still show, murky, through the dirt
  g.globalAlpha = alpha * 0.82;
  tracePath(g, pts);
  g.clip();
  g.fillStyle = tone('#7a6848');
  g.fillRect(0, 0, w, h);
  // stains and a dirty drip or two
  for (let i = 0; i < 14; i++) {
    const x = r.float(0, w), y = r.float(0, h), rad = m * r.float(0.12, 0.4);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r.chance(0.6);
    gr.addColorStop(0, dark ? tone('#3a2c1a', r.float(0.4, 0.7)) : tone('#a8966c', r.float(0.25, 0.45)));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = tone('#342818', 0.55);
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = r.float(0.15, 0.85) * w;
    g.lineWidth = m * r.float(0.03, 0.06);
    g.beginPath(); g.moveTo(x, r.float(0.05, 0.4) * h); g.lineTo(x + r.float(-3, 3), r.float(0.6, 0.98) * h); g.stroke();
  }
  g.restore();
  // pale torn edge
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = tone('#c4b48c', 0.75);
  g.lineWidth = Math.max(1, m * 0.02);
  tracePath(g, pts);
  g.stroke();
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
