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

export function applyGrade(g, w, h, cond, bloom = 1) {
  const gr = cond?.grade || {};
  const tired = Math.max(0, 1 - bloom);
  g.save();
  // tired scenes: grey and cool
  if (tired > 0) {
    fill(g, 'saturation', '#808080', 0.3 * tired, w, h);
    fill(g, 'multiply', '#c9d0d6', 0.22 * tired, w, h);
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
  if (gr.vignette) {
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
