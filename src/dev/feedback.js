// Playtest reports (development only, while DEV_TOOLS is on).
//
// A small bug button sits at the left edge of every screen. Tap it and:
//   1. the game pauses and a picture of the whole screen is taken at once
//      (the scene and every menu, card and dialog);
//   2. the tester taps the problem (or skips), and the game works out what is
//      there: the job, prop, region or button, in scene and screen terms;
//   3. a note box appears; the report is kept on the device (IndexedDB) with
//      the picture, the note and everything needed to reproduce it: screen,
//      place, visit and its progress, weather, camera, device, recent errors
//      and a copy of the save.
// Reports are sent from Settings -> Developer -> Playtest reports: each one
// opens a pre-filled GitHub issue ("[Playtest] ...") in FEEDBACK_REPO, which
// the developer reads there; the text can also be copied, the picture saved
// to attach to the issue, and everything downloaded as one file.

import { h } from '../ui/dom.js';
import { FEEDBACK_REPO } from './flags.js';
import { recentErrors } from './errors.js';
import { pointInPoly, shapeBounds } from '../core/geometry.js';
import { nextStep, placesRestored } from '../core/progression.js';

const KINDS = ['Art', 'Words', 'Bug', 'Idea'];
const BUG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7.5a4 4 0 0 1 8 0"/><rect x="7" y="7.5" width="10" height="11" rx="5"/><path d="M12 10v8.5M3.5 12H7M17 12h3.5M4.5 7.5 7.5 9.5M19.5 7.5l-3 2M4.5 17.5l3-2M19.5 17.5l-3-2M9.5 4.5 8.5 3M14.5 4.5l1-1.5"/></svg>';

// ------------------------------------------------------------ storage ---

const DB = 'postcard-perfect-dev';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('reports', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('reports', mode);
    const out = fn(t.objectStore('reports'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
export const reports = {
  all: async () => ((await tx('readonly', (s) => s.getAll())) || []).sort((a, b) => a.created - b.created),
  put: (r) => tx('readwrite', (s) => s.put(r)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
};

// -------------------------------------------------------- the button ---

export function installBugButton(app) {
  if (app.ui.querySelector('.dev-bug')) return;
  const btn = h('button.dev-bug', { 'aria-label': 'Report a problem', title: 'Report a problem', html: BUG_SVG });
  btn.addEventListener('click', (e) => { e.stopPropagation(); report(app); });
  app.ui.append(btn);
}

let busy = false;

/** The whole flow: picture, point, note, keep. */
export async function report(app) {
  if (busy) return;
  busy = true;
  const screen = app.screen;
  const wasPaused = screen?.paused;
  if (screen && 'paused' in screen) screen.paused = true;
  const restore = () => { if (screen && 'paused' in screen && app.screen === screen) screen.paused = wasPaused; busy = false; };
  try {
    app.sfx('shutter');
    const context = gather(app);
    const picture = await capture(app);
    const point = await askPoint(app);
    const pointed = point ? whatIsAt(app, point) : null;
    const image = picture ? await markPicture(picture, point, app) : null;
    const form = await askNote(app, { image, pointed });
    if (!form) return restore();
    const r = {
      id: `r${Date.now().toString(36)}`, created: Date.now(), kind: form.kind, note: form.note,
      point, pointed, context, image, save: JSON.stringify(app.save), sent: null,
    };
    await reports.put(r);
    const waiting = (await reports.all()).filter((x) => !x.sent).length;
    if (form.send) sendToGitHub([r]);
    else app.toast(`Report saved. ${waiting} waiting to send (Settings → Developer).`, { ms: 3200 });
  } catch (err) {
    console.error('playtest report failed', err);
    app.toast('Sorry, that report couldn’t be saved.', { ms: 3000, cls: 'warn' });
  }
  restore();
}

// --------------------------------------------------------- the picture ---

let fontCSS = null;
/** The game's own fonts as data URLs, made once, so the picture uses them. */
async function embeddedFonts() {
  if (fontCSS != null) return fontCSS;
  try {
    const base = new URL('styles/fonts.css', document.baseURI);
    let css = await (await fetch(base)).text();
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
    for (const u of urls) {
      const blob = await (await fetch(new URL(u, base))).blob();
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      css = css.replace(u, data);
    }
    fontCSS = css;
  } catch { fontCSS = ''; }
  return fontCSS;
}

/** The whole stage (canvas and every overlay) as a JPEG data URL; the scene alone if that fails. */
async function capture(app) {
  const w = app.width, hgt = app.height;
  const ratio = Math.min(2, 1400 / w);
  // the paper grain is an SVG filter the picture-maker can't follow (it turns
  // the panels black), so it is left out of the picture
  app.root.style.setProperty('--grain', 'none');
  app.root.style.setProperty('--fibres', 'none');
  try {
    const { toJpeg } = await import('./vendor/html-to-image.js');
    return await toJpeg(app.root, {
      quality: 0.82, pixelRatio: ratio, width: w, height: hgt, backgroundColor: '#22302c',
      style: { transform: 'none', left: '0', top: '0', margin: '0' },
      filter: (n) => !(n.classList && (n.classList.contains('dev-bug') || n.classList.contains('dev-report'))),
      fontEmbedCSS: await embeddedFonts(),
    });
  } catch (err) {
    console.warn('full-screen picture failed; keeping the scene only', err);
    try { return app.canvas.toDataURL('image/jpeg', 0.8); } catch { return null; }
  } finally {
    app.root.style.removeProperty('--grain');
    app.root.style.removeProperty('--fibres');
  }
}

/** Circle the spot the tester tapped. */
function markPicture(url, point, app) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      if (point) {
        const x = (point.x / app.width) * c.width, y = (point.y / app.height) * c.height, r = c.width * 0.028;
        g.lineWidth = Math.max(3, c.width * 0.004);
        g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r + g.lineWidth, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#e0245e'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      }
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => res(url);
    img.src = url;
  });
}

// ---------------------------------------------------------- pointing ---

function askPoint(app) {
  return new Promise((res) => {
    const skip = h('button.btn.small.teal', { text: 'Skip' });
    const bar = h('div.dev-mark-bar.card', h('span', { text: 'Tap the problem' }), skip);
    const layer = h('div.dev-report.dev-mark', bar);
    const done = (v) => { layer.remove(); res(v); };
    skip.addEventListener('click', (e) => { e.stopPropagation(); done(null); });
    layer.addEventListener('pointerdown', (e) => {
      if (bar.contains(e.target)) return;
      e.preventDefault();
      const [x, y] = app.toLocal(e.clientX, e.clientY);
      done({ x: Math.round(x), y: Math.round(y), cx: e.clientX, cy: e.clientY });
    });
    app.ui.append(layer);
  });
}

/** What is at a point: a job, a prop, a region, the cat, or a piece of interface. */
export function whatIsAt(app, pt) {
  const out = {};
  const s = app.screen, view = app.view;
  // interface first: whatever element sits there, other than the scene
  // (a real control or card, not a full-screen layer the scene shows through)
  const stage = app.width * app.height;
  const els = document.elementsFromPoint(pt.cx, pt.cy).filter((el) => !el.closest('.dev-report, .dev-bug'));
  const el = els.find((e) => {
    if (['scene', 'app', 'ui'].includes(e.id) || e.classList.contains('overlay')) return false;
    if (getComputedStyle(e).pointerEvents === 'none') return false;
    return e.offsetWidth * e.offsetHeight < stage * 0.5;
  });
  if (el) out.ui = describe(el);
  if (s?.usesCanvas && view?.ready && view.scene) {
    const [wx, wy] = view.screenToWorld(pt.x, pt.y);
    out.scene = { id: view.scene.id, x: Math.round(wx), y: Math.round(wy), zoom: Math.round(view.cam.zoom * 100) / 100 };
    const near = (b, pad = 12) => wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad;
    const left = s.session ? s.session.remaining : null;
    const faults = (view.faults || []).filter((f) => f.shape && near(shapeBounds(f.shape)))
      .sort((a, b) => shapeBounds(a.shape).w * shapeBounds(a.shape).h - shapeBounds(b.shape).w * shapeBounds(b.shape).h);
    if (faults[0]) {
      const f = faults[0];
      out.job = { id: f.id, type: f.type, task: f.task || null, target: f.region || f.prop || f.lamp || null, sprite: f.sprite || null, item: f.item || null, done: left ? !left.has(f.id) : null };
    }
    const props = (view.props || []).filter((p) => { const g = p.geom; return near({ x: g.cx - g.w / 2, y: g.cy - g.h / 2, w: g.w, h: g.h }, 0); })
      .sort((a, b) => a.geom.w * a.geom.h - b.geom.w * b.geom.h);
    if (props[0]) out.prop = { id: props[0].id, sprite: props[0].sprite, h: props[0].h, tags: props[0].tags || [] };
    const region = (view.scene.regions || []).find((r) => pointInPoly(wx, wy, r.poly));
    if (region) out.region = { id: region.id, tags: region.tags };
    const cat = view.cat;
    if (cat && Math.hypot(cat.x - wx, cat.y - wy) < 60) out.cat = true;
  }
  return out;
}

function describe(el) {
  const labelled = el.closest('[aria-label]');
  const withText = [el, ...ancestors(el)].find((e) => (e.textContent || '').trim());
  const cls = [el.tagName.toLowerCase(), ...[...el.classList].slice(0, 3)].join('.');
  const card = el.closest('.sheet, .modal, .brief, .job-card, .rv-rail, .pin, .next-ribbon, .action-bar, .feature-cue, .card');
  return {
    element: cls,
    in: card ? [card.tagName.toLowerCase(), ...[...card.classList].slice(0, 3)].join('.') : null,
    label: labelled?.getAttribute('aria-label') || null,
    text: withText ? withText.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) : null,
  };
}
function* ancestors(el) { for (let n = el.parentElement; n && n.id !== 'ui'; n = n.parentElement) yield n; }

// ----------------------------------------------------------- context ---

function gather(app) {
  const s = app.screen, save = app.save, vid = app.village;
  const vs = save?.villages?.[vid];
  const play = s?.play;
  const openCards = [...app.ui.querySelectorAll('.sheet .sheet-title, .modal .celebrate-title, .brief .brief-text, .job-card .job-name')]
    .map((e) => e.textContent.trim().slice(0, 80));
  let next = null, restored = null;
  try { next = nextStep(save, app.content, vid).label; restored = placesRestored(save, app.content, vid); } catch { /* not ready */ }
  return {
    time: new Date().toISOString(), page: location.href, pageDate: document.lastModified, ua: navigator.userAgent,
    viewport: { w: app.width, h: app.height, window: [innerWidth, innerHeight], dpr: devicePixelRatio, rotated: app.rotated, safe: app.safe },
    screen: s?.constructor?.name || null, open: openCards,
    play: play ? {
      mode: play.mode, scene: play.scene, visit: play.visit || null, tier: play.tier ?? null, condition: play.condition, seed: play.seed,
      daily: play.daily || null, done: s.session ? [...s.session.fixed] : [], left: s.session?.left ?? null, t: s.session ? Math.round(s.session.t) : null,
    } : null,
    camera: s?.usesCanvas && app.view?.ready ? { x: Math.round(app.view.cam.x), y: Math.round(app.view.cam.y), zoom: Math.round(app.view.cam.zoom * 100) / 100 } : null,
    story: vs ? { visitsDone: Object.keys(vs.visits), next, restored: restored ? `${restored.done}/${restored.total}` : null, judged: !!vs.judged } : null,
    player: save ? { plays: save.player.plays, created: save.created, testVillage: !!save.flags?.devVillage } : null,
    settings: save ? { ...save.settings, reducedMotion: app.reducedMotion } : null,
    errors: recentErrors.slice(-8),
  };
}

// -------------------------------------------------------------- note ---

function askNote(app, { image, pointed }) {
  return new Promise((res) => {
    let kind = null;
    const chips = KINDS.map((k) => {
      const b = h('button.chip.dev-kind', { text: k, type: 'button' });
      b.addEventListener('click', () => { kind = kind === k ? null : k; chips.forEach((c) => c.classList.toggle('on', c.textContent === kind)); });
      return b;
    });
    const text = h('textarea.dev-note-input', { rows: '3', placeholder: 'What’s wrong, or what would be better?', 'aria-label': 'Your note' });
    const save = h('button.btn.teal.small', { text: 'Save' });
    const send = h('button.btn.small', { text: 'Save and send' });
    const cancel = h('button.chip', { text: 'Cancel' });
    const form = h('div.dev-report.dev-form-wrap',
      h('div.dev-form.card.paper',
        h('div.dev-form-head',
          image ? h('img.dev-thumb', { src: image, alt: 'Picture of the screen' }) : h('div.dev-thumb.none', { text: 'No picture' }),
          h('div.dev-form-side',
            h('div.display.dev-form-title', { text: 'Report a problem' }),
            h('div.dev-pointed', { text: pointed ? `You pointed at: ${pointedText(pointed)}` : 'No spot marked.' }),
            h('div.dev-kinds', chips))),
        text,
        h('div.dev-form-foot', cancel, h('div.grow'), send, save)));
    const done = (v) => { form.remove(); res(v); };
    cancel.addEventListener('click', () => done(null));
    const go = (sendNow) => {
      const note = text.value.trim();
      if (!note && !pointed) { text.focus(); return; }
      done({ note, kind, send: sendNow });
    };
    save.addEventListener('click', () => go(false));
    send.addEventListener('click', () => go(true));
    app.ui.append(form);
    setTimeout(() => text.focus(), 50);
  });
}

export function pointedText(p) {
  if (!p) return 'nothing marked';
  const bits = [];
  if (p.job) bits.push(`the ${p.job.type} job “${p.job.id}”${p.job.done ? ' (already done)' : ''}`);
  if (p.prop && p.prop.id !== p.job?.target) bits.push(`the ${p.prop.sprite.replace(/^.*\//, '')} “${p.prop.id}”`);
  if (p.region && p.region.id !== p.job?.target) bits.push(`the ${p.region.tags[0] || 'area'} “${p.region.id}”`);
  if (p.cat) bits.push('Marmalade');
  if (p.ui) bits.push(p.ui.label ? `the “${p.ui.label}” button` : p.ui.text ? `“${p.ui.text.slice(0, 50)}”` : p.ui.element);
  if (!bits.length && p.scene) bits.push(`the scene at ${p.scene.x}, ${p.scene.y}`);
  return bits.join(', ') || 'nothing in particular';
}

// ------------------------------------------------------------ sending ---

function where(r) {
  const c = r.context, p = c.play;
  const bits = [c.screen];
  if (p) bits.push(p.visit ? `visit ${p.visit}` : `${p.daily ? 'daily' : 'photo walk'} tier ${p.tier}`, p.scene, p.condition);
  else if (r.pointed?.scene) bits.push(r.pointed.scene.id);
  return bits.filter(Boolean).join(' · ');
}

/** A report as Markdown (for an issue, or to paste anywhere). */
export function reportText(r, { details = true } = {}) {
  const c = r.context;
  const lines = [
    `**${r.kind || 'Note'}:** ${r.note || '(no note)'}`,
    '',
    `- **Where:** ${where(r)}`,
    `- **Pointed at:** ${pointedText(r.pointed)}${r.pointed?.scene ? ` (scene ${r.pointed.scene.x}, ${r.pointed.scene.y})` : ''}${r.point ? ` · screen ${r.point.x}, ${r.point.y}` : ''}`,
    `- **Device:** ${c.viewport.w}×${c.viewport.h}${c.viewport.rotated ? ' (turned from portrait)' : ''}, dpr ${c.viewport.dpr} · ${shortUA(c.ua)}`,
    `- **When:** ${c.time} · page updated ${c.pageDate}`,
  ];
  if (c.errors?.length) lines.push(`- **Errors:** ${c.errors.map((e) => e.detail.split('\n')[0]).slice(-3).join(' | ')}`);
  if (details) {
    const repro = { pointed: r.pointed, point: r.point, screen: c.screen, open: c.open, play: c.play, camera: c.camera, story: c.story, player: c.player, settings: c.settings, viewport: c.viewport };
    lines.push('', '<details><summary>Details to reproduce</summary>', '', '```json', JSON.stringify(repro), '```', '</details>');
  }
  return lines.join('\n');
}

function shortUA(ua) {
  const m = ua.match(/(iPhone|iPad|Android|Macintosh|Windows|Linux)/);
  const b = ua.match(/(Edg|Chrome|CriOS|Firefox|FxiOS|Version)\/[\d.]+/);
  return [m?.[1], b ? b[0].replace('Version', 'Safari') : null].filter(Boolean).join(' ');
}

const ISSUE_URL_MAX = 7500;

/** Open a pre-filled GitHub issue for one report (or a batch in one issue). */
export function sendToGitHub(list) {
  const one = list.length === 1;
  const r0 = list[0];
  const title = one ? `[Playtest] ${r0.kind ? `${r0.kind}: ` : ''}${(r0.note || pointedText(r0.pointed)).split('\n')[0].slice(0, 70)}` : `[Playtest] ${list.length} reports`;
  const tail = '\n\n_Picture: attach it here if it helps (Settings → Developer → Playtest reports → Picture)._\n\n_Filed from the game’s playtest reporter._';
  const build = (details) => (one ? reportText(r0, { details }) : list.map((r, i) => `### ${i + 1}. ${r.kind || 'Note'}\n\n${reportText(r, { details })}`).join('\n\n---\n\n')) + tail;
  let body = build(true);
  let url = `https://github.com/${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  if (url.length > ISSUE_URL_MAX) {
    body = build(false);
    url = `https://github.com/${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body).slice(0, ISSUE_URL_MAX - 200)}`;
  }
  window.open(url, '_blank', 'noopener');
  const now = Date.now();
  for (const r of list) { r.sent = now; reports.put(r); }
  return url;
}

export async function copyText(list, app) {
  const text = list.map((r) => reportText(r)).join('\n\n---\n\n');
  try { await navigator.clipboard.writeText(text); app.toast('Copied. Paste it wherever you like.'); return true; } catch { app.toast('Couldn’t copy on this device.', { cls: 'warn' }); return false; }
}

function dataToFile(url, name) {
  const [head, b64] = url.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: head.match(/data:([^;]+)/)[1] });
}

function download(file) {
  const a = h('a', { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Save or share a report's picture (to attach to its issue). */
export async function sharePicture(r) {
  if (!r.image) return;
  const file = dataToFile(r.image, `playtest-${r.id}.jpg`);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Playtest picture' }); return; } catch { /* cancelled: fall through to a download */ }
  }
  download(file);
}

/** Everything (pictures and saves included) as one file. */
export async function downloadAll(list) {
  const file = new File([JSON.stringify({ exported: new Date().toISOString(), reports: list }, null, 1)], `playtest-reports-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  download(file);
}

// -------------------------------------------------------- the list ---

/** Settings -> Developer -> Playtest reports. */
export async function openReports(app, { onClose } = {}) {
  const list = await reports.all();
  const body = h('div.dev-reports');
  const render = async () => {
    const all = await reports.all();
    body.innerHTML = '';
    const waiting = all.filter((r) => !r.sent);
    body.append(
      h('div.dev-reports-head',
        h('span', { text: all.length ? `${waiting.length} waiting · ${all.length - waiting.length} sent` : 'No reports yet. Tap the bug at the left edge of any screen.' }),
        waiting.length > 1 ? h('button.btn.teal.small', { onclick: () => { sendToGitHub(waiting); render(); } }, h('span', { text: `Send ${waiting.length} as one issue` })) : null,
        all.length ? h('button.chip', { onclick: () => copyText(waiting.length ? waiting : all, app) }, h('span', { text: 'Copy text' })) : null,
        all.length ? h('button.chip', { onclick: () => downloadAll(all) }, h('span', { text: 'Download all' })) : null,
        all.some((r) => r.sent) ? h('button.chip', { onclick: async () => { for (const r of all.filter((x) => x.sent)) await reports.remove(r.id); render(); } }, h('span', { text: 'Clear sent' })) : null,
      ),
      ...[...all].reverse().map((r) => h('div.dev-report-row' + (r.sent ? '.sent' : ''),
        r.image ? h('img.dev-row-thumb', { src: r.image, alt: '' }) : h('div.dev-row-thumb.none'),
        h('div.dev-row-body',
          h('div.dev-row-note', { text: `${r.kind ? `${r.kind}: ` : ''}${r.note || '(no note)'}` }),
          h('div.label.muted', { text: `${new Date(r.created).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })} · ${where(r)}${r.sent ? ' · sent' : ''}` }),
          h('div.dev-row-btns',
            h('button.chip', { onclick: () => { sendToGitHub([r]); render(); } }, h('span', { text: r.sent ? 'Send again' : 'Send to GitHub' })),
            r.image ? h('button.chip', { onclick: () => sharePicture(r) }, h('span', { text: 'Picture' })) : null,
            h('button.chip', { onclick: () => copyText([r], app) }, h('span', { text: 'Copy' })),
            h('button.chip', { onclick: async () => { await reports.remove(r.id); render(); } }, h('span', { text: 'Delete' }))),
        ))),
      h('p.dev-note', { text: 'Send to GitHub opens a filled-in issue: check it and press “Create”. To add the picture, tap Picture first and attach it to the issue.' }),
    );
  };
  await render();
  app.sheet(h('div.settings.dev-tools', h('div.display.sheet-title', { text: `Playtest reports${list.length ? ` (${list.length})` : ''}` }), body), { cls: 'dev-sheet', onClose });
}

