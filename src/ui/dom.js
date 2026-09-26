// Tiny DOM helpers and the hand-drawn icon set.

export function h(tag, props = {}, ...children) {
  // allow h('div', child, child...) without a props object
  if (props == null || props instanceof Node || Array.isArray(props) || typeof props !== 'object') {
    if (props != null && props !== false) children.unshift(props);
    props = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(markup, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (cls) el.classList.add(...cls.split(' '));
  return el;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Count a number element up from its current value, calling tick per step. */
export function countUp(el, to, { dur = 900, from = null, tick, format = (n) => n.toLocaleString('en-GB') } = {}) {
  const start = from ?? (parseInt(el.dataset.value || el.textContent.replace(/\D/g, '')) || 0);
  el.dataset.value = to;
  const t0 = performance.now();
  let last = start, lastTick = 0;
  return new Promise((res) => {
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (to - start) * e);
      el.textContent = format(v);
      // ticks like a till: steady, not one per number
      if (v !== last && now - lastTick > 55) { tick?.(v); lastTick = now; }
      last = v;
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

const S = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  rosette: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M11 18 L7 30 L11.5 27.5 L13.5 31 L16 20Z" fill="#2f4f86"/><path d="M21 18 L25 30 L20.5 27.5 L18.5 31 L16 20Z" fill="#c9483b"/><g fill="#e3a72f" stroke="#b9811a" stroke-width="0.8">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="16" cy="6.2" rx="2.6" ry="4.4" transform="rotate(${i * 30} 16 13)"/>`).join('')}</g><circle cx="16" cy="13" r="5.4" fill="#fbf6ea" stroke="#b9811a" stroke-width="1"/><text x="16" y="15.6" text-anchor="middle" font-family="Fraunces, serif" font-weight="900" font-size="7" fill="#9e3328">★</text></svg>`,
  rosetteGrey: `<svg viewBox="0 0 32 32" aria-hidden="true" opacity="0.35"><g fill="#8a8580">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="16" cy="6.2" rx="2.6" ry="4.4" transform="rotate(${i * 30} 16 13)"/>`).join('')}</g><circle cx="16" cy="13" r="5.4" fill="#d8d2c6"/></svg>`,
  camera: S('<rect x="3" y="7" width="18" height="12" rx="2.5"/><path d="M8 7 9.5 4.5h5L16 7"/><circle cx="12" cy="13" r="3.6"/><circle cx="17.6" cy="10" r="0.6" fill="currentColor"/>'),
  album: S('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>'),
  notice: S('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 9h6M7 12.5h9M7 16h5"/><circle cx="17.5" cy="8.5" r="1.2" fill="currentColor"/>'),
  map: S('<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/>'),
  ticket: S('<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3Z" transform="translate(0 -1)"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  train: S('<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/><path d="m8 20-2 2M16 20l2 2M8 16l-1 4h10l-1-4"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5 19.8 17M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/><circle cx="12" cy="12" r="7"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: S('<path d="M15 5 8 12l7 7"/>'),
  sound: S('<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  music: S('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  vibrate: S('<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8"/>'),
  lock: S('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/>'),
  check: S('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-8.6C1.6 8.3 3.6 4.5 7.2 4.5c2 0 3.6 1.2 4.8 3 1.2-1.8 2.8-3 4.8-3 3.6 0 5.6 3.8 4.2 6.9C19 15.6 12 20 12 20Z" fill="currentColor"/></svg>`,
  heartEmpty: S('<path d="M12 20s-7-4.4-9-8.6C1.6 8.3 3.6 4.5 7.2 4.5c2 0 3.6 1.2 4.8 3 1.2-1.8 2.8-3 4.8-3 3.6 0 5.6 3.8 4.2 6.9C19 15.6 12 20 12 20Z"/>'),
  sun: S('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  sunset: S('<path d="M5 17a7 7 0 0 1 14 0"/><path d="M2.5 17h19M4 21h16M12 5v3M5 8.5l2 2M19 8.5l-2 2"/>'),
  mist: S('<path d="M4 8h13M7 12h13M3 16h14M8 20h10"/>'),
  moon: S('<path d="M19 15.5A8 8 0 0 1 8.5 5a8 8 0 1 0 10.5 10.5Z"/><path d="M17 3.5v3M15.5 5h3"/>'),
  storm: S('<path d="M7 16a4.5 4.5 0 1 1 1.2-8.8A6 6 0 0 1 19.5 10 3.5 3.5 0 0 1 18 16.5"/><path d="m12 13-2 4h4l-2 4"/>'),
  brush: S('<path d="M14.5 4.5 19.5 9.5 11 18l-5-5Z"/><path d="m6 13-2.5 4.5 3 3L11 18"/><path d="m14.5 4.5 2-2 5 5-2 2"/>'),
  paint: S('<path d="M14.5 4.5 19.5 9.5 11 18l-5-5Z"/><path d="m6 13-2.5 4.5 3 3L11 18"/><path d="m14.5 4.5 2-2 5 5-2 2"/>'),
  window: S('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M5 12h14"/><path d="m15 6 2 2" stroke-width="1.4"/>'),
  lamp: S('<path d="M9 3h6l2 5H7Z"/><path d="M8 8v6a4 4 0 0 0 8 0V8"/><path d="M12 18v3M9 21h6"/>'),
  cobweb: S('<path d="M3 3l18 18M3 3v18M3 3h18M3 3l9 18M3 3l18 9"/><path d="M3 9c2-.5 4-2.5 5.5-5.5M3 15c4.5-1 9-5.5 11.5-12M3 21c7-1.5 15-8 18-18" stroke-width="1.2"/>'),
  broom: S('<path d="M19 3 12 11"/><path d="m12 11 3 3-4.5 6.5L4 14l4.5-4.5Z"/><path d="m6 16 3 3M8 13.5l3.5 3.5"/>'),
  // actions (what you do, never which object to look for)
  weed: S('<path d="M12 12v9M10 21h4"/><path d="M8.5 3v4a3.5 3.5 0 0 0 7 0V3M12 3v6.5"/>'),
  straighten: S('<rect x="5" y="10" width="11" height="8" rx="1" transform="rotate(-12 10.5 14)"/><path d="M7.5 6a8 8 0 0 1 11.5 3"/><path d="m19.6 5.6-.4 3.4-3.3-.8"/>'),
  standUp: S('<path d="M5 20.5h14"/><rect x="10.5" y="8" width="6" height="12.5" rx="1.5"/><path d="M4.5 14a8 8 0 0 1 4.5-7.5"/><path d="m6.2 5.3 3 1-.9 3"/>'),
  clean: S('<path d="M3.5 15.5c2-1.5 3.5-.5 5 0s3 1.5 5 0 3.5-1 7 0M3.5 19.5c2-1.5 3.5-.5 5 0s3 1.5 5 0 3.5-1 7 0"/><path d="M16.5 3v5M14 5.5h5M8 6.5v3M6.5 8h3"/>'),
  wateringCan: S('<path d="M4.5 10h9.5v8a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2Z"/><path d="M14 12.5 19 8.2M17.6 6.8l2.8 2.8"/><path d="M4.5 12.5H3.6a1.8 1.8 0 0 1 0-3.6h.9"/><path d="M19.8 13v.6M21 15.8v.6M18.4 16.8v.6"/>'),
  light: S('<path d="M12 21.5v-7"/><path d="M12 14.5c-2.4 0-4-1.7-4-4 0-3 4-7 4-7s4 4 4 7c0 2.3-1.6 4-4 4Z"/><path d="M12 12.2c-.8 0-1.4-.6-1.4-1.4 0-1 1.4-2.6 1.4-2.6s1.4 1.6 1.4 2.6c0 .8-.6 1.4-1.4 1.4Z"/>'),
  dust: S('<path d="M3.5 20.5 11 13"/><path d="M11 13c.5-4.5 4-8.5 9.5-9.5-1 5.5-5 9-9.5 9.5Z"/><path d="m13 11 3.5-3.5M14.8 12.6l2.4-2.4M11.4 9.2l2.4-2.4"/>'),
  shoo: S('<path d="M3 12.5c2.5-1 4.5-.2 6 1.8 1.6-3.2 4.8-5.3 9-5.3"/><path d="M9 14.3c.4-2.8-.2-5.4-2-7.3"/><path d="M13 17.5h8M15.5 20.5H21"/>'),
  gate: S('<path d="M4 20V5M20 20V5M4 8h16M4 16h16M8 8v8M12 8v8M16 8v8"/>'),
  path: S('<path d="M9 21c0-4 6-5 6-9s-5-4-5-9"/><path d="M4 21c1-5 6-6 6-10M20 21c-1-5-4-6-4-9" stroke-dasharray="2 2.5"/>'),
  bench: S('<path d="M3 11h18M4 15h16M5 11V6h14v5M6 15v5M18 15v5"/>'),
  duck: S('<path d="M5 14c0 3 3 5 7 5s8-2 8-6c-3 1-5 0-6-2 2-1 2-5-1-6s-5 1-5 4c0 1 .5 2 1 2.5C7 11.5 5 12 5 14Z"/><circle cx="11" cy="7" r=".7" fill="currentColor"/><path d="M7.5 7.5 5 8"/>'),
  water: S('<path d="M3 9c2-2 4 2 6 0s4 2 6 0 4 2 6 0M3 14c2-2 4 2 6 0s4 2 6 0 4 2 6 0M3 19c2-2 4 2 6 0s4 2 6 0 4 2 6 0"/>'),
  key: S('<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'),
  flowers: S('<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="7" r="2.5"/><path d="M8 10.5V21M16 9.5V21M8 16c-2.5 0-4-1.5-4-3.5M16 15c2.5 0 4-1.5 4-3.5"/>'),
  bunting: S('<path d="M2 5c6 4 14 4 20 0"/><path d="m5 7 1.5 5L9 8M11 8.5l1 5 2-5M17 7.5l-1 4.5-2.5-3.5"/>'),
  lights: S('<path d="M2 5c6 5 14 5 20 0"/><path d="M6 7.5v2M12 9v2M18 7.5v2"/><circle cx="6" cy="11" r="1.6"/><circle cx="12" cy="12.5" r="1.6"/><circle cx="18" cy="11" r="1.6"/>'),
  rose: S('<circle cx="12" cy="9" r="5"/><path d="M12 9c-1.5-1-1.5-3 0-3.5s3 1.5 1.5 3.5-4 1.5-4-1M12 14v7M12 17c-2.5 0-4-1-4.5-3M12 18.5c2 0 3.5-1 4-2.5"/>'),
  bee: S('<ellipse cx="12" cy="14" rx="4.5" ry="5.5"/><path d="M7.8 12h8.4M7.6 15.5h8.8"/><path d="M9 9C6 5 3 7 5 10M15 9c3-4 6-2 4 1M10.5 8.5 9.5 5.5M13.5 8.5l1-3"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>'),
  sparkle: S('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>'),
  flip: S('<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>'),
  eye: S('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  home: S('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  play: S('<path d="M7 5v14l12-7Z" fill="currentColor"/>'),
  pause: S('<path d="M8 5v14M16 5v14" stroke-width="3"/>'),
  scissors: S('<circle cx="6" cy="7" r="2.8"/><circle cx="6" cy="17" r="2.8"/><path d="m8.2 8.8 12.3 9M8.2 15.2 20.5 6.2"/>'),
};

export function icon(name, cls = '') { return svg(ICONS[name] || ICONS.info, cls); }

export const CONDITION_ICONS = { clear: 'sun', golden: 'sunset', mist: 'mist', dusk: 'moon', storm: 'storm' };
