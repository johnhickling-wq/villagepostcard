// Restoration moment: the villagers' project arrives in the scene live, or a
// newly opened scene is revealed behind torn-away paper.

import { h, icon, wait } from '../dom.js';
import { bloom } from '../../core/progression.js';
import { goMap } from '../flows.js';

export class RestoreScreen {
  constructor(app, projectId, events) {
    this.app = app;
    this.usesCanvas = true;
    this.project = app.v.projects.find((p) => p.id === projectId);
    this.unlock = events.find((e) => e.kind === 'sceneUnlocked')?.scene || null;
    this.events = events;
    const who = app.v.villagers[this.project.villager];
    this.banner = h('div.restore-banner.card.paper.hidden',
      h('img.rb-portrait', { src: app.assets.spriteUrl(who.portrait, app.village, 0.35), alt: '' }),
      h('div', h('div.label.muted', { text: this.unlock ? 'Now open' : 'Restored' }),
        h('div.display.rb-title', { text: this.unlock ? app.content.scene(app.village, this.unlock).name : this.project.name }),
        h('div.hand.rb-quote', { text: `“${who.thanks[this.project.cost % who.thanks.length]}” — ${who.short}` })),
    );
    this.bloomEl = h('div.restore-bloom.card.paper.hidden', h('span.label', { text: 'Village Bloom' }), h('div.bloom-bar', h('i')), h('span.display.bloom-num'));
    this.btn = h('button.btn.big.teal.hidden', { text: 'Lovely!', onclick: () => this.done() });
    this.cover = this.unlock ? h('div.tear-cover', h('div.tear.left.paper'), h('div.tear.right.paper'), h('div.tear-text.display', { text: 'Clearing the way…' })) : null;
    this.el = h('div.restore.passthrough', this.cover, h('div.restore-side', this.banner, this.bloomEl, h('div.restore-foot', this.btn)));
  }

  async enter() {
    const app = this.app, view = app.view;
    const projects = [...Object.keys(app.vs.projects)];
    const sceneId = this.unlock || this.project.scene;
    const before = this.unlock ? projects : projects.filter((p) => p !== this.project.id);
    await view.load({ village: app.village, scene: sceneId, mess: null, projects: before, condition: 'golden' });
    this.layout();
    app.audio.startAmbience(app.content.scene(app.village, sceneId).ambience || []);
    this.run();
  }

  exit() { this.app.audio.stopAmbience(); }
  resize() { this.layout(); }
  /** The scene on the left, the villager's thanks on the right. */
  layout() {
    const r = this.app.root.getBoundingClientRect();
    const sf = this.app.safe;
    const side = Math.min(320, Math.max(220, r.width * 0.3));
    const x0 = sf.l + 12, y0 = sf.t + 12;
    this.app.view.setView(x0, y0, r.width - sf.r - side - 24 - x0, r.height - sf.b - 12 - y0);
    this.el.style.setProperty('--side', `${side}px`);
  }

  async run() {
    const app = this.app, view = app.view;
    const prevBloom = Math.round((bloom(app.save, app.content, app.village) - 1 / app.v.projects.length) * 100);
    await wait(500);
    if (this.unlock) {
      app.sfx('page');
      app.sfx('fix.pluck');
      this.cover.classList.add('open');
      await wait(700);
      app.sfx('unlock');
      view.particles.burst('confetti', view.W / 2, view.H * 0.3, { n: 60 });
      app.haptic('success');
    } else {
      await view.playRestore(this.project.id);
      app.sfx('restore');
      app.haptic('success');
      await wait(900);
      view.particles.burst('confetti', view.W / 2, view.H * 0.25, { n: 40 });
    }
    this.banner.classList.remove('hidden');
    this.banner.classList.add('pop-in');
    await wait(600);
    const b = Math.round(bloom(app.save, app.content, app.village) * 100);
    this.bloomEl.classList.remove('hidden');
    this.bloomEl.classList.add('fade-in');
    const bar = this.bloomEl.querySelector('i');
    const num = this.bloomEl.querySelector('.bloom-num');
    bar.style.width = `${prevBloom}%`;
    num.textContent = `${prevBloom}%`;
    await wait(300);
    bar.style.width = `${b}%`;
    num.textContent = `${b}%`;
    app.sfx('xp', { k: 1 });
    await wait(700);
    this.btn.classList.remove('hidden');
    this.btn.classList.add('pop-in');
  }

  done() {
    this.app.sfx('ui.tap');
    goMap(this.app, { transition: 'iris', unlocked: this.unlock, focus: this.unlock || this.project.scene, events: this.events });
  }
}
