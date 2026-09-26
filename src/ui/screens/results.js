// The payoff, scene first. The result is already saved (flows.commitPlay);
// this is presentation, and any tap moves it along:
//   1. the whole scene at its own shape, as it was this morning;
//   2. a wipe to how it is now, and the visit's permanent work arriving
//      live (fresh paint, flowers, bunting, a warmer light);
//   3. the shutter: the postcard's border forms around the picture;
//   4. a shallow rail: the resident's reaction, what improved, the
//      village's progress and one named next step. Details, the
//      before/after comparison and the map are secondary.
// Reduced motion swaps the wipe for a crossfade and drops the flash.

import { h, icon, wait } from '../dom.js';
import { postcardEl, beforeAfter, gradeStamp } from '../components/postcard.js';
import { goMap, playVisit, playWalk, judging, goNext } from '../flows.js';
import { nextStep, placeStatus, introCardsDue, levelInfo, introduced } from '../../core/progression.js';
import { celebrateEvent } from '../components/rewards.js';

const STAMP_WORDS = ['Snapped!', 'Lovely!', 'Picture Perfect!'];

export class RevealScreen {
  constructor(app, data) {
    this.app = app;
    this.d = data;
    this.usesCanvas = true;
    const { play } = data;
    this.story = play.mode === 'visit';
    this.visit = this.story ? app.content.visit(play.village, play.visit) : null;
    this.scene = app.content.scene(play.village, play.scene);
    this.skip = false;
    this.beforeEl = h('div.rv-before', data.before);
    this.edge = h('div.rv-edge');
    this.tagB = h('div.rv-tag.left.label', { text: 'Before' });
    this.tagA = h('div.rv-tag.right.label', { text: 'After' });
    this.stage = h('div.rv-stage', this.beforeEl, this.edge, this.tagB, this.tagA);
    this.flash = h('div.rv-flash');
    this.hintEl = h('div.rv-skip.label', { text: 'Tap to skip' });
    this.el = h('div.reveal', this.stage, this.flash, this.hintEl);
    this.el.addEventListener('pointerdown', () => { this.skip = true; }, { passive: true });
  }

  async enter() {
    this.app.audio.stopMusic();
    this.layout();
    this.run();
  }

  exit() { this.gone = true; clearTimeout(this.musicTimer); clearTimeout(this.restoreTimer); }

  resize() { this.layout(); if (this.card) this.placeCard(); }

  /** The scene at its natural shape: the whole picture, nothing cropped. */
  layout() {
    const app = this.app, view = app.view;
    const W = app.width, H = app.height;
    const sf = app.safe;
    const m = 8;
    const aw = W - sf.l - sf.r - 2 * m, ah = H - sf.t - sf.b - 2 * m;
    const ar = view.W / view.H;
    const w = Math.min(aw, ah * ar), hh = w / ar;
    const x = sf.l + m + (aw - w) / 2, y = sf.t + m + (ah - hh) / 2;
    this.rect = { x, y, w, h: hh };
    view.setView(x, y, w, hh);
    view.cam = { x: view.W / 2, y: view.H / 2, zoom: 1 };
    view.camTween = null;
    Object.assign(this.stage.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px` });
  }

  /** wait, or not at all once the player has tapped to skip */
  W(ms) { return (this.skip ? wait(0) : wait(ms)).then(() => { if (this.gone) throw new Error('left'); }); }

  /** The ceremony; it stops quietly if the player leaves before it ends. */
  run() { this.ceremony().catch((e) => { if (e.message !== 'left') throw e; }); }

  async ceremony() {
    const app = this.app, view = app.view, d = this.d;
    const reduced = app.reducedMotion;
    await this.W(450);
    app.sfx('page');
    // before -> after: a wipe (or, with reduced motion, a crossfade)
    const wipe = reduced ? 1100 : 1300;
    this.stage.classList.add(reduced ? 'fade' : 'wipe');
    this.stage.style.setProperty('--wipe', `${wipe}ms`);
    requestAnimationFrame(() => this.stage.classList.add('go'));
    // the visit's permanent work arrives as the wipe passes
    let change = null;
    this.restoreTimer = setTimeout(() => {
      if (!this.story || this.gone) return;
      change = view.playRestore(this.visit.effects, { fixed: d.receipt.after?.fixed || [], bloom: d.receipt.after?.bloom });
      if (change.appeared || change.removed || change.warmed) app.sfx('restore');
    }, this.skip ? 0 : wipe * 0.55);
    await this.W(wipe + 150);
    this.stage.classList.add('done');
    if (!this.skip) app.haptic('light');
    // hold on the restored place long enough to take it in
    await this.W(this.story && (change?.appeared || change?.removed) ? 1700 : 900);
    this.hintEl.remove();
    // the photograph
    app.sfx('shutter');
    app.haptic('heavy');
    if (!reduced) this.flash.classList.add('go');
    const photo = view.renderStill('after', Math.min(1600, Math.round(this.rect.w * app.dpr * 1.2)));
    await this.W(reduced ? 0 : 160);
    this.showPostcard(photo);
    this.musicTimer = setTimeout(() => app.audio.startMusic('map'), 900);
  }

  // ------------------------------------------------------------ postcard ---
  showPostcard(photo) {
    const app = this.app, d = this.d;
    const pc = postcardEl(app, { photo, sceneName: this.scene.name, condition: d.play.condition, compact: true });
    this.pc = pc;
    this.rail = this.buildRail();
    this.card = h('div.rv-card', pc);
    this.el.append(this.card, this.rail);
    this.stage.classList.add('printed');
    app.canvas.style.visibility = 'hidden';
    this.placeCard(true);
  }

  /** Where the postcard and the rail go: the rail beside the card on a wide
   *  phone, beneath it on a squarer tablet. */
  placeCard(first = false) {
    const app = this.app, W = app.width, H = app.height, sf = app.safe;
    const side = W / H > 1.7;
    this.el.classList.toggle('side', side);
    this.el.classList.toggle('below', !side);
    const m = 10, ar = this.app.view.W / this.app.view.H;
    const frame = { pad: 8, cap: 34 }; // postcard border and caption strip, px
    let box;
    if (side) {
      const railW = Math.max(220, Math.min(290, W * 0.31));
      const aw = W - sf.l - sf.r - railW - 3 * m, ah = H - sf.t - sf.b - 2 * m;
      const pw = Math.min(aw - 2 * frame.pad, (ah - 2 * frame.pad - frame.cap) * ar);
      box = { w: pw + 2 * frame.pad, h: pw / ar + 2 * frame.pad + frame.cap };
      box.x = sf.l + m + (aw - box.w) / 2;
      box.y = sf.t + m + (ah - box.h) / 2;
      Object.assign(this.rail.style, { left: `${sf.l + m + aw + m}px`, width: `${railW}px`, top: `${sf.t + m}px`, bottom: `${sf.b + m}px`, right: '' });
    } else {
      const railH = Math.min(250, Math.max(150, H * 0.3));
      const aw = Math.min(W - sf.l - sf.r - 2 * m, 1100), ah = H - sf.t - sf.b - railH - 3 * m;
      const pw = Math.min(aw - 2 * frame.pad, (ah - 2 * frame.pad - frame.cap) * ar);
      box = { w: pw + 2 * frame.pad, h: pw / ar + 2 * frame.pad + frame.cap };
      box.x = (W - box.w) / 2;
      box.y = sf.t + m + (ah - box.h) / 2;
      const rw = Math.min(W - sf.l - sf.r - 2 * m, 860);
      Object.assign(this.rail.style, { left: `${(W - rw) / 2}px`, width: `${rw}px`, top: '', bottom: `${sf.b + m}px`, height: `${railH}px`, right: '' });
    }
    Object.assign(this.card.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, '--pad': `${frame.pad}px`, '--cap': `${frame.cap}px` });
    this.pc.classList.toggle('narrow', box.w < 640);
    this.rail.classList.toggle('slim', side && parseFloat(this.rail.style.width) < 250);
    this.fitRail();
    if (!first) return;
    // the border forms around the picture: the card starts scaled so its photo
    // sits exactly where the scene was, then settles into place
    const k = this.rect.w / (box.w - 2 * frame.pad);
    const from = `translate(${this.rect.x - box.x - frame.pad * k}px, ${this.rect.y - box.y - frame.pad * k}px) scale(${k})`;
    const reduced = this.app.reducedMotion;
    const slide = side ? 'translateX(30px)' : 'translateY(30px)';
    this.card.style.transformOrigin = '0 0';
    if (reduced) {
      // a calm crossfade: nothing moves
      this.card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'backwards' });
      this.rail.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 700, fill: 'backwards' });
    } else {
      this.card.animate([{ transform: from }, { transform: from, offset: 0.25 }, { transform: 'none' }], { duration: 1100, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'backwards' });
      this.pc.classList.add('forming');
      this.rail.animate([{ opacity: 0, transform: slide }, { opacity: 0, transform: slide, offset: 0.55 }, { opacity: 1, transform: 'none' }], { duration: 1300, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'backwards' });
    }
    setTimeout(() => { if (!this.gone) this.afterPrint(); }, reduced ? 500 : 1300);
  }

  /** On a short screen, tighten the rail rather than cut anything off. */
  fitRail() {
    const body = this.rail.querySelector('.rv-body');
    const steps = ['tight', 'tighter', 'squeeze', 'bare', 'tightest'];
    this.rail.classList.remove(...steps);
    for (const step of steps) {
      if (body.scrollHeight <= body.clientHeight + 1) break;
      this.rail.classList.add(step);
    }
  }

  afterPrint() {
    const app = this.app, d = this.d;
    if (!d.receipt.saved) app.toast('This result couldn’t be saved on this device.', { ms: 4200, cls: 'warn' });
    if (!this.story && d.result.stamps && this.stampsRow) {
      [...this.stampsRow.children].forEach((el, i) => setTimeout(() => { el.classList.add('filled'); app.sfx('stamp'); }, 200 + i * 260));
      if (d.result.stamps === 3) setTimeout(() => app.audio.jingle(), 900);
    }
    if (this.milestone) this.milestone.classList.add('go');
    if (this.story && (d.receipt.events || []).some((e) => e.kind === 'placeRestored')) { app.sfx('rosette'); app.haptic('success'); }
  }

  // ---------------------------------------------------------------- rail ---
  buildRail() {
    const app = this.app, d = this.d, r = d.receipt;
    const next = nextStep(app.save, app.content, app.village);
    const primary = h('button.btn.big.teal.rv-next', { onclick: () => this.goOn(next) },
      h('span.rv-next-kicker', { text: next.kind === 'visit' ? 'Next' : next.kind === 'judging' ? 'The finale' : 'Carry on' }),
      h('span.rv-next-label', { text: next.kind === 'visit' ? next.label : next.kind === 'judging' ? 'Meet the judges' : 'Back to the map' }), icon('back', 'rv-arrow'));
    const secondary = h('div.rv-more',
      h('button.chip.rv-chip', { onclick: () => this.compare() }, icon('flip'), h('span', { text: 'Compare' })),
      !this.story && !d.play.daily ? h('button.chip.rv-chip', { onclick: () => this.again() }, icon('camera'), h('span', { text: 'Again' })) : null,
      h('button.chip.rv-chip', { onclick: () => this.details() }, icon('info'), h('span', { text: 'Details' })),
      next.kind === 'visit' ? h('button.chip.rv-chip', { onclick: () => { app.sfx('ui.tap'); goMap(app, { transition: 'iris', from: 'reveal', receipt: r }); } }, icon('map'), h('span', { text: 'Map' })) : null,
    );
    let body;
    if (this.story) {
      const who = app.v.villagers[this.visit.villager];
      const st = placeStatus(app.save, app.content, app.village, this.visit.scene);
      const justRestored = (r.events || []).some((e) => e.kind === 'placeRestored');
      this.milestone = h('div.rv-milestone', this.dots(r), h('div.rv-count', { text: `${r.restored} of ${r.total} restored` }));
      body = [
        h('div.rv-who.row', h('img.rv-portrait', { src: app.assets.spriteUrl(who.portrait, app.village, 0.4), alt: '' }),
          h('div', h('div.label.muted', { text: who.short }), h('div.rv-stage-line' + (justRestored ? '.restored' : ''), { text: justRestored ? `${this.scene.name} restored!` : `${this.scene.name}: ${st.stage || this.visit.stage || 'tidied'}` }))),
        h('p.rv-quote.hand', { text: `“${this.visit.reaction}”` }),
        h('div.rv-improved.row', icon('check'), h('span', { text: this.visit.improved })),
        this.milestone,
      ];
    } else {
      const cond = app.content.conditions[d.play.condition];
      this.stampsRow = h('div.rv-stamps', [1, 2, 3].map((n) => h('div.rv-stamp' + (n <= d.result.stamps ? '.earned' : ''), gradeStamp(n, STAMP_WORDS[n - 1]))));
      body = [
        h('div.label.muted', { text: d.play.daily ? 'Daily Postcard' : `${cond.name} postcard` }),
        this.stampsRow,
        h('div.rv-score.display', { text: `${d.result.score.toLocaleString('en-GB')} points` }),
      ];
    }
    // the milestone (or score) and any extras share one wrapping row
    const extras = this.extras();
    const last = body.pop();
    return h('div.rv-rail.card.paper', h('div.rv-body', ...body, h('div.rv-foot', last, extras)), h('div.rv-actions', primary, secondary));
  }

  /** One dot per place: full once restored, half once begun; the one just restored lands last. */
  dots(r) {
    const app = this.app, v = app.v;
    return h('div.rv-dots', v.sceneOrder.map((sid) => {
      const st = placeStatus(app.save, app.content, app.village, sid);
      const fresh = st.restored && (r.events || []).some((e) => e.kind === 'placeRestored' && e.scene === sid);
      return h('i' + (fresh ? '.new' : st.restored ? '.on' : st.done ? '.half' : ''), { title: v.scenes[sid].name });
    }));
  }

  /** Keepsakes, level-ups and other extras: small chips, never in the way of Next. */
  extras() {
    const app = this.app, r = this.d.receipt;
    const chips = [];
    const events = r.events || [];
    for (const ev of events) {
      if (ev.kind === 'collectible') chips.push(this.extraChip(h('img', { src: app.assets.spriteUrl(ev.item.sprite, app.village, 0.3), alt: '' }), ev.item.name, ev));
      // a newly opened place gets a chip unless the Next button already names it
      if (ev.kind === 'placeOpened' && nextStep(app.save, app.content, app.village).scene !== ev.scene) chips.push(this.extraChip(icon('map'), `New: ${app.content.scene(app.village, ev.scene).name}`, null));
      if (ev.kind === 'mastered') chips.push(this.extraChip(icon('rosette'), 'All five weathers!', ev));
      if (ev.kind === 'daily') chips.push(this.extraChip(icon('calendar'), `Stamp card: day ${ev.day}`, ev));
    }
    if (introduced(app.save, app.content, 'level')) for (const lu of r.levelUps || []) chips.push(this.extraChip(h('b', { text: String(lu.level) }), `Level ${lu.level}: ${lu.title}`, { kind: 'levelUp', ...lu }));
    for (const set of r.sets || []) if (set.items) chips.push(this.extraChip(icon('sparkle'), `${set.name} complete`, { kind: 'set', set }));
    return chips.length ? h('div.rv-extras', chips) : null;
  }

  extraChip(ico, text, ev) {
    const el = h('button.chip.rv-extra', { 'aria-label': text, title: text, onclick: () => { if (ev) { this.app.sfx('ui.tap'); celebrateEvent(this.app, ev); } } }, ico, h('span', { text }));
    if (!ev) el.disabled = true;
    return el;
  }

  goOn(next) {
    const app = this.app, r = this.d.receipt;
    app.sfx('ui.tap');
    if (next.kind === 'judging') return judging(app);
    if (next.kind !== 'visit') return goMap(app, { transition: 'iris', from: 'reveal', receipt: r });
    // a new place, or something new to show on the map, goes by way of the map
    const opened = (r.events || []).some((e) => e.kind === 'placeOpened');
    if (opened || introCardsDue(app.save, app.content).length) return goMap(app, { transition: 'iris', from: 'reveal', receipt: r, focus: next.scene, next: true });
    return goNext(app);
  }

  compare() {
    const app = this.app;
    app.sfx('ui.tap');
    if (this.ba) { this.ba.play(); return; }
    const before = this.d.before;
    const img = document.createElement('canvas');
    img.width = before.width; img.height = before.height;
    img.getContext('2d').drawImage(before, 0, 0);
    this.ba = beforeAfter(app, this.pc, img, { auto: true });
    this.ba.play();
  }

  details() {
    const app = this.app, d = this.d, r = d.result;
    app.sfx('ui.tap');
    const line = (label, val) => h('div.tally-line', h('span', { text: label }), h('span.dots'), h('span.tally-val', { text: String(val) }));
    const t = Math.round(r.time);
    const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    let rows;
    if (this.story) {
      rows = [
        line('Jobs done', r.faultCount),
        line('Time', time),
        line('Hints used', r.hints),
        r.cat ? line('Marmalade', 'Found!') : null,
        line('Experience', `+${d.receipt.xp || 0}`),
      ];
    } else {
      const b = r.breakdown;
      rows = [
        line('Tidying', b.fixPoints.toLocaleString('en-GB')),
        b.penalties ? line('Mis-taps', `−${b.penalties}`) : null,
        line(`Time bonus (${t}s, par ${r.par}s)`, b.timeBonus),
        b.noHint ? line('No hints used', b.noHint) : null,
        b.cat ? line('Found Marmalade', b.cat) : null,
        b.collectible ? line('Keepsake found', b.collectible) : null,
        h('div.tally-line.total', h('span.display', { text: 'Score' }), h('span.dots'), h('span.tally-val.display', { text: b.total.toLocaleString('en-GB') })),
      ];
    }
    const lvl = levelInfo(app.content, app.save.player.xp);
    app.sheet(h('div.details',
      h('div.display.sheet-title', { text: this.story ? this.visit.title : 'Photo walk' }),
      h('div.label.muted', { text: this.scene.name }),
      h('div.tally', rows),
      introduced(app.save, app.content, 'level') ? h('div.label.muted.details-level', { text: `Photographer level ${lvl.level} · ${lvl.into} / ${lvl.need} xp` }) : null,
    ));
  }

  again() {
    this.app.sfx('ui.tap');
    playWalk(this.app, this.d.play.scene);
  }
}
