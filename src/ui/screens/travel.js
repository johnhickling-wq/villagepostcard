// The Travel Office: railway posters for every village pack. The first
// village is free; the others show how a cheap pack purchase will look.
// (No real purchasing is wired up; `purchase()` is the hook for StoreKit.)

import { h, icon } from '../dom.js';
import { topBar } from '../components/topbar.js';
import { goMap } from '../flows.js';
import { bloom } from '../../core/progression.js';

export class TravelScreen {
  constructor(app, focus = null) {
    this.app = app;
    this.focus = focus;
    const idx = app.content.index;
    this.track = h('div.posters');
    for (const v of idx.villages) this.track.append(this.poster(v));
    const bundle = idx.bundle;
    this.el = h('div.travel',
      topBar(app, { back: () => goMap(app) }).el,
      h('div.travel-scroll',
        h('div.travel-head',
          h('div.label.muted-light', { text: 'Wold & Vale Postcard Co.' }),
          h('div.display.travel-title', { text: 'The Travel Office' }),
          h('div.hand.travel-sub', { text: 'Tickets to picture-perfect places. Your level, album and keepsakes travel with you.' }),
        ),
        this.track,
        h('div.bundle.card.paper',
          h('div.bundle-left',
            h('div.label', { text: 'Best value' }),
            h('div.display.bundle-name', { text: bundle.name }),
            h('div.bundle-note', { text: bundle.note }),
          ),
          h('button.ticket-btn', { onclick: () => this.buy({ name: bundle.name, price: bundle.price, productId: bundle.productId }) },
            h('span.tb-price.display', { text: bundle.price }), h('span.label', { text: 'Buy tickets' })),
        ),
        h('div.travel-foot',
          h('button.link', { onclick: () => app.toast('Nothing to restore yet. Purchases made on this Apple ID will reappear here.', { ms: 3000 }) }, 'Restore purchases'),
          h('div.label.muted-light', { text: 'One-off purchases · no subscriptions · no ads' }),
        ),
      ),
    );
  }

  enter() {
    if (this.focus) {
      const el = this.track.querySelector(`[data-village="${this.focus}"]`);
      el?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }

  poster(v) {
    const app = this.app;
    const owned = v.playable || app.save.purchases[v.id];
    const img = app.assets.imageUrl(v.poster, v.posterPack === 'common' ? null : v.posterPack);
    const regionWord = v.region.replace(/^The /, '').toUpperCase();
    let foot;
    if (v.playable) {
      const b = Math.round(bloom(app.save, app.content, v.id) * 100);
      foot = h('div.poster-foot',
        h('div.label', { text: 'You are here · Free' }),
        h('div.bloom.row', h('span.label', { text: 'Bloom' }), h('div.bloom-bar', h('i', { style: { width: `${b}%` } })), h('span.display', { text: `${b}%` })),
        h('button.btn.teal.small', { onclick: () => goMap(app) }, icon('map'), h('span', { text: 'Back to the village' })),
      );
    } else {
      foot = h('div.poster-foot',
        h('ul.features', v.features.map((f) => h('li', { text: f }))),
        h('button.ticket-btn', { onclick: () => this.buy(v) }, h('span.tb-price.display', { text: v.price }), h('span.label', { text: v.status === 'Coming soon' ? 'Pre-order ticket' : 'Buy ticket' })),
      );
    }
    return h('div.poster-card', { 'data-village': v.id },
      h('div.poster' + (owned ? '' : '.locked'),
        h('img', { src: img, alt: '' }),
        h('div.poster-band.top', h('div.poster-region.display', { text: regionWord }), h('div.script.poster-name', { text: v.name })),
        h('div.poster-band.bottom.label', { text: 'Go by train · Wold & Vale Railway' }),
        !owned ? h('div.poster-status.stamp', h('div.inner.label', { text: v.status })) : null,
      ),
      h('div.hand.poster-tag', { text: v.tagline }),
      foot,
    );
  }

  buy(item) {
    const app = this.app;
    app.sfx('ui.open');
    const buyBtn = h('button.btn', h('span', { text: `Buy for ${item.price}` }));
    const m = app.modal(h('div.purchase.card.paper.deckle',
      h('div.ticket',
        h('div.ticket-left', h('div.label', { text: 'Wold & Vale Railway' }), h('div.display.ticket-to', { text: 'Single to' }), h('div.script.ticket-dest', { text: item.name }), h('div.label.muted', { text: 'Class: Picture Perfect' })),
        h('div.ticket-right', h('div.display.ticket-price', { text: item.price }), h('div.label', { text: 'Adult' })),
      ),
      h('p.purchase-note', { text: 'Unlocks the village forever: 8 new scenes, villagers, scrapbook sets and weather. Your level and album come with you.' }),
      buyBtn,
      h('button.link', { onclick: () => m.close() }, 'Not today'),
    ), { cls: 'purchase-modal' });
    buyBtn.addEventListener('click', () => {
      m.close();
      this.purchase(item);
    });
  }

  /** Hook for the native store (StoreKit via Capacitor). Preview build: explain. */
  purchase(item) {
    const app = this.app;
    app.sfx('stamp');
    app.modal(h('div.celebrate.card.paper.deckle',
      h('div.label.muted', { text: 'Preview build' }),
      h('div.display.celebrate-title', { text: 'Tickets aren’t on sale just yet' }),
      h('p.hand', { text: `This is how buying ${item.name} will look. When the village pack is ready, this button will open the App Store and unlock it straight away.` }),
    ));
  }
}
