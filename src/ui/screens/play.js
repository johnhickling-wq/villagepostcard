// The tidy-up: the scene fills the screen and everything else floats over it
// (the way phone hidden-object games do it): a thin bar of actions along the
// top, pause in the top-left corner, hints in the bottom-right. Taps go to the
// PlaySession (rules) and the SceneView (animation).

import { h, icon, svg, wait, CONDITION_ICONS } from '../dom.js';
import { PlaySession } from '../../core/session.js';
import { Gestures } from '../../engine/input.js';
import { finishPlay, leavePlay } from '../flows.js';

const ALL_SHOWN = { score: true, timer: true, combo: true, loupe: true, flash: true };

export class PlayScreen {
  constructor(app, play, mess) {
    this.app = app;
    this.play = play;
    this.mess = mess;
    this.usesCanvas = true;
    this.session = new PlaySession(app.content, mess, play, { flashbulbs: app.save.player.flashbulbs });
    this.content = app.content;
    this.scene = app.content.scene(play.village, play.scene);
    this.show = { ...ALL_SHOWN, ...(play.show || {}) };
    this.tutorial = play.tutorial ? { step: 0, idle: 0 } : null;
    this.finishing = false;
    this.build();
  }

  build() {
    const app = this.app, c = this.content;
    const tier = c.tier(this.play.tier);
    const cond = c.conditions[this.play.condition];
    // the action bar: one chip per kind of job, counting down
    this.bar = h('div.action-bar.card.paper');
    // score and clock share a small pill in the top-right corner
    this.scoreEl = h('span.hud-score-num', { text: '0' });
    this.timeEl = h('span.hud-time', { text: '0:00' });
    this.scorePill = h('div.hud-stats',
      this.show.score ? h('span.hud-score', icon('camera'), this.scoreEl) : null,
      this.show.timer ? h('span.hud-clock', icon('clock'), this.timeEl) : null,
    );
    if (!this.show.score && !this.show.timer) this.scorePill.classList.add('hidden');
    this.comboEl = h('div.hud-combo.hidden', h('span.hud-combo-x', { text: '×1.2' }), h('i.hud-combo-bar', h('b')));
    this.callout = h('div.hud-callout.display');
    this.loupeRing = h('div.loupe-ring');
    this.loupeBtn = h('button.tool.loupe', { 'aria-label': 'Loupe hint', onclick: () => this.useLoupe() },
      this.loupeRing, h('img', { src: app.assets.spriteUrl('ui/magnifier', 'common', 0.5), alt: '' }));
    this.flashCount = h('span.badge', { text: String(app.save.player.flashbulbs) });
    this.flashBtn = h('button.tool.flash', { 'aria-label': 'Flashbulb', onclick: () => this.useFlash() },
      h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.5), alt: '' }), this.flashCount);
    this.hints = h('div.hud-hints', this.show.flash ? this.flashBtn : null, this.show.loupe ? this.loupeBtn : null);
    this.pauseBtn = h('button.iconbtn.hud-pause', { 'aria-label': 'Pause', onclick: () => this.pause() }, icon('pause'));
    this.shaky = h('div.hud-shaky.hidden', h('div.display', { text: 'Shaky hands!' }), h('div.hand', { text: 'Steady on… tap with care.' }));
    this.coach = h('div.coach.hidden', h('div.coach-text.hand'));
    this.finger = h('div.finger.hidden', svg('<svg viewBox="0 0 48 48"><path d="M20 44c-4-3-9-9-11-13-1-2 1-4 3-3l4 3V8a3 3 0 0 1 6 0v14l1-1a3 3 0 0 1 5 1 3 3 0 0 1 5 1 3 3 0 0 1 5 2v9c0 5-3 9-6 11Z" fill="#fffdf7" stroke="#2c2a35" stroke-width="2.4" stroke-linejoin="round"/></svg>'));
    this.viewfinder = h('div.viewfinder.hidden', h('i.vf.tl'), h('i.vf.tr'), h('i.vf.bl'), h('i.vf.br'), h('div.vf-center'), h('div.vf-text.typed', { text: 'Hold still…' }));
    this.flashOverlay = h('div.white-flash');
    this.zoomReset = h('button.zoom-reset.chip.hidden', { onclick: () => { this.app.sfx('ui.tap'); const v = this.app.view; v.focus(v.W / 2, v.H / 2, 1, 0.4); } }, icon('eye'), h('span', { text: 'Whole scene' }));
    this.tip = h('div.action-tip.hidden');
    // the place name is announced as you arrive, then gets out of the way
    this.tab = h('div.hud-tab.card.paper',
      h('div.script.hud-scene', { text: this.scene.name }),
      h('div.hud-sub.row',
        h('span.hud-cond', icon(CONDITION_ICONS[this.play.condition]), h('span', { text: cond.name })),
        h('span.dot', { text: '·' }),
        h('span', { text: this.play.daily ? 'Daily Postcard' : tier.name }),
      ),
    );
    this.el = h('div.play.passthrough', this.bar, this.tip, this.pauseBtn, this.scorePill, this.comboEl, this.hints, this.tab,
      this.callout, this.shaky, this.coach, this.finger, this.viewfinder, this.flashOverlay, this.zoomReset);
    this.renderBar();
  }

  async enter() {
    const app = this.app;
    await app.view.load({ village: this.play.village, scene: this.play.scene, mess: this.mess, projects: this.play.projects });
    this.layout();
    this.gestures = new Gestures(app.canvas, {
      onTap: (x, y) => this.tap(x, y),
      onPan: (dx, dy) => app.view.pan(dx, dy),
      onPinch: (f, cx, cy, dx, dy) => { app.view.zoomAt(f, cx, cy); app.view.pan(dx, dy); },
    }, (x, y) => app.toLocal(x, y));
    app.audio.startMusic('play');
    const amb = [...(this.scene.ambience || [])];
    if (this.play.condition === 'dusk') amb.push('crickets');
    if (this.play.condition === 'storm') amb.push('drips', 'breeze');
    app.audio.startAmbience(this.play.condition === 'mist' ? amb.filter((a) => a !== 'birds') : amb);
    setTimeout(() => this.tab.classList.add('gone'), this.tutorial ? 1800 : 2200);
    if (this.tutorial) setTimeout(() => this.tutorialStep(), 1400);
  }

  exit() {
    this.gestures?.destroy();
    this.app.audio.stopAmbience();
  }

  resize() { this.layout(); }

  /** The scene fills the screen when that crops only a sliver of it; otherwise it
   *  is shown whole. The overlays sit on top either way. */
  layout() {
    const app = this.app, view = app.view;
    const W = app.width, H = app.height;
    if (view.ready) {
      const sceneAR = view.W / view.H, screenAR = W / H;
      const crop = 1 - Math.min(sceneAR, screenAR) / Math.max(sceneAR, screenAR);
      view.setView(0, 0, W, H, { cover: crop <= (this.content.hud?.fit?.coverMaxCrop ?? 0.1) });
    } else view.setView(0, 0, W, H);
    if (!view.ready) return;
    const s = view.fit;
    const w = view.W * s, hgt = view.H * s;
    const px = (W - w) / 2, py = (H - hgt) / 2;
    this.print = { x: px, y: py, w, h: hgt };
    const sf = app.safe;
    // overlays stay inside the phone's safe area and inside the picture
    const top = Math.max(sf.t, py) + 6, left = Math.max(sf.l, px) + 8, right = Math.max(sf.r, W - px - w) + 8, bottom = Math.max(sf.b, H - py - hgt) + 8;
    const place = (el, css) => Object.assign(el.style, css);
    place(this.pauseBtn, { left: `${left}px`, top: `${top}px` });
    place(this.scorePill, { right: `${right}px`, top: `${top}px` });
    place(this.hints, { right: `${right}px`, bottom: `${bottom}px` });
    this.corners = { left, right };
    place(this.bar, { top: `${top}px` });
    place(this.tip, { top: `${top + 40}px` });
    place(this.comboEl, { top: `${top + 42}px` });
    place(this.coach, { left: `${px + 16}px`, width: `${w - 32}px`, top: `${top + 46}px` });
    place(this.viewfinder, { left: `${px + 14}px`, top: `${py + 14}px`, width: `${w - 28}px`, height: `${hgt - 28}px` });
    place(this.zoomReset, { left: `${W / 2}px`, top: `${H - bottom - 38}px` });
    place(this.callout, { left: `${px}px`, width: `${w}px`, top: `${py + hgt * 0.3}px` });
    place(this.shaky, { left: `${px}px`, top: `${py}px`, width: `${w}px`, height: `${hgt}px` });
    place(this.tab, { left: `${W / 2}px`, top: `${py + hgt * 0.36}px` });
    this.placeBar();
  }

  /** The bar is centred, so it keeps clear of whichever top corner is fuller. */
  placeBar() {
    if (!this.corners) return;
    const pill = this.scorePill.classList.contains('hidden') ? 0 : this.scorePill.offsetWidth;
    this.pillWidth = pill;
    const corner = Math.max(this.corners.left + this.pauseBtn.offsetWidth, this.corners.right + pill) + 8;
    this.bar.style.maxWidth = `${this.app.width - 2 * corner}px`;
    this.fitBar();
  }

  // ---------------------------------------------------------- action bar ---
  renderBar() {
    const types = this.session.remainingByType();
    this.bar.innerHTML = '';
    this.chips = {};
    for (const [type, n] of Object.entries(types)) {
      const f = this.content.faults[type];
      const count = h('span.act-count', { text: String(n.left) });
      // cut-paper tool art when there is some, the line icon otherwise
      const art = this.app.assets.spriteUrl(`tools/${f.actionIcon}`, 'common');
      const chip = h('button.act', { 'aria-label': `${f.action}: ${n.left} left`, onclick: () => this.tapAction(type) },
        h('span.act-ico', art ? h('img', { src: art, alt: '' }) : icon(f.actionIcon)), h('span.act-label', { text: f.action }), count);
      if (!n.left) chip.classList.add('done');
      this.chips[type] = { chip, count };
      this.bar.append(chip);
    }
    this.fitBar();
  }

  /** Labels when there's room; icons and numbers alone when there isn't. */
  fitBar() {
    this.bar.classList.remove('compact');
    if (this.bar.scrollWidth > this.bar.clientWidth + 1) this.bar.classList.add('compact');
  }

  bumpChip(type, left) {
    const c = this.chips[type];
    if (!c) return;
    c.count.textContent = String(left);
    c.chip.setAttribute('aria-label', `${this.content.faults[type].action}: ${left} left`);
    c.chip.classList.remove('bump');
    void c.chip.offsetWidth;
    c.chip.classList.add('bump');
    if (!left) {
      c.chip.classList.add('done');
      this.app.sfx('stamp');
    }
  }

  /** Tapping an action names it, and (if the loupe is charged) shows you one. */
  tapAction(type) {
    if (this.finishing) return;
    const f = this.content.faults[type];
    const left = this.session.remainingByType()[type]?.left || 0;
    this.showTip(left ? `${f.verb}: ${left} left` : `${f.action}: all done!`);
    this.app.sfx('ui.tap');
    if (left && this.show.loupe) this.useLoupe(type, { quiet: true });
  }

  showTip(text) {
    const t = this.tip;
    t.textContent = text;
    t.classList.remove('hidden', 'pop');
    void t.offsetWidth;
    t.classList.add('pop');
    clearTimeout(this._tipTimer);
    this._tipTimer = setTimeout(() => t.classList.add('hidden'), 1800);
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
    this.loupeRing.style.setProperty('--k', s.loupeProgress);
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
    const app = this.app, view = app.view, s = this.session;
    const [wx, wy] = view.screenToWorld(sx, sy);
    // the desk around a picture that doesn't fill the screen isn't part of the game
    if (wx < 0 || wy < 0 || wx > view.W || wy > view.H) return;
    const tol = this.content.scoring.tapTolerancePx / view.scale;
    const now = performance.now();
    const prev = this.lastTap;
    this.lastTap = { t: now, x: sx, y: sy, miss: false };
    // a quick second tap on the same empty spot is a double-tap zoom, not two
    // mis-taps; but a quick second tap that lands on something still fixes it
    if (prev?.miss && now - prev.t < 320 && Math.hypot(sx - prev.x, sy - prev.y) < 30 && !s.peek(wx, wy, tol)) {
      if (s.forgiveLastMiss()) this.scoreBump();
      view.focus(wx, wy, view.cam.zoom > 1.3 ? 1 : 2, 0.35);
      this.lastTap = null;
      return;
    }
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
        const target = app.localRect(this.show.score ? this.scorePill : this.bar);
        view.collectibleFound([target.left + target.width / 2, target.top + target.height / 2]);
        view.popup(ev.collectible.cx, ev.collectible.cy - 30, `${ev.collectible.name}!`, { color: '#2f4f86', size: 26 });
        app.sfx('collect');
        app.haptic('success');
        this.scoreBump();
        return;
      }
      case 'miss':
        this.lastTap.miss = true;
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
    if (ev.chain > 1 && this.show.combo) app.sfx('combo', { step: ev.chain });
    app.haptic(ft.haptic);
    if (this.show.score) view.popup(f.cx, f.cy - 20, `+${ev.points}`, { color: ev.chain > 2 ? '#c9483b' : '#2c2a35', size: 24 + Math.min(12, ev.chain * 1.5) });
    this.bumpChip(f.type, ev.typeLeft);
    this.scoreBump();
    if (ev.chain > 1 && this.show.combo) {
      this.comboEl.classList.remove('hidden');
      const x = this.comboEl.querySelector('.hud-combo-x');
      x.textContent = `×${ev.multiplier.toFixed(1)}`;
      this.comboEl.classList.remove('bump'); void this.comboEl.offsetWidth; this.comboEl.classList.add('bump');
    }
    if (ev.callout && this.show.combo) this.showCallout(ev.callout);
    if (ev.left === 2 || ev.left === 1) this.app.toast(ev.left === 1 ? 'Just one more!' : 'Two to go!', { ms: 1400, cls: 'mini' });
    if (this.tutorial) this.tutorialAfterFix(ev);
    if (ev.complete) this.complete(ev.complete);
  }

  scoreBump() {
    this.scoreEl.textContent = (this.session.score + (this.session.catFound ? this.content.scoring.catBonus : 0) + (this.session.collectibleFound ? this.content.scoring.collectibleBonus : 0)).toLocaleString('en-GB');
    const chip = this.scorePill;
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    if (chip.offsetWidth !== this.pillWidth) this.placeBar();
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
  useLoupe(type = null, { quiet = false } = {}) {
    if (this.finishing || !this.show.loupe) return;
    const ev = this.session.useLoupe(type);
    if (!ev) {
      if (!quiet) this.app.sfx('miss');
      this.loupeBtn.classList.add('nope'); setTimeout(() => this.loupeBtn.classList.remove('nope'), 400);
      return;
    }
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
    this.el.classList.add('finishing');
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
      this.setCoach('Now find the rest! The bar at the top shows what still needs doing.', { el: this.bar, below: true });
      setTimeout(() => { if (this.tutorial.step === 2) this.setCoach(null); }, 4500);
    }
  }

  tutorialAfterFix(ev) {
    const t = this.tutorial;
    if (t.step < 2) { t.step++; this.tutorialStep(); }
    if (ev.chain === 2 && !t.comboShown && t.step >= 2 && this.show.combo) {
      t.comboShown = true;
      this.setCoach('Quick fixes in a row make a combo, worth more points!');
      setTimeout(() => { if (this.coach.querySelector('.coach-text').textContent.startsWith('Quick')) this.setCoach(null); }, 3000);
    }
  }

  updateTutorial(dt) {
    const t = this.tutorial;
    t.idle += dt;
    if (t.step >= 2 && t.idle > 8 && t.step !== 3 && this.show.loupe && this.session.loupeReady && !this.finishing) {
      t.step = 3;
      this.setCoach('Stuck? The magnifying glass shows you where to look. It recharges as you play.', { el: this.loupeBtn });
    }
    const tg = this.fingerTarget;
    if (tg) {
      let x, y;
      if (tg.world) [x, y] = this.app.view.worldToScreen(...tg.world);
      else if (tg.below) { const r = this.app.localRect(tg.el); x = r.left + r.width / 2; y = r.bottom + 2; }
      else { const r = this.app.localRect(tg.el); x = r.left - 30; y = r.top + r.height / 2 - 30; }
      this.finger.style.transform = `translate(${x - 12}px, ${y + 6 + Math.sin(performance.now() / 180) * 6}px)`;
    }
  }
}
