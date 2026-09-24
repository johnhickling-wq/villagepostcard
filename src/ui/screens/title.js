import { h } from '../dom.js';
import { logo } from '../components/logo.js';
import { startGame } from '../flows.js';

export class TitleScreen {
  constructor(app) {
    this.app = app;
    const v = app.v;
    const bg = h('div.title-bg', { style: { backgroundImage: `url(${app.assets.imageUrl('plate/high-street', app.village)})` } });
    this.el = h('div.title',
      bg,
      h('div.title-shade'),
      h('div.title-top', logo(1)),
      h('div.title-sub',
        h('div.script.title-village', { text: v.name }),
        h('div.label', { text: `${v.region} · ${v.year}` }),
      ),
      h('div.title-bottom',
        h('div.title-tap.display.pulse', { text: app.save.flags.intro ? 'Tap to continue' : 'Tap to begin' }),
        h('div.label.muted-light', { text: 'Wold & Vale Postcard Co. · Est. 1931' }),
      ),
    );
    this.el.addEventListener('click', () => this.go(), { once: true });
  }

  go() {
    this.app.audio.unlock();
    this.app.applySettings();
    this.app.sfx('whistle');
    this.app.audio.startMusic('map');
    startGame(this.app);
  }
}
