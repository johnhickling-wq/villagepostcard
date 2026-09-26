// The application: owns content, assets, the save, the shared scene canvas,
// the screen router, sheets/modals/toasts and the main loop.

import { loadContent } from './core/content.js';
import { newSave, migrate, levelInfo, refillRequests, SAVE_VERSION } from './core/progression.js';
import { Assets } from './engine/assets.js';
import { audio } from './engine/audio.js';
import { haptics } from './engine/haptics.js';
import { storage } from './engine/storage.js';
import { SceneView } from './render/sceneView.js';
import { h, wait } from './ui/dom.js';
import { BootScreen } from './ui/screens/boot.js';
import { TitleScreen } from './ui/screens/title.js';

export class App {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('#scene');
    this.ui = root.querySelector('#ui');
    this.screen = null;
    this.layers = h('div.layers');
    this.toasts = h('div.toasts');
    // measures the device's safe-area insets (notch, home bar) in px
    this.safeProbe = h('div.safe-probe');
    this.ui.append(this.layers, this.toasts, this.safeProbe);
    this.safe = { t: 0, r: 0, b: 0, l: 0 };
    this.audio = audio;
    this.haptics = haptics;
    this.last = performance.now();
    this._loop = this._loop.bind(this);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.persist(true); audio.ctx?.suspend(); } else audio.ctx?.resume();
    });
    window.addEventListener('pagehide', () => this.persist(true));
    storage.onError = () => this.toast('Your progress couldn’t be saved on this device just now.', { ms: 4200, cls: 'warn' });
    // unlock (or, after a phone call or lock screen, resume) audio on any touch.
    // iOS only lets sound start inside touchend/click, not pointerdown.
    const unlock = () => { if (audio.ctx?.state !== 'running') { audio.unlock(); this.applySettings(); } };
    for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, unlock, { passive: true });
  }

  async boot() {
    const boot = new BootScreen(this);
    this.show(boot, { instant: true });
    this.resize();
    requestAnimationFrame(this._loop);
    const readJson = async (p) => {
      const r = await fetch(p);
      if (!r.ok) throw new Error(`${p}: ${r.status}`);
      return r.json();
    };
    boot.progress(0.05, 'Sorting the post…');
    this.content = await loadContent(readJson);
    this.assets = new Assets(this.content);
    this.view = new SceneView(this.canvas, this);
    this.saveNotice = this.loadSave();
    refillRequests(this.save, this.content, this.village);
    this.applySettings();
    boot.progress(0.15, 'Unpacking the collage box…');
    const vid = this.village;
    const v = this.content.village(vid);
    // postcards, album slots and thumbnails take the shape of the village's scenes
    const [sw, sh] = v.scenes[v.start].size;
    this.root.style.setProperty('--scene-ar', String(sw / sh));
    const imageKeys = [[v.map.image, vid], ...v.sceneOrder.map((s) => [v.scenes[s].plate, vid, true]), ['plate/high-street', vid]];
    await Promise.all([
      this.assets.preload(['common', vid], imageKeys, (k) => boot.progress(0.15 + k * 0.8, 'Unpacking the collage box…')),
      document.fonts?.ready,
      ...['700 20px Fraunces', '800 20px Fraunces', '700 20px Caveat', '20px Yellowtail', '600 16px Jost', '20px "Special Elite"'].map((f) => document.fonts?.load(f).catch(() => null)),
    ]);
    boot.progress(1, 'Ready!');
    await wait(250);
    if (this.saveNotice === 'corrupt') await this.recoverSave();
    this.show(new TitleScreen(this));
    if (this.saveNotice === 'unavailable') setTimeout(() => this.toast('This device isn’t keeping saves (private browsing?), so progress will be lost when you close the game.', { ms: 6000, cls: 'warn' }), 1600);
  }

  /** Read and, if it's from an older version, migrate the save (keeping a backup). */
  loadSave() {
    const r = storage.read();
    if (r.status === 'ok') {
      const from = r.data.v;
      const save = migrate(r.data, this.content);
      if (save) {
        this.save = save;
        // the old version is kept as a backup before the new one replaces it
        if (from < SAVE_VERSION) { storage.backup(r.raw); this.persist(true); }
        return 'ok';
      }
    }
    this.save = newSave(this.content);
    if (r.status === 'ok' || r.status === 'corrupt') {
      // never quietly replace a save we couldn't read: nothing is written until the player chooses
      this.holdSaves = true;
      this.badSave = r.raw;
      return 'corrupt';
    }
    return r.status === 'unavailable' ? 'unavailable' : 'new';
  }

  /** A save we couldn't read: offer the backup, or a fresh start with the old one kept aside. */
  async recoverSave() {
    const b = storage.readBackup();
    const backup = b.status === 'ok' ? migrate(b.data, this.content) : null;
    const choose = await new Promise((res) => {
      const tryBackup = backup ? h('button.btn.teal', { text: 'Use the backup', onclick: () => res('backup') }) : null;
      const fresh = h('button.btn' + (backup ? '.ink.small' : '.teal'), { text: 'Start a new village', onclick: () => res('new') });
      this.modal(h('div.celebrate.card.paper', h('div.display.celebrate-title', { text: 'We couldn’t read your saved village' }),
        h('p', { text: backup ? 'There is an earlier backup on this device. Your unreadable save is kept aside either way.' : 'Your unreadable save is kept aside on this device, and a new village will begin.' }),
        h('div.col', tryBackup, fresh)), { dismissable: false });
    });
    document.querySelector('.modal')?.remove();
    document.querySelector('.overlay')?.remove();
    storage.setAside(this.badSave);
    if (choose === 'backup' && backup) this.save = backup;
    this.holdSaves = false;
    this.persist(true);
  }

  get village() { return this.save?.current || 'honeycombe'; }
  get v() { return this.content.village(this.village); }
  get vs() { return this.save.villages[this.village]; }
  get level() { return levelInfo(this.content, this.save.player.xp); }

  /** Save now (or shortly). Returns false if the device refused. */
  persist(now = false) {
    if (!this.save || this.holdSaves) return false;
    return storage.save(this.save, now);
  }

  /** Reduced motion: the player's choice, or the device's setting until they choose. */
  get reducedMotion() {
    const pref = this.save?.settings.reducedMotion;
    return pref ?? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  applySettings() {
    if (!this.save) return;
    const s = this.save.settings;
    audio.setEnabled('sfx', s.sfx);
    audio.setEnabled('music', s.music);
    haptics.enabled = s.haptics;
    const reduced = this.reducedMotion;
    document.documentElement.classList.toggle('reduced-motion', reduced);
    if (this.view) this.view.reduced = reduced;
  }

  sfx(name, opts) { audio.play(name, opts); }
  haptic(kind) { haptics.play(kind); }

  // ----------------------------------------------------------- screens ---
  async show(screen, { transition = 'fade', instant = false } = {}) {
    const old = this.screen;
    // toasts belong to the screen that raised them
    this.clearToasts();
    if (!instant && transition === 'iris') await this.iris(true);
    this.screen = screen;
    screen.el.classList.add('screen');
    if (!instant && transition === 'fade') screen.el.classList.add('screen-enter');
    this.layers.append(screen.el);
    this.canvas.style.visibility = screen.usesCanvas ? 'visible' : 'hidden';
    await screen.enter?.();
    this.resize();
    if (old) {
      old.exit?.();
      if (!instant && transition === 'fade') {
        old.el.classList.add('screen-leave');
        setTimeout(() => old.el.remove(), 380);
      } else old.el.remove();
    }
    if (!instant && transition === 'iris') await this.iris(false);
  }

  /** Camera-aperture transition. closing=true covers the screen. */
  iris(closing) {
    if (this.reducedMotion) {
      // a plain fade instead of the aperture
      let el = this.fadeEl;
      if (!el) { el = this.fadeEl = h('div.fade-cover'); this.ui.append(el); }
      el.classList.toggle('on', closing);
      return wait(closing ? 260 : 300);
    }
    let el = this.irisEl;
    if (!el) {
      el = this.irisEl = h('div.iris', {}, h('div.iris-hole'));
      this.ui.append(el);
    }
    el.classList.add('on');
    el.classList.toggle('closed', !closing);
    void el.offsetWidth;
    el.classList.toggle('closed', closing);
    if (closing) this.sfx('shutter');
    return wait(closing ? 380 : 420).then(() => { if (!closing) el.classList.remove('on'); });
  }

  /** Portrait on a touch screen: draw the landscape stage turned 90°, so the
   *  game can be played sideways even when the phone's rotation is locked. */
  get rotated() { return this.root.classList.contains('rotated'); }

  /** Viewport (client) point -> coordinates inside the stage. */
  toLocal(cx, cy) {
    if (this.rotated) return [cy, window.innerWidth - cx];
    const r = this.root.getBoundingClientRect();
    return [cx - r.left, cy - r.top];
  }

  /** An element's box in stage coordinates (transform-safe). */
  localRect(el) {
    let x = 0, y = 0, n = el;
    while (n && n !== this.root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
  }

  get width() { return this.root.clientWidth; }
  get height() { return this.root.clientHeight; }

  resize() {
    const portraitTouch = window.innerHeight > window.innerWidth && matchMedia('(hover: none)').matches;
    this.root.classList.toggle('rotated', portraitTouch);
    if (portraitTouch) {
      Object.assign(this.root.style, { width: `${window.innerHeight}px`, height: `${window.innerWidth}px`, transform: `translateX(${window.innerWidth}px) rotate(90deg)` });
    } else {
      Object.assign(this.root.style, { width: '', height: '', transform: '' });
    }
    const cs = getComputedStyle(this.safeProbe);
    this.safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const w = this.root.clientWidth, h2 = this.root.clientHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h2 * this.dpr);
    this.screen?.resize?.(w, h2);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this.screen?.update?.(dt);
      if (this.screen?.usesCanvas && this.view?.ready) {
        this.view.update(dt);
        this.view.draw();
      }
    } catch (err) {
      // never let one bad frame freeze the game
      if (!this._loggedErr) { console.error(err); this._loggedErr = true; }
    }
  }

  // ------------------------------------------------ sheets & modals ---
  /** Bottom sheet. Returns {el, close, closed(promise)}. */
  sheet(content, { cls = '', onClose, dismissable = true } = {}) {
    this.clearToasts(); // a pop-up must never cover the sheet it pointed at
    const overlay = h('div.overlay');
    const close = h('button.iconbtn.close', { 'aria-label': 'Close' });
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const sheet = h(`div.sheet.card.paper${cls ? '.' + cls : ''}`, {}, dismissable ? close : null, content);
    this.ui.append(overlay, sheet);
    this.sfx('ui.open');
    requestAnimationFrame(() => { overlay.classList.add('show'); sheet.classList.add('show'); });
    let resolve;
    const closed = new Promise((r) => (resolve = r));
    let done = false;
    const doClose = (val) => {
      if (done) return;
      done = true;
      this.sfx('ui.close');
      overlay.classList.remove('show');
      sheet.classList.remove('show');
      setTimeout(() => { overlay.remove(); sheet.remove(); }, 400);
      onClose?.(val);
      resolve(val);
    };
    if (dismissable) {
      overlay.addEventListener('click', () => doClose());
      close.addEventListener('click', () => doClose());
    }
    return { el: sheet, close: doClose, closed };
  }

  modal(content, { cls = '', dismissable = true } = {}) {
    this.clearToasts();
    const overlay = h('div.overlay');
    const box = h(`div.modal${cls ? '.' + cls : ''}`, {}, content);
    this.ui.append(overlay, box);
    this.sfx('ui.open');
    requestAnimationFrame(() => { overlay.classList.add('show'); box.classList.add('show'); });
    let resolve;
    const closed = new Promise((r) => (resolve = r));
    let done = false;
    const close = (val) => {
      if (done) return;
      done = true;
      overlay.classList.remove('show');
      box.classList.remove('show');
      setTimeout(() => { overlay.remove(); box.remove(); }, 350);
      resolve(val);
    };
    if (dismissable) overlay.addEventListener('click', () => close());
    return { el: box, close, closed };
  }

  clearToasts() {
    for (const t of this.toasts.children) { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }
  }

  toast(content, { ms = 2600, cls = '' } = {}) {
    const el = h(`div.toast.card${cls ? '.' + cls : ''}`, {}, content);
    this.toasts.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
    return el;
  }
}
