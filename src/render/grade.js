// Colour grading with canvas blend modes (works on iOS Safari, which lacks
// ctx.filter). Used to bake each scene's plate for its weather condition and
// restoration "bloom": a tired, unloved scene is cooler and greyer; restoring
// it warms it up.

export function bakePlate(img, cond, bloom, W = 1000, H = 1500, maxW = 1664) {
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  applyGrade(g, c.width, c.height, cond, bloom);
  c.unit = c.width / W; // pixels per scene unit
  return c;
}

/** Grade a sprite the same way as its plate (minus the vignette), keeping alpha. */
export function gradeSprite(spr, cond, bloom) {
  const c = document.createElement('canvas');
  c.width = spr.sw; c.height = spr.sh;
  const g = c.getContext('2d');
  g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, 0, 0, c.width, c.height);
  applyGrade(g, c.width, c.height, cond, bloom, { vignette: false });
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(spr.img, spr.sx, spr.sy, spr.sw, spr.sh, 0, 0, c.width, c.height);
  return { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, w: spr.w, h: spr.h, key: spr.key + '|g', color: spr.color };
}

/** Approximate the grade for a flat colour (bunting, particles). */
export function gradeColor(hex, cond, bloom = 1) {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const gr = cond?.grade || {};
  const tired = Math.max(0, 1 - bloom);
  const grey = (r + g + b) / 3;
  const desat = 0.3 * tired + ((gr.sat ?? 1) < 1 ? 1 - gr.sat : 0);
  [r, g, b] = [r, g, b].map((v) => v + (grey - v) * desat);
  const br = gr.bright ?? 1;
  [r, g, b] = [r, g, b].map((v) => v * Math.min(1.1, br));
  if (gr.tint && gr.mode === 'multiply') {
    const t = [1, 3, 5].map((i) => parseInt(gr.tint.slice(i, i + 2), 16) / 255);
    const a = gr.tintAlpha ?? 0.2;
    [r, g, b] = [r, g, b].map((v, i) => v * (1 - a + a * t[i]));
  }
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${to(r)},${to(g)},${to(b)})`;
}

export function applyGrade(g, w, h, cond, bloom = 1, opts = {}) {
  const gr = cond?.grade || {};
  const tired = Math.max(0, 1 - bloom);
  g.save();
  // tired scenes: grey and cool
  if (tired > 0) {
    fill(g, 'saturation', '#808080', 0.42 * tired, w, h);
    fill(g, 'multiply', '#c3cbd2', 0.3 * tired, w, h);
  } else {
    fill(g, 'soft-light', '#ffd8a0', 0.12, w, h);
  }
  const sat = gr.sat ?? 1;
  if (sat < 1) fill(g, 'saturation', '#808080', 1 - sat, w, h);
  else if (sat > 1) fill(g, 'saturation', '#ff3030', Math.min(0.25, (sat - 1) * 0.9), w, h);
  const br = gr.bright ?? 1;
  if (br < 1) fill(g, 'multiply', grey(br), 1, w, h);
  else if (br > 1) fill(g, 'screen', grey(br - 1), 1, w, h);
  if (gr.tint) fill(g, gr.mode || 'soft-light', gr.tint, gr.tintAlpha ?? 0.2, w, h);
  if (gr.vignette && opts.vignette !== false) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 1;
    const rg = g.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(1, `rgba(40,30,60,${gr.vignette})`);
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }
  g.restore();
}

function fill(g, mode, color, alpha, w, h) {
  if (alpha <= 0) return;
  g.globalCompositeOperation = mode;
  g.globalAlpha = Math.min(1, alpha);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
}

function grey(v) {
  const n = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${n},${n},${n})`;
}
