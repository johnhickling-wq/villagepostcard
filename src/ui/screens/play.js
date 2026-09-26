// The tidy-up: the scene fills the screen and everything else floats over it
// (the way phone hidden-object games do it): a thin bar of jobs along the
// top, pause in the top-left corner, the loupe in the bottom-right. Taps go
// to the PlaySession (rules) and the SceneView (animation).
//
// A story visit opens with its resident's request and has no score, clock or
// penalty: a stall of a few seconds brings a gentle offer of the (free)
// loupe, and tapping tomorrow's job gets a friendly word, not a mistake.
// Every fix is saved at once, so a reload carries on where it left off.

import { h, icon, svg, wait, CONDITION_ICONS } from '../dom.js';
import { PlaySession } from '../../core/session.js';
import { Gestures } from '../../engine/input.js';
import { commitPlay, showReveal, leavePlay } from '../flows.js';
import { checkpoint, leavePlay as leaveSave } from '../../core/progression.js';
import { shapeBounds } from '../../core/geometry.js';

export class PlayScreen {
  constructor(app, play, mess, progress = null) {
    this.app = app;
    this.play = play;
    this.mess = mess;
    this.progress = progress;
    this.usesCanvas = true;
    this.story = play.mode === 'visit';
    this.visit = this.story ? app.content.visit(play.village, play.visit) : null;
    this.session = new PlaySession(app.content, mess, play, { flashbulbs: app.save.player.flashbulbs, resume: progress });
    this.content = app.content;
    this.scene = app.content.scene(play.village, play.scene);
    this.show = { score: false, timer: false, combo: false, loupe: true, flash: false, ...(play.show || {}) };
    this.tutorial = play.tutorial && !progress?.done?.length ? { step: 0, idle: 0 } : null;
    this.finishing = false;
    this.offer = 0; // how clearly the loupe has been offered in this stall (0, 1, 2)
    this.laterSaid = new Set();
    this.build();
  }

  get seen() { return this.app.save.flags.seen; }

  build() {
    const app = this.app, c = this.content;
    const cond = c.conditions[this.play.condition];
    this.bar = h('div.action-bar.card.paper');
    this.scoreEl = h('span.hud-score-num', { text: '0' });
    this.timeEl = h('span.hud-time', { text: '0:00' });
    this.scorePill = h('div.hud-stats',
      this.show.score ? h('span.hud-score', icon('camera'), this.scoreEl) : null,
      this.show.timer ? h('span.hud-clock', icon('clock'), this.timeEl) : null,
    );
    if (!this.show.score && !this.show.timer) this.scorePill.classList.add('hidden');
    this.comboEl = h('div.hud-combo.hidden', h('span.hud-combo-x', { text: '2 in a row' }), h('i.hud-combo-bar', h('b')));
    this.callout = h('div.hud-callout.display');
    this.loupeRing = h('div.loupe-ring');
    this.loupeBtn = h('button.tool.loupe', { 'aria-label': 'Hint: show me where to look', onclick: () => this.useLoupe() },
      this.loupeRing, h('img', { src: app.assets.spriteUrl('ui/magnifier', 'common', 0.5), alt: '' }));
    // the loupe appears the first time it is offered, and stays from then on
    if (this.story && !this.seen['coach:loupe']) this.loupeBtn.classList.add('hidden');
    this.flashCount = h('span.badge', { text: String(app.save.player.flashbulbs) });
    this.flashBtn = h('button.tool.flash', { 'aria-label': 'Flashbulb', onclick: () => this.useFlash() },
      h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.5), alt: '' }), this.flashCount);
    this.hints = h('div.hud-hints', this.show.flash ? this.flashBtn : null, this.show.loupe ? this.loupeBtn : null);
    this.pauseBtn = h('button.iconbtn.hud-pause', { 'aria-label': 'Pause', onclick: () => this.pause() }, icon('pause'));
    this.coach = h('div.coach.hidden', h('div.coach-text.hand'));
    this.finger = h('div.finger.hidden', svg('<svg viewBox="0 0 48 48"><path d="M20 44c-4-3-9-9-11-13-1-2 1-4 3-3l4 3V8a3 3 0 0 1 6 0v14l1-1a3 3 0 0 1 5 1 3 3 0 0 1 5 1 3 3 0 0 1 5 2v9c0 5-3 9-6 11Z" fill="#fffdf7" stroke="#2c2a35" stroke-width="2.4" stroke-linejoin="round"/></svg>'));
    this.pinch = h('div.pinch-cue.hidden', h('i'), h('i'));
    this.flashOverlay = h('div.white-flash');
    this.sweep = h('div.finish-sweep');
    this.zoomReset = h('button.zoom-reset.chip.hidden', { onclick: () => { this.app.sfx('ui.tap'); const v = this.app.view; v.focus(v.W / 2, v.H / 2, 1, 0.4); } }, icon('eye'), h('span', { text: 'Whole scene' }));
    this.tip = h('div.action-tip.hidden');
    this.bubble = h('div.say.hidden');
    // a photo walk announces its place and weather as you arrive
    this.tab = this.story ? null : h('div.hud-tab.card.paper',
      h('div.script.hud-scene', { text: this.scene.name }),
      h('div.hud-sub.row',
        h('span.hud-cond', icon(CONDITION_ICONS[this.play.condition]), h('span', { text: cond.name })),
        h('span.dot', { text: '·' }),
        h('span', { text: this.play.daily ? 'Daily Postcard' : c.tier(this.play.tier).free ? 'Photo walk' : 'Weather postcard' }),
      ),
    );
    this.caption = h('div.play-caption.hidden', h('span.script', { text: this.scene.name }),
      h('span.label', { text: this.visit ? (this.visit.kind === 'committee' ? `Committee request · ${this.visit.title}` : this.visit.title) : `${cond.name} · Photo walk` }));
    this.el = h('div.play.passthrough', this.caption, this.bar, this.tip, this.pauseBtn, this.scorePill, this.comboEl, this.hints, this.tab,
      this.callout, this.coach, this.finger, this.pinch, this.bubble, this.sweep, this.flashOverlay, this.zoomReset);
    this.renderBar();
  }

  async enter() {
    const app = this.app, play = this.play;
    await app.view.load({ village: play.village, scene: play.scene, mess: this.mess, effects: play.effects, fixed: play.fixed, bloom: play.bloom });
    app.view.reduced = app.reducedMotion;
    // carrying on: what was done stays done
    if (this.progress?.done?.length) app.view.markDone(this.progress.done);
    if (this.session.catFound && app.view.cat) app.view.cat.found = -100;
    if (this.session.collectibleFound && app.view.collectible) app.view.collectible.found = -100;
    this.layout();
    this.gestures = new Gestures(app.canvas, {
      onTap: (x, y) => this.tap(x, y),
      onPan: (dx, dy) => app.view.pan(dx, dy),
      onPinch: (f, cx, cy, dx, dy) => { app.view.zoomAt(f, cx, cy); app.view.pan(dx, dy); this.zoomed = true; },
    }, (x, y) => app.toLocal(x, y));
    app.audio.startMusic('play');
    const amb = [...(this.scene.ambience || [])];
    if (play.condition === 'dusk') amb.push('crickets');
    if (play.condition === 'storm') amb.push('drips', 'breeze');
    app.audio.startAmbience(play.condition === 'mist' ? amb.filter((a) => a !== 'birds') : amb);
    if (this.tab) setTimeout(() => this.tab.classList.add('gone'), 2200);
    // the resident asks first; then any new job gets its card
    this.paused = true;
    setTimeout(() => (this.story ? this.showBrief() : this.introduceJobs()), this.story ? 650 : 2300);
  }

  /** The resident's request, in the scene: who, what and why, in a sentence. */
  showBrief() {
    const app = this.app, v = this.visit;
    const who = app.v.villagers[v.villager];
    const again = this.progress?.done?.length;
    const left = this.session.left;
    const go = h('button.btn.teal', { text: again ? 'Carry on' : this.tutorial ? 'Let’s tidy up!' : 'Let’s start' });
    const card = h('div.brief.card.paper.pop-in',
      h('img.brief-portrait', { src: app.assets.spriteUrl(who.portrait, app.village, 0.45), alt: '' }),
      h('div.brief-body',
        h('div.label.muted', { text: v.kind === 'committee' ? `Committee request · ${who.short}` : v.kind === 'incident' ? `After the storm · ${who.short}` : `${who.short} · ${this.scene.name}` }),
        h('p.brief-text', { text: again ? `Welcome back! ${left} thing${left === 1 ? '' : 's'} still to do.` : v.brief }),
        h('div.brief-foot', go),
      ),
    );
    this.el.append(card);
    this.placeCard(card);
    app.sfx('page');
    const done = () => {
      app.sfx('ui.tap');
      card.classList.add('leaving');
      setTimeout(() => card.remove(), 260);
      this.introduceJobs();
    };
    go.addEventListener('click', done, { once: true });
  }

  placeCard(card) { card.style.top = `${this.app.localRect(this.bar).bottom + 10}px`; }

  /** A job never seen before gets a little card first. */
  introduceJobs() {
    const app = this.app, seen = this.seen;
    const fresh = Object.keys(this.session.remainingByType()).filter((t) => !seen[`job:${t}`]);
    // the first visit teaches its jobs by pointing, not with cards
    if (this.tutorial) { for (const t of fresh) seen[`job:${t}`] = true; return this.start(); }
    if (!fresh.length || this.finishing) return this.start();
    this.newJobs = fresh;
    const rows = fresh.map((t) => {
      const f = this.content.faults[t];
      return h('div.job-row', h('span.job-ico', this.jobArt(f)), h('div', h('div.display.job-name', { text: f.action }), h('div.job-text', { text: f.intro })));
    });
    const go = h('button.btn.teal.small', { text: 'Got it' });
    const card = h('div.job-card.card.paper.pop-in', h('div.label.muted', { text: fresh.length > 1 ? 'New jobs' : 'A new job' }), ...rows, go);
    this.placeCard(card);
    this.el.append(card);
    app.sfx('unlock');
    go.addEventListener('click', () => {
      app.sfx('ui.tap');
      for (const t of fresh) seen[`job:${t}`] = true;
      app.persist();
      card.remove();
      for (const t of fresh) { const c = this.chips[t]?.chip; if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
      this.start();
    });
  }

  /** The play begins (the clock, if any, starts now). */
  start() {
    this.paused = false;
    this.session.lastProgress = this.session.t;
    if (this.tutorial) setTimeout(() => this.tutorialStep(), 300);
    else this.introduceFeature();
  }

  jobArt(f) {
    const art = f.actionArt ? this.app.assets.spriteUrl(f.actionArt, 'common', 0.3) : this.app.assets.spriteUrl(`tools/${f.actionIcon}`, 'common');
    return art ? h('img', { src: art, alt: '' }) : icon(f.actionIcon);
  }

  /** The first photo walk explains its score, the first flashbulb points itself out. */
  introduceFeature() {
    const app = this.app, seen = this.seen, coach = this.content.intro?.coach || {};
    const targets = { flash: this.flashBtn, score: this.scorePill };
    for (const f of ['score', 'flash']) {
      if (!this.show[f] || seen[`coach:${f}`] || !coach[f]) continue;
      seen[`coach:${f}`] = true;
      app.persist();
      this.setCoach(coach[f], { el: targets[f], below: f === 'score' });
      setTimeout(() => { if (this.coachText === coach[f]) this.setCoach(null); }, 4200);
      return;
    }
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
    // small things are tappable over at least minTargetPx on screen
    this.session.minTarget = (this.content.story?.assist?.minTargetPx ?? 44) / view.fit;
    const s = view.fit;
    const w = view.W * s, hgt = view.H * s;
    const px = (W - w) / 2, py = (H - hgt) / 2;
    this.print = { x: px, y: py, w, h: hgt };
    const sf = app.safe;
    // overlays stay inside the phone's safe area and inside the picture
    const top = Math.max(sf.t, py, 0) + 6, left = Math.max(sf.l, px, 0) + 8, right = Math.max(sf.r, W - px - w, 0) + 8, bottom = Math.max(sf.b, H - py - hgt, 0) + 8;
    const place = (el, css) => Object.assign(el.style, css);
    place(this.pauseBtn, { left: `${left}px`, top: `${top}px` });
    place(this.scorePill, { right: `${right}px`, top: `${top}px` });
    place(this.hints, { right: `${right}px`, bottom: `${bottom}px` });
    this.corners = { left, right };
    place(this.bar, { top: `${top}px` });
    place(this.tip, { top: `${top + 42}px` });
    place(this.comboEl, { top: `${top + 44}px` });
    const cw = Math.min(W - left - right - 100, 560);
    place(this.coach, { left: `${(W - cw) / 2}px`, width: `${cw}px`, top: `${top + 48}px` });
    place(this.zoomReset, { left: `${W / 2}px`, top: `${H - bottom - 44}px` });
    place(this.callout, { left: `${Math.max(px, 0)}px`, width: `${Math.min(w, W)}px`, top: `${py + hgt * 0.3}px` });
    if (this.tab) place(this.tab, { left: `${W / 2}px`, top: `${py + hgt * 0.36}px` });
    for (const card of this.el.querySelectorAll('.brief, .job-card')) this.placeCard(card);
    // a tall screen letterboxes the scene: name the place in the margin below it
    const margin = H - (py + hgt);
    this.caption.classList.toggle('hidden', margin < 56);
    place(this.caption, { top: `${py + hgt}px`, height: `${margin}px` });
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
      const chip = h('button.act', { 'aria-label': `${f.action}: ${n.left} left`, onclick: () => this.tapAction(type) },
        h('span.act-ico', this.jobArt(f)), h('span.act-label', { text: f.action }), count);
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
    const total = this.session.remainingByType()[type]?.total || 1;
    this.app.sfx('arrive', { step: total - left });
    if (!left) {
      c.chip.classList.add('done', 'just-done');
      setTimeout(() => this.app.sfx('stamp'), 120);
      this.app.haptic('light');
    }
  }

  /** The job's tool pops out where you tapped and flies up to its place in the bar. */
  flyToBar(type, left, sx, sy) {
    const c = this.chips[type];
    if (!c) return;
    const f = this.content.faults[type];
    const r = this.app.localRect(c.chip.querySelector('.act-ico'));
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const token = h('div.fly-token', this.jobArt(f));
    this.el.append(token);
    if (this.app.reducedMotion) {
      token.remove();
      this.bumpChip(type, left);
      return;
    }
    const dx = tx - sx, dy = ty - sy;
    // an arc: up and over, a touch of spin, shrinking as it tucks in
    const lift = Math.min(90, Math.abs(dx) * 0.35 + 40);
    const anim = token.animate([
      { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(0.4) rotate(-20deg)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy - 30}px) translate(-50%, -50%) scale(1.25) rotate(0deg)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${sx + dx * 0.5}px, ${sy + dy * 0.5 - lift}px) translate(-50%, -50%) scale(1) rotate(12deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.55) rotate(0deg)`, opacity: 0.9 },
    ], { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'forwards' });
    setTimeout(() => this.app.sfx('whoosh'), 90);
    anim.onfinish = () => { token.remove(); this.bumpChip(type, left); };
  }

  /** Tapping a job names it and (the loupe being free in a visit) shows you one. */
  tapAction(type) {
    if (this.finishing || this.paused) return;
    const f = this.content.faults[type];
    const left = this.session.remainingByType()[type]?.left || 0;
    this.showTip(left ? `${f.verb}: ${left} left` : `${f.action}: all done!`);
    this.app.sfx('ui.tap');
    if (left && this.show.loupe && !this.loupeBtn.classList.contains('hidden')) this.useLoupe(type, { quiet: true });
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
    if (this.fingerTarget) this.moveFinger();
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
    this.loupeRing.style.setProperty('--k', s.loupeProgress);
    this.loupeBtn.classList.toggle('ready', s.loupeReady && !this.finishing);
    if (s.chain > 1) {
      const rem = Math.max(0, 1 - (s.t - s.lastFix) / s.comboWindow);
      this.comboEl.querySelector('b').style.width = `${rem * 100}%`;
    }
    this.zoomReset.classList.toggle('hidden', this.app.view.cam.zoom < 1.05 || this.finishing);
    if (!this.finishing) this.offerHelp();
    if (this.tutorial) this.tutorial.idle += dt;
  }

  /** Stuck? After a little while the loupe is offered; after longer, more clearly. */
  offerHelp() {
    const cfg = this.content.story?.hints || { offerAfter: 12, clearerAfter: 26 };
    const stall = this.session.stall;
    const coach = this.content.intro?.coach || {};
    const quiet = (this.app.save.stats.hints || 0) >= 3; // they know the loupe by now: just a pulse
    if (this.tutorial && this.tutorial.step < 2) return;
    if (this.offer < 1 && stall > cfg.offerAfter) {
      this.offer = 1;
      this.revealLoupe();
      this.loupeBtn.classList.add('offer');
      if (!quiet && !this.coachText) this.setCoach(coach.loupe, { el: this.loupeBtn });
      setTimeout(() => { if (this.coachText === coach.loupe) this.setCoach(null); }, 5000);
    } else if (this.offer < 2 && stall > cfg.clearerAfter) {
      this.offer = 2;
      this.revealLoupe();
      this.loupeBtn.classList.add('offer');
      if (!this.coachText || this.coachText === coach.loupe) this.setCoach(coach.loupeClearer, { el: this.loupeBtn });
      this.app.sfx('nudge');
    }
  }

  revealLoupe() {
    if (!this.loupeBtn.classList.contains('hidden')) return;
    this.loupeBtn.classList.remove('hidden');
    this.loupeBtn.classList.add('pop-in');
    this.seen['coach:loupe'] = true;
    this.app.persist();
    this.app.sfx('unlock');
  }

  /** Progress (or a hint) ends the offer. */
  calmHelp() {
    this.offer = 0;
    this.loupeBtn.classList.remove('offer');
    const coach = this.content.intro?.coach || {};
    if (this.coachText === coach.loupe || this.coachText === coach.loupeClearer) this.setCoach(null);
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
      this.zoomed = true;
      this.lastTap = null;
      return;
    }
    const ev = s.tap(wx, wy, tol);
    if (this.tutorial) this.tutorial.idle = 0;
    switch (ev.kind) {
      case 'fix': return this.onFix(ev, sx, sy);
      case 'cat':
        view.catFound();
        view.popup(ev.cat.cx, ev.cat.y - ev.cat.h, this.show.score ? `Marmalade! +${ev.points}` : 'Marmalade!', { color: '#c0602a', size: 28 });
        app.sfx('cat');
        app.haptic('success');
        view.tapRipple(sx, sy, true);
        this.scoreBump();
        this.save();
        if (!this.seen.cat) { this.seen.cat = true; app.toast([h('img', { src: app.assets.spriteUrl('critters/cat-sit', 'common', 0.3) }), 'You found Marmalade, the village cat! She hides all over Honeycombe.'], { ms: 3600 }); }
        return;
      case 'collectible': {
        const target = app.localRect(this.bar);
        view.collectibleFound([target.left + target.width / 2, target.top + target.height / 2]);
        view.popup(ev.collectible.cx, ev.collectible.cy - 30, `${ev.collectible.name}!`, { color: '#2f4f86', size: 26 });
        app.sfx('collect');
        app.haptic('success');
        this.scoreBump();
        this.save();
        return;
      }
      case 'already':
        view.tapRipple(sx, sy, true);
        return;
      case 'miss': {
        this.lastTap.miss = true;
        // tomorrow's job: a friendly word, never a mistake
        const later = view.laterAt(wx, wy, tol);
        if (later) return this.sayLater(later, sx, sy);
        view.tapRipple(sx, sy, ev.gentle ? 'soft' : false);
        if (ev.gentle) { app.sfx('ui.tap', { volume: 0.4 }); return; }
        app.sfx('miss');
        app.haptic('select');
        if (ev.brokeChain > 1) this.comboEl.classList.add('hidden');
        this.scoreEl.textContent = s.score.toLocaleString('en-GB');
        return;
      }
    }
  }

  sayLater(n, sx, sy) {
    const app = this.app;
    app.view.tapRipple(sx, sy, 'soft');
    if (this.laterSaid.has(n.target) && performance.now() - (this._laterAt || 0) < 4000) return;
    this.laterSaid.add(n.target);
    this._laterAt = performance.now();
    const who = app.v.villagers[this.scene.villager];
    const text = n.later || (who ? 'We’ll see to that another day.' : 'That can wait for another day.');
    app.sfx('ui.tap');
    this.say(who, text, sx, sy);
  }

  /** A resident's speech bubble near a spot on screen, for a moment. */
  say(who, text, sx, sy) {
    const b = this.bubble;
    b.innerHTML = '';
    if (who) b.append(h('img', { src: this.app.assets.spriteUrl(who.portrait, this.app.village, 0.3), alt: '' }));
    b.append(h('span', { text }));
    b.classList.remove('hidden', 'pop-in');
    void b.offsetWidth;
    b.classList.add('pop-in');
    const W = this.app.width, H = this.app.height;
    const bw = Math.min(360, W * 0.6);
    b.style.width = `${bw}px`;
    b.style.left = `${Math.max(12, Math.min(W - bw - 12, sx - bw / 2))}px`;
    b.style.top = `${sy > H * 0.55 ? Math.max(56, sy - 110) : sy + 34}px`;
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(() => b.classList.add('hidden'), 3200);
  }

  /** Checkpoint: every fix and find is saved at once. */
  save() {
    checkpoint(this.app.save, this.session.progress());
    this.app.persist(true);
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
    else if (f.colour) view.popup(f.cx, f.cy - f.h * 0.5, `${this.content.story.colours[f.colour].name}!`, { color: '#2c2a35', size: 28 });
    this.flyToBar(f.type, ev.typeLeft, sx, sy);
    this.scoreBump();
    this.calmHelp();
    if (ev.chain > 1 && this.show.combo) {
      this.comboEl.classList.remove('hidden');
      this.comboEl.querySelector('.hud-combo-x').textContent = `${ev.chain} in a row`;
      this.comboEl.classList.remove('bump'); void this.comboEl.offsetWidth; this.comboEl.classList.add('bump');
    }
    if (ev.callout && this.show.combo) this.showCallout(ev.callout);
    const comboTip = this.content.intro?.coach?.combo;
    if (ev.chain === 2 && this.show.combo && comboTip && !this.seen['coach:combo']) {
      this.seen['coach:combo'] = true;
      this.setCoach(comboTip);
      setTimeout(() => { if (this.coachText === comboTip) this.setCoach(null); }, 3000);
    }
    if (ev.complete) return this.complete(ev.complete);
    this.save();
    if (ev.left === 2 || ev.left === 1) this.app.toast(ev.left === 1 ? 'Just one more!' : 'Two to go!', { ms: 1400, cls: 'mini' });
    if (this.tutorial) this.tutorialAfterFix();
    else this.maybeTeachZoom();
  }

  /** Zoom is taught the first time something small is left to find (on a
   *  visit that isn't already teaching a new job: one idea at a time). */
  maybeTeachZoom() {
    const text = this.content.intro?.coach?.zoom;
    if (!text || this.seen['coach:zoom'] || this.zoomed || this.coachText || this.newJobs) return;
    const view = this.app.view;
    const small = [...this.session.remaining].map((id) => this.session.byId.get(id)).find((f) => {
      const b = shapeBounds(f.shape);
      return Math.sqrt(b.w * b.h) * view.scale < 27;
    });
    if (!small) return;
    this.seen['coach:zoom'] = true;
    this.app.persist();
    this.setCoach(text);
    const [x, y] = view.worldToScreen(small.cx, small.cy);
    this.pinch.style.transform = `translate(${x}px, ${y}px)`;
    this.pinch.classList.remove('hidden');
    setTimeout(() => { this.pinch.classList.add('hidden'); if (this.coachText === text) this.setCoach(null); }, 5200);
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
    v.particles.burst('confetti', x, y, { n: 26 });
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
    this.calmHelp();
    this.save();
  }

  useFlash() {
    if (this.finishing) return;
    if (this.app.save.player.flashbulbs <= 0) {
      this.app.toast('No flashbulbs left. Earn more from levels, favours and the Daily Postcard.', { ms: 2600 });
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
    const wasPaused = this.paused;
    this.paused = true;
    const app = this.app, v = this.visit;
    const who = v && app.v.villagers[v.villager];
    const types = this.session.remainingByType();
    const todo = Object.entries(types).filter(([, n]) => n.left).map(([t, n]) => `${this.content.faults[t].action} ${n.left}`).join(' · ');
    const cond = this.content.conditions[this.play.condition];
    const sheet = app.sheet(h('div.pause.col',
      h('div.display.sheet-title', { text: 'Paused' }),
      h('div.pause-scene', h('div.script', { text: this.scene.name }),
        h('div.label.muted', { text: v ? (v.kind === 'committee' ? 'Committee request' : v.title) : `${cond.name} · ${this.play.daily ? 'Daily Postcard' : 'Photo walk'}` })),
      v ? h('div.pause-brief.row', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }), h('p.hand', { text: `“${v.brief}”` })) : h('p.pause-blurb', { text: cond.blurb }),
      h('p.pause-note', { text: `Still to do: ${todo}` }),
      h('button.btn.teal', { text: 'Carry on', onclick: () => sheet.close() }),
      h('button.btn.ink.small', { text: 'Back to the map', onclick: () => { sheet.close('leave'); } }),
      h('p.label.muted.pause-keep', { text: 'Anything you’ve done here is kept for next time.' }),
    ), { onClose: (val) => { this.paused = wasPaused; if (val === 'leave') { leaveSave(app.save); app.persist(true); leavePlay(app); } } });
  }

  // ---------------------------------------------------------- finishing ---
  /** The last fix: the result is saved first; the reveal is only presentation. */
  async complete(results) {
    this.finishing = true;
    const app = this.app, view = app.view;
    const before = view.renderStill('before', Math.min(1600, Math.round(app.width * app.dpr)));
    const receipt = commitPlay(app, this.play, this.mess, results);
    this.comboEl.classList.add('hidden');
    this.setCoach(null);
    this.bubble.classList.add('hidden');
    this.el.classList.add('finishing');
    // picture perfect: a warm light passes over the whole scene, with a chime
    await wait(360);
    app.sfx('complete');
    app.haptic('success');
    if (!app.reducedMotion) {
      this.sweep.classList.add('go');
      for (let i = 0; i < 5; i++) {
        setTimeout(() => view.particles.burst('sparkle', view.W * (0.15 + 0.175 * i), view.H * (0.35 + 0.25 * Math.sin(i * 2.1)), { n: 8, confetti: 0, color: '#fff4c8' }), 120 + i * 130);
      }
    }
    view.focus(view.W / 2, view.H / 2, 1, 0.7);
    await wait(900);
    showReveal(app, { play: this.play, mess: this.mess, result: results, receipt, before });
  }

  // ----------------------------------------------------------- tutorial ---
  get coachText() { return this.coach.classList.contains('hidden') ? null : this.coach.querySelector('.coach-text').textContent; }

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
    if (!t) return;
    const faults = this.mess.faults.filter((f) => this.session.remaining.has(f.id));
    if (t.step === 0) {
      const litter = faults.filter((f) => f.type === 'litter').sort((a, b) => b.salience - a.salience)[0];
      this.setCoach('Litter spoils the picture! Tap it to tidy it away.', litter && { world: [litter.cx, litter.cy] });
    } else if (t.step === 1) {
      const crooked = faults.find((f) => f.type === 'crooked');
      this.setCoach(crooked ? 'That sign’s all crooked. Tap it to put it straight.' : 'Lovely! Keep going.', crooked && { world: [crooked.cx, crooked.cy] });
    } else if (t.step === 2) {
      this.setCoach('Now find the rest! The bar at the top shows what’s left to do.', { el: this.bar, below: true });
      setTimeout(() => { if (this.tutorial?.step === 2) this.setCoach(null); }, 4500);
    }
  }

  tutorialAfterFix() {
    const t = this.tutorial;
    if (t.step < 2) { t.step++; this.tutorialStep(); }
  }

  moveFinger() {
    const tg = this.fingerTarget;
    if (!tg) return;
    let x, y;
    if (tg.world) [x, y] = this.app.view.worldToScreen(...tg.world);
    else if (tg.below) { const r = this.app.localRect(tg.el); x = r.left + r.width / 2; y = r.bottom + 2; }
    else { const r = this.app.localRect(tg.el); x = r.left - 30; y = r.top + r.height / 2 - 30; }
    const bob = this.app.reducedMotion ? 0 : Math.sin(performance.now() / 180) * 6;
    this.finger.style.transform = `translate(${x - 12}px, ${y + 6 + bob}px)`;
  }
}

