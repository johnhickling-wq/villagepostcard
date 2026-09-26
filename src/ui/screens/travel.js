// The Travel Office: railway posters for every village. Only the free
// village is playable. The others are shown honestly as "in preparation":
// nothing here can be bought until a village is finished and the platform's
// real purchase, restore and entitlement flow is wired in (see
// docs/RELEASE_BLOCKERS.md). Staying in the village is always the obvious choice.

import { h, icon } from '../dom.js';
import { topBar } from '../components/topbar.js';
import { goMap } from '../flows.js';
import { placesRestored } from '../../core/progression.js';

export class TravelScreen {
  constructor(app, focus = null) {
    this.app = app;
    this.focus = focus;
    this.track = h('div.posters');
    for (const v of app.content.index.villages) this.track.append(this.poster(v));
    this.el = h('div.travel',
      topBar(app, { back: () => goMap(app) }).el,
      h('div.travel-scroll',
        h('div.travel-head',
          h('div.label.muted-light', { text: 'Wold & Vale Postcard Co.' }),
          h('div.display.travel-title', { text: 'The Travel Office' }),
          h('div.hand.travel-sub', { text: 'Other villages would love a visit one day. None is ready for travellers yet.' }),
        ),
        this.track,
        h('div.travel-foot',
          h('button.btn.teal', { onclick: () => { app.sfx('ui.tap'); goMap(app); } }, icon('home'), h('span', { text: `Stay in ${app.v.short}` })),
          h('div.label.muted-light', { text: 'When a village is ready it will be a one-off purchase: no subscriptions, no ads, nothing sold while you play.' }),
        ),
      ),
    );
  }

  enter() {
    if (this.focus) this.track.querySelector(`[data-village="${this.focus}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  poster(v) {
    const app = this.app;
    const img = app.assets.imageUrl(v.poster, v.posterPack === 'common' ? null : v.posterPack);
    const regionWord = v.region.replace(/^The /, '').toUpperCase();
    let foot;
    if (v.playable) {
      const pr = placesRestored(app.save, app.content, v.id);
      foot = h('div.poster-foot',
        h('div.label', { text: 'You are here · Free' }),
        h('div.milestone.row', h('div.ms-dots', Array.from({ length: pr.total }, (_, i) => h('i' + (i < pr.done ? '.on' : '')))), h('span.ms-text', { text: `${pr.done} of ${pr.total} places restored` })),
      );
    } else {
      foot = h('div.poster-foot',
        h('ul.features', v.features.map((f) => h('li', { text: f }))),
        h('div.poster-soon.label', { text: 'In preparation · not yet on sale' }),
      );
    }
    return h('div.poster-card', { 'data-village': v.id },
      h('div.poster' + (v.playable ? '' : '.locked'),
        h('img', { src: img, alt: '' }),
        h('div.poster-band.top', h('div.poster-region.display', { text: regionWord }), h('div.script.poster-name', { text: v.name })),
        h('div.poster-band.bottom.label', { text: 'Go by train · Wold & Vale Railway' }),
        !v.playable ? h('div.poster-status.stamp', h('div.inner.label', { text: v.status })) : null,
      ),
      h('div.hand.poster-tag', { text: v.tagline }),
      foot,
    );
  }
}
