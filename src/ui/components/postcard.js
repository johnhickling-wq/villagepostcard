// The postcard: a print with a decorative frame, script caption, postage
// stamp and postmark. The photo can be a canvas (fresh) or an image URL.
// A before/after slider can be attached to any postcard.

import { h, svg, ICONS, CONDITION_ICONS, icon } from '../dom.js';

export function postcardEl(app, o) {
  const cos = app.content.cosmetics;
  const frame = o.frame || app.save.cosmetics.equipped.frames || 'frame-classic';
  const film = cos.films[o.film || app.save.cosmetics.equipped.films || 'film-natural'];
  const photo = h('div.pc-photo');
  if (o.photo instanceof HTMLCanvasElement) photo.append(o.photo);
  else if (o.photo) photo.append(h('img', { src: o.photo, alt: '' }));
  if (film?.css) photo.style.filter = film.css;
  const cond = app.content.conditions[o.condition] || app.content.conditions.clear;
  const date = o.date ? new Date(o.date) : new Date();
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
  const postmarkKind = o.postmark || app.save.cosmetics.equipped.postmarks || 'postmark-wold';
  const markInner = {
    'postmark-wold': ['WOLD & VALE', dateStr, app.v.short.toUpperCase()],
    'postmark-rail': ['T.P.O.', dateStr, 'UP SPECIAL'],
    'postmark-bee': ['🐝', dateStr, 'BUSY BEE'],
    'postmark-crown': ['♛', dateStr, 'ROYAL MAIL'],
  }[postmarkKind] || ['WOLD & VALE', dateStr, ''];
  const stamp = h('div.pc-stamp.stamp', h('div.inner', h('img', { src: app.assets.spriteUrl('ui/postcard-stamp', 'common', 0.45), alt: '' })));
  const el = h(`div.postcard.${frame}${o.compact ? '.compact' : ''}`,
    h('div.pc-inner',
      photo,
      stamp,
      h('div.postmark.pc-postmark', h('div', h('div', { text: markInner[0] }), h('div.pm-date', { text: markInner[1] }), h('div', { text: markInner[2] })), h('i.wave')),
      h('div.pc-caption',
        h('div.script.pc-greet', { text: `Greetings from ${o.village || app.v.name}` }),
        h('div.pc-scene.row', h('span.label', { text: o.sceneName }), h('span.pc-cond', icon(CONDITION_ICONS[o.condition] || 'sun'), h('span.label', { text: cond.name }))),
      ),
    ),
  );
  if (frame === 'frame-pressed') {
    ['cowslip', 'harebell', 'dog-rose', 'oxeye-daisy'].forEach((k, i) => {
      const url = app.assets.spriteUrl(`collectibles/${k}`, app.village, 0.3);
      if (url) el.append(h('img.pc-flower', { src: url, style: { [i < 2 ? 'left' : 'right']: '-8px', [i % 2 ? 'bottom' : 'top']: '-10px', transform: `rotate(${[-20, 15, 25, -12][i]}deg)` } }));
    });
  }
  el.photo = photo;
  return el;
}

/** Attach a draggable before/after divider to a postcard's photo. */
export function beforeAfter(app, pc, beforeCanvasOrUrl, { auto = true } = {}) {
  const photo = pc.photo;
  const before = h('div.ba-before');
  if (beforeCanvasOrUrl instanceof HTMLCanvasElement) before.append(beforeCanvasOrUrl);
  else before.append(h('img', { src: beforeCanvasOrUrl, alt: '' }));
  const handle = h('div.ba-handle', h('div.ba-knob', svg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 7 4 12l5 5M15 7l5 5-5 5"/></svg>')));
  const tagB = h('div.ba-tag.left.label', { text: 'Before' });
  const tagA = h('div.ba-tag.right.label', { text: 'After' });
  photo.append(before, handle, tagB, tagA);
  let k = 1; // fraction showing "after" from the right: divider at x = (1-k)
  const set = (x) => {
    k = Math.max(0, Math.min(1, x));
    before.style.clipPath = `inset(0 ${k * 100}% 0 0)`;
    handle.style.left = `${(1 - k) * 100}%`;
  };
  set(1);
  let dragging = false;
  const move = (e) => {
    const r = app.localRect(photo);
    const [x] = app.toLocal(e.clientX, e.clientY);
    set(1 - (x - r.left) / r.width);
  };
  photo.addEventListener('pointerdown', (e) => { dragging = true; photo.setPointerCapture(e.pointerId); move(e); stopAuto(); });
  photo.addEventListener('pointermove', (e) => dragging && move(e));
  photo.addEventListener('pointerup', () => { dragging = false; });
  photo.style.touchAction = 'none';
  let raf = null;
  const stopAuto = () => { if (raf) cancelAnimationFrame(raf); raf = null; };
  const play = () => new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = (now - t0) / 1000;
      // after -> sweep to before -> back to the middle
      let x;
      if (t < 1.1) x = 1 - easeInOut(t / 1.1);
      else if (t < 1.6) x = 0;
      else if (t < 2.8) x = easeInOut((t - 1.6) / 1.2) * 0.5;
      else { set(0.5); raf = null; res(); return; }
      set(x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  return { set, play: auto ? play : () => Promise.resolve() };
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** A little rubber-stamp impression (for the 1-3 stamp grade). */
export function gradeStamp(n, label) {
  return h(`div.grade-stamp.g${n}`, h('div.gs-ring', h('div.gs-num.display', { text: '★'.repeat(n) }), h('div.gs-label.label', { text: label })));
}
