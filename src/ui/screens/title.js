import { h } from '../dom.js';
import { logo } from '../components/logo.js';
import { startGame } from '../flows.js';

/** Title: the fully restored High Street at golden hour, drifting gently. */
export class TitleScreen {
  constructor(app) {
    this.app = app;
    this.usesCanvas = true;
    this.t = 0;
    const v = app.v;
    this.el = h('div.title',
      h('div.title-shade'),
      h('div.title-top', logo(1)),
      h('div.title-sub',
        h('div.script.title-village', { text: v.name }),
        h('div.label', { text: `${v.region} · ${v.year}` }),
      ),
      h('div.title-bottom',
        h('div.title-tap.display.pulse', { text: app.save.flags.intro ? 'Tap to carry on' : 'Tap to begin' }),
        h('div.label.muted-light', { text: 'Wold & Vale Postcard Co. · Est. 1931' }),
      ),
    );
    this.el.addEventListener('click', () => this.go(), { once: true });
  }

  async enter() {
    const app = this.app;
    // the High Street in its Sunday best: every restoration layer, golden light
    const scene = app.content.scene(app.village, 'high-street');
    const all = (scene.restoration || []).map((r) => r.effect);
    await app.view.load({ village: app.village, scene: 'high-street', mess: null, effects: all, bloom: 1, condition: 'golden' });
    app.view.reduced = app.reducedMotion;
    this.resize();
  }

  resize() {
    this.app.view.setView(0, 0, this.app.width, this.app.height, { cover: true });
    this.app.view.cam.zoom = 1.08;
    this.app.view.clampCam();
  }

  update(dt) {
    this.t += dt;
    const view = this.app.view;
    if (!view.ready || this.app.reducedMotion) return;
    // slow Ken Burns drift up the street
    view.cam.zoom = 1.08 + 0.06 * Math.sin(this.t * 0.05);
    view.cam.x = view.W / 2 + Math.sin(this.t * 0.07) * 60;
    view.cam.y = view.H * 0.52 + Math.sin(this.t * 0.04) * 90;
    view.clampCam();
  }

  go() {
    this.app.audio.unlock();
    this.app.applySettings();
    this.app.sfx('whistle');
    this.app.audio.startMusic('map');
    startGame(this.app);
  }
}
