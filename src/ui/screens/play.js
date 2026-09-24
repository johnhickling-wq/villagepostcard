// The tidy-up: canvas scene + HUD. Taps go to the PlaySession (rules) and the
// SceneView (animation); the HUD shows what's left, the combo and hints.

import { h, icon, svg, ICONS, wait, CONDITION_ICONS } from '../dom.js';
import { PlaySession } from '../../core/session.js';
import { Gestures } from '../../engine/input.js';
import { finishPlay, leavePlay } from '../flows.js';

const FAULT_ICON = { faded: 'paint', grimy: 'window', unlit: 'lamp', cobweb: 'cobweb' };

export class PlayScreen {
  constructor(app, play, mess) {
    this.app = app;
    this.play = play;
    this.mess = mess;
    this.usesCanvas = true;
    this.session = new PlaySession(app.content, mess, play, { flashbulbs: app.save.player.flashbulbs });
    this.content = app.content;
    this.scene = app.content.scene(play.village, play.scene);
    this.tutorial = play.tutorial ? { step: 0, idle: 0 } : null;
    this.finishing = false;
    this.build();
  }

  build() {
    const app = this.app, c = this.content;
    const tier = c.tier(this.play.tier);
    const cond = c.conditions[this.play.condition];
    this.scoreEl = h('span.hud-score-num', { text: '0' });
    this.timeEl = h('span.hud-time', { text: '0:00' });
    this.leftEl = h('span.hud-left-num.display', { text: String(this.mess.faults.length) });
    this.countRing = h('div.count-ring', h('div.hud-bee', svg(ICONS.bee)));
    this.comboEl = h('div.hud-combo.hidden', h('span.hud-combo-x', { text: '×1.2' }), h('i.hud-combo-bar', h('b')));
    this.callout = h('div.hud-callout.display');
    this.tray = h('div.tray-chips');
    this.loupeRing = h('div.loupe-ring');
    this.loupeBtn = h('button.tool.loupe', { 'aria-label': 'Loupe hint', onclick: () => this.useLoupe() },
      this.loupeRing, h('img', { src: app.assets.spriteUrl('ui/magnifier', 'common', 0.5), alt: '' }));
    this.flashCount = h('span.badge', { text: String(app.save.player.flashbulbs) });
    this.flashBtn = h('button.tool.flash', { 'aria-label': 'Flashbulb', onclick: () => this.useFlash() },
      h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.5), alt: '' }), this.flashCount);
    this.shaky = h('div.hud-shaky.hidden', h('div.display', { text: 'Shaky hands!' }), h('div.hand', { text: 'Steady on… tap with care.' }));
    this.coach = h('div.coach.hidden', h('div.coach-text.hand'));
    this.finger = h('div.finger.hidden', svg('<svg viewBox="0 0 48 48"><path d="M20 44c-4-3-9-9-11-13-1-2 1-4 3-3l4 3V8a3 3 0 0 1 6 0v14l1-1a3 3 0 0 1 5 1 3 3 0 0 1 5 1 3 3 0 0 1 5 2v9c0 5-3 9-6 11Z" fill="#fffdf7" stroke="#2c2a35" stroke-width="2.4" stroke-linejoin="round"/></svg>'));
    this.viewfinder = h('div.viewfinder.hidden', h('i.vf.tl'), h('i.vf.tr'), h('i.vf.bl'), h('i.vf.br'), h('div.vf-center'), h('div.vf-text.typed', { text: 'Hold still…' }));
    this.flashOverlay = h('div.white-flash');
    this.zoomReset = h('button.zoom-reset.chip.hidden', { onclick: () => { this.app.sfx('ui.tap'); const v = this.app.view; v.focus(v.W / 2, v.H / 2, 1, 0.4); } }, icon('eye'), h('span', { text: 'Whole scene' }));
    // the caption tab taped to the top of the print
    this.tab = h('div.hud-tab.card.paper',
      h('div.script.hud-scene', { text: this.scene.name }),
      h('div.hud-sub.row',
        h('span.hud-cond', icon(CONDITION_ICONS[this.play.condition]), h('span', { text: cond.name })),
        h('span.dot', { text: '·' }),
        h('span', { text: this.play.daily ? 'Daily Postcard' : tier.name }),
      ),
    );
    const left = h('div.rail.rail-left',
      h('button.iconbtn.hud-pause', { 'aria-label': 'Pause', onclick: () => this.pause() }, icon('pause')),
      h('div.hud-score.chip', icon('camera'), this.scoreEl),
      h('div.hud-clock.label', icon('clock'), this.timeEl),
      this.comboEl,
      h('div.grow'),
      this.loupeBtn,
    );
    const right = h('div.rail.rail-right',
      h('div.hud-count', this.countRing, h('div.hud-count-text', this.leftEl, h('span.label', { text: 'to tidy' }))),
      h('div.tray.card', this.tray),
      h('div.grow'),
      this.flashBtn,
    );
    this.corners = ['tl', 'tr', 'bl', 'br'].map((k) => h(`div.photo-corner.${k}`));
    this.el = h('div.play.passthrough', ...this.corners, left, right, this.tab, this.callout, this.shaky, this.coach, this.finger, this.viewfinder, this.flashOverlay, this.zoomReset);
    this.renderTray();
  }

  async enter() {
    const app = this.app;
    await app.view.load({ village: this.play.village, scene: this.play.scene, mess: this.mess, projects: this.play.projects });
    this.layout();
    this.gestures = new Gestures(app.canvas, {
      onTap: (x, y) => this.tap(x, y),
      onPan: (dx, dy) => app.view.pan(dx, dy),
      onPinch: (f, cx, cy, dx, dy) => { app.view.zoomAt(f, cx, cy); app.view.pan(dx, dy); },
    });
    app.audio.startMusic('play');
    const amb = [...(this.scene.ambience || [])];
    if (this.play.condition === 'dusk') amb.push('crickets');
    if (this.play.condition === 'storm') amb.push('drips', 'breeze');
    app.audio.startAmbience(this.play.condition === 'mist' ? amb.filter((a) => a !== 'birds') : amb);
    // the caption tab slides up out of the way once you've read it
    setTimeout(() => this.tab.classList.add('tucked'), this.tutorial ? 2500 : 3200);
    if (this.tutorial) setTimeout(() => this.tutorialStep(), 900);
  }

  exit() {
    this.gestures?.destroy();
    this.app.audio.stopAmbience();
  }

  resize() { this.layout(); }

  /** The print sits between the two rails and uses the full height. */
  layout() {
    const r = this.app.root.getBoundingClientRect();
    const lr = this.el.querySelector('.rail-left')?.getBoundingClientRect();
    const rr = this.el.querySelector('.rail-right')?.getBoundingClientRect();
    const safeT = this.app.safe.t, safeB = this.app.safe.b;
    const x0 = lr ? lr.right + 6 : 110;
    const x1 = rr ? rr.left - 6 : r.width - 110;
    const y0 = safeT + 8, y1 = r.height - safeB - 8;
    const view = this.app.view;
    view.setView(x0, y0, Math.max(200, x1 - x0), Math.max(160, y1 - y0));
    if (!view.ready) return;
    const s = view.fit;
    const w = view.W * s, hgt = view.H * s;
    const px = view.view.x + (view.view.w - w) / 2, py = view.view.y + (view.view.h - hgt) / 2;
    this.print = { x: px, y: py, w, h: hgt };
    // little black photo corners hold the print on the page
    const pos = { tl: [px - 6, py - 6], tr: [px + w - 20, py - 6], bl: [px - 6, py + hgt - 20], br: [px + w - 20, py + hgt - 20] };
    for (const c of this.corners) { const k = c.classList[1]; c.style.left = `${pos[k][0]}px`; c.style.top = `${pos[k][1]}px`; }
    const place = (el, css) => Object.assign(el.style, css);
    place(this.tab, { left: `${px + w / 2}px`, top: `${py}px` });
    place(this.viewfinder, { left: `${px + 14}px`, top: `${py + 14}px`, width: `${w - 28}px`, height: `${hgt - 28}px` });
    place(this.zoomReset, { left: `${px + w / 2}px`, top: `${py + hgt - 52}px` });
    place(this.callout, { left: `${px}px`, width: `${w}px`, top: `${py + hgt * 0.3}px` });
    place(this.coach, { left: `${px + 16}px`, width: `${w - 32}px`, top: `${py + 12}px` });
    place(this.shaky, { left: `${px}px`, top: `${py}px`, width: `${w}px`, height: `${hgt}px` });
  }

  // --------------------------------------------------------------- tray ---
  renderTray() {
    const app = this.app;
    const types = this.session.remainingByType();
    this.tray.innerHTML = '';
    this.tray.classList.toggle('compact', Object.keys(types).length > 5);
    this.chips = {};
    for (const [type, n] of Object.entries(types)) {
      const f = this.content.faults[type];
      const ico = FAULT_ICON[type] ? icon(FAULT_ICON[type]) : h('img', { src: app.assets.spriteUrl(f.icon, 'common', 0.35), alt: '' });
      const count = h('span.chip-count', { text: String(n.left) });
      const chip = h('div.tray-chip', { title: f.verb }, h('div.chip-ico', ico), count, h('div.chip-label', { text: f.label }));
      if (!n.left) chip.classList.add('done');
      this.chips[type] = { chip, count };
      this.tray.append(chip);
    }
  }

  bumpChip(type, left) {
    const c = this.chips[type];
    if (!c) return;
    c.count.textContent = String(left);
    c.chip.classList.remove('bump');
    void c.chip.offsetWidth;
    c.chip.classList.add('bump');
    if (!left) {
      c.chip.classList.add('done');
      this.app.sfx('stamp');
    }
  }

  // ------------------------------------------------------------- update ---
  update(dt) {
    if (this.paused) return;
    const s = this.session;
    const events = this.finishing ? [] : s.update(dt);
    for (const ev of events) {
      if (ev.kind === 'nudge') { this.app.view.showNudge(ev.fault); this.app.sfx('nudge'); }
      if (ev.kind === 'comboEnd') this.comboEl.classList.add('hidden');
    }
    const t = Math.floor(s.t);
    this.timeEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.timeEl.classList.toggle('over', s.t > this.mess.par);
    // loupe recharge ring
    const k = s.loupeProgress;
    this.loupeRing.style.setProperty('--k', k);
    this.loupeBtn.classList.toggle('ready', s.loupeReady && !this.finishing);
    // combo timer
    if (s.chain > 1) {
      const rem = Math.max(0, 1 - (s.t - s.lastFix) / s.comboWindow);
      this.comboEl.querySelector('b').style.width = `${rem * 100}%`;
    }
    this.shaky.classList.toggle('hidden', !s.locked);
    this.zoomReset.classList.toggle('hidden', this.app.view.cam.zoom < 1.05 || this.finishing);
    if (this.tutorial) this.updateTutorial(dt);
  }

  // --------------------------------------------------------------- taps ---
  tap(sx, sy) {
    if (this.finishing || this.paused) return;
    const now = performance.now();
    const dbl = this.lastTap && now - this.lastTap.t < 320 && Math.hypot(sx - this.lastTap.x, sy - this.lastTap.y) < 30 && this.lastTap.miss;
    this.lastTap = { t: now, x: sx, y: sy, miss: false };
    if (dbl) {
      // double-tap on empty scenery zooms in/out instead of counting as another mis-tap
      const v = this.app.view;
      const [wx, wy] = v.screenToWorld(sx, sy);
      v.focus(wx, wy, v.cam.zoom > 1.3 ? 1 : 2, 0.35);
      this.lastTap = null;
      return;
    }
    const app = this.app, view = app.view, s = this.session;
    const [wx, wy] = view.screenToWorld(sx, sy);
    const tol = this.content.scoring.tapTolerancePx / view.scale;
    const ev = s.tap(wx, wy, tol);
    if (this.tutorial) this.tutorial.idle = 0;
    switch (ev.kind) {
      case 'fix': return this.onFix(ev, sx, sy);
      case 'cat':
        view.catFound();
        view.popup(ev.cat.cx, ev.cat.y - ev.cat.h, `Marmalade! +${ev.points}`, { color: '#c0602a', size: 28 });
        app.sfx('cat');
        app.haptic('success');
        view.tapRipple(sx, sy, true);
        this.scoreBump();
        if (!app.save.flags.seen.cat) { app.save.flags.seen.cat = true; app.toast([h('img', { src: app.assets.spriteUrl('critters/cat-sit', 'common', 0.3) }), 'You found Marmalade, the village cat! She hides in every scene.'], { ms: 3600 }); }
        return;
      case 'collectible': {
        const target = this.el.querySelector('.hud-score').getBoundingClientRect();
        view.collectibleFound([target.left + target.width / 2, target.top + target.height / 2]);
        view.popup(ev.collectible.cx, ev.collectible.cy - 30, `${ev.collectible.name}!`, { color: '#2f4f86', size: 26 });
        app.sfx('collect');
        app.haptic('success');
        this.scoreBump();
        return;
      }
      case 'miss':
        if (this.lastTap) this.lastTap.miss = true;
        view.tapRipple(sx, sy, false);
        app.sfx('miss');
        app.haptic('select');
        if (ev.brokeChain > 1) this.comboEl.classList.add('hidden');
        this.scoreEl.textContent = s.score.toLocaleString('en-GB');
        return;
      case 'shaky':
        view.tapRipple(sx, sy, false);
        view.shakeScreen(14);
        app.sfx('shaky');
        app.haptic('warning');
        this.comboEl.classList.add('hidden');
        return;
      case 'locked':
        view.shakeScreen(4);
        return;
    }
  }

  onFix(ev, sx, sy) {
    const app = this.app, view = app.view, f = ev.fault;
    const ft = this.content.faults[f.type];
    view.fix(f);
    view.tapRipple(sx, sy, true);
    app.sfx(ft.sfx);
    if (ev.chain > 1) app.sfx('combo', { step: ev.chain });
    app.haptic(ft.haptic);
    view.popup(f.cx, f.cy - 20, `+${ev.points}`, { color: ev.chain > 2 ? '#c9483b' : '#2c2a35', size: 24 + Math.min(12, ev.chain * 1.5) });
    this.bumpChip(f.type, ev.typeLeft);
    this.scoreBump();
    const total = this.session.total;
    const done = total - ev.left;
    this.countRing.style.setProperty('--k', done / total);
    this.countRing.classList.remove('bump'); void this.countRing.offsetWidth; this.countRing.classList.add('bump');
    this.leftEl.textContent = String(ev.left);
    if (ev.chain > 1) {
      this.comboEl.classList.remove('hidden');
      const x = this.comboEl.querySelector('.hud-combo-x');
      x.textContent = `×${ev.multiplier.toFixed(1)}`;
      this.comboEl.classList.remove('bump'); void this.comboEl.offsetWidth; this.comboEl.classList.add('bump');
    }
    if (ev.callout) this.showCallout(ev.callout);
    if (ev.left === 2 || ev.left === 1) this.app.toast(ev.left === 1 ? 'Just one more!' : 'Two to go!', { ms: 1400, cls: 'mini' });
    if (this.tutorial) this.tutorialAfterFix(ev);
    if (ev.complete) this.complete(ev.complete);
  }

  scoreBump() {
    const chip = this.el.querySelector('.hud-score');
    this.scoreEl.textContent = (this.session.score + (this.session.catFound ? this.content.scoring.catBonus : 0) + (this.session.collectibleFound ? this.content.scoring.collectibleBonus : 0)).toLocaleString('en-GB');
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
  }

  showCallout(text) {
    const c = this.callout;
    c.textContent = text;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    this.app.sfx('callout');
    this.app.haptic('medium');
    const v = this.app.view;
    const [x, y] = v.screenToWorld(v.view.x + v.view.w / 2, v.view.y + v.view.h * 0.3);
    this.app.view.particles.burst('confetti', x, y, { n: 26 });
  }

  // -------------------------------------------------------------- hints ---
  useLoupe() {
    if (this.finishing) return;
    const ev = this.session.useLoupe();
    if (!ev) { this.app.sfx('miss'); this.loupeBtn.classList.add('nope'); setTimeout(() => this.loupeBtn.classList.remove('nope'), 400); return; }
    this.app.view.showLoupe(ev.fault);
    this.app.sfx('hint');
    this.app.haptic('light');
    if (this.tutorial?.step === 3) this.setCoach(null);
  }

  useFlash() {
    if (this.finishing) return;
    if (this.app.save.player.flashbulbs <= 0) {
      this.app.toast('No flashbulbs left. Earn more from levels, requests and the Daily Postcard.', { ms: 2600 });
      return;
    }
    const ev = this.session.useFlash();
    if (!ev) return;
    this.app.save.player.flashbulbs--;
    this.app.persist();
    this.flashCount.textContent = String(this.app.save.player.flashbulbs);
    this.app.view.showFlash(ev.faults, ev.duration);
    this.app.sfx('flash');
    this.app.haptic('heavy');
  }

  // -------------------------------------------------------------- pause ---
  pause() {
    if (this.finishing) return;
    this.paused = true;
    const app = this.app;
    const cond = this.content.conditions[this.play.condition];
    const sheet = app.sheet(h('div.pause.col',
      h('div.display.sheet-title', { text: 'Paused' }),
      h('div.pause-scene', h('div.script', { text: this.scene.name }), h('div.label.muted', { text: `${cond.name} · ${this.play.daily ? 'Daily Postcard' : this.content.tier(this.play.tier).name}` })),
      h('p.pause-blurb', { text: cond.blurb }),
      h('p.hand.pause-note', { text: `${this.session.left} things still spoil the picture.` }),
      h('button.btn.teal', { text: 'Carry on', onclick: () => sheet.close() }),
      h('button.btn.ink.small', { text: 'Leave (no postcard)', onclick: () => { sheet.close('leave'); } }),
    ), { onClose: (v) => { this.paused = false; if (v === 'leave') leavePlay(app); } });
  }

  // ---------------------------------------------------------- finishing ---
  async complete(results) {
    this.finishing = true;
    const app = this.app, view = app.view;
    this.comboEl.classList.add('hidden');
    this.setCoach(null);
    await wait(750);
    view.focus(view.W / 2, view.H / 2, 1, 0.7);
    this.viewfinder.classList.remove('hidden');
    app.sfx('tick');
    await wait(420);
    app.sfx('tick');
    await wait(480);
    const stills = { after: view.renderStill('after', 720), before: view.renderStill('before', 720) };
    app.sfx('shutter');
    app.haptic('heavy');
    this.flashOverlay.classList.add('go');
    this.viewfinder.classList.add('hidden');
    await wait(260);
    await finishPlay(app, this.play, this.mess, results, stills);
  }

  // ----------------------------------------------------------- tutorial ---
  setCoach(text, target = null) {
    if (!text) { this.coach.classList.add('hidden'); this.finger.classList.add('hidden'); this.fingerTarget = null; return; }
    this.coach.querySelector('.coach-text').textContent = text;
    this.coach.classList.remove('hidden');
    this.coach.classList.remove('pop-in'); void this.coach.offsetWidth; this.coach.classList.add('pop-in');
    this.fingerTarget = target;
    this.finger.classList.toggle('hidden', !target);
  }

  tutorialStep() {
    const t = this.tutorial;
    const faults = this.mess.faults.filter((f) => this.session.remaining.has(f.id));
    if (t.step === 0) {
      const litter = faults.filter((f) => f.type === 'litter').sort((a, b) => b.salience - a.salience)[0];
      this.setCoach('Litter spoils the picture! Tap it to tidy it away.', litter && { world: [litter.cx, litter.cy] });
    } else if (t.step === 1) {
      const crooked = faults.find((f) => f.type === 'crooked');
      this.setCoach(crooked ? 'Some things just need a nudge. Tap the crooked one.' : 'Lovely! Keep going.', crooked && { world: [crooked.cx, crooked.cy] });
    } else if (t.step === 2) {
      this.setCoach('Now find the rest! The list on the right shows what still needs fixing.', { el: this.tray });
      setTimeout(() => { if (this.tutorial.step === 2) this.setCoach(null); }, 4500);
    }
  }

  tutorialAfterFix(ev) {
    const t = this.tutorial;
    if (t.step < 2) { t.step++; this.tutorialStep(); }
    if (ev.chain === 2 && !t.comboShown && t.step >= 2) {
      t.comboShown = true;
      this.setCoach('Quick fixes in a row make a combo, worth more points!');
      setTimeout(() => { if (this.coach.querySelector('.coach-text').textContent.startsWith('Quick')) this.setCoach(null); }, 3000);
    }
  }

  updateTutorial(dt) {
    const t = this.tutorial;
    t.idle += dt;
    if (t.step >= 2 && t.idle > 8 && t.step !== 3 && this.session.loupeReady && !this.finishing) {
      t.step = 3;
      this.setCoach('Stuck? The loupe shows you where to look. It recharges as you play.', { el: this.loupeBtn });
    }
    const tg = this.fingerTarget;
    if (tg) {
      let x, y;
      if (tg.world) [x, y] = this.app.view.worldToScreen(...tg.world);
      else { const r = tg.el.getBoundingClientRect(); x = r.left - 30; y = r.top + r.height / 2 - 30; }
      this.finger.style.transform = `translate(${x - 12}px, ${y + 6 + Math.sin(performance.now() / 180) * 6}px)`;
    }
  }
}
