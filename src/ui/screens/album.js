// The album: a page of postcards per scene (one slot per weather condition,
// plus a gold Mastered edition), the scrapbook of keepsakes, and the diary
// of Daily Postcards.

import { h, icon, CONDITION_ICONS } from '../dom.js';
import { topBar } from '../components/topbar.js';
import { postcardEl, beforeAfter } from '../components/postcard.js';
import { goMap } from '../flows.js';
import { renderPostcard } from '../../render/stills.js';
import { postcardNote } from '../../core/notes.js';
import { sceneUnlocked, introduced } from '../../core/progression.js';

const CONDS = ['clear', 'golden', 'mist', 'dusk', 'storm'];

export class AlbumScreen {
  constructor(app, tab = 'postcards') {
    this.app = app;
    this.tab = tab;
    this.stamps = introduced(app.save, app.content, 'score');
    this.body = h('div.album-body');
    // the scrapbook and the diary appear with keepsakes and the Daily Postcard
    const tabs = ['postcards', introduced(app.save, app.content, 'collectibles') && 'scrapbook', introduced(app.save, app.content, 'daily') && 'diary'].filter(Boolean);
    this.tabs = h('div.album-tabs',
      tabs.map((t) => h('button.album-tab' + (t === tab ? '.on' : ''), { 'data-tab': t, onclick: () => this.switch(t) },
        { postcards: 'Postcards', scrapbook: 'Scrapbook', diary: 'Daily Diary' }[t])),
    );
    this.el = h('div.album',
      topBar(app, { back: () => goMap(app) }).el,
      h('div.album-cover', h('div.script.album-title', { text: 'My Album' }), h('div.label', { text: app.v.name }), this.tabs),
      this.body,
    );
    this.render();
  }

  switch(t) {
    this.app.sfx('page');
    this.tab = t;
    this.tabs.querySelectorAll('.album-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    this.render();
  }

  render() {
    this.body.innerHTML = '';
    this.body.scrollTop = 0;
    if (this.tab === 'postcards') this.renderPostcards();
    else if (this.tab === 'scrapbook') this.renderScrapbook();
    else this.renderDiary();
  }

  // ------------------------------------------------------------ postcards --
  renderPostcards() {
    const app = this.app, v = app.v;
    const vs = app.vs;
    let total = 0, filled = 0;
    for (const sid of v.sceneOrder) {
      const scene = v.scenes[sid];
      const ss = vs.scenes[sid];
      const open = sceneUnlocked(app.save, app.content, app.village, sid);
      const slots = [...CONDS, 'mastered'].map((cid) => {
        total++;
        const e = ss.album[cid];
        if (e) filled++;
        const gold = cid === 'mastered';
        const slot = h('button.album-slot' + (e ? '.filled' : '') + (gold ? '.gold' : ''), {
          onclick: () => e && this.openPostcard(sid, e),
        },
          e ? h('div.as-photo', h('div.as-loading')) : h('div.as-empty', gold ? icon('rosette') : icon(CONDITION_ICONS[cid])),
          h('div.as-label.label', { text: gold ? 'Mastered' : app.content.conditions[cid].name }),
          e && this.stamps ? h('div.as-stamps', { text: '★'.repeat(e.stamps) }) : null,
        );
        if (e) {
          renderPostcard(app, sid, e, { width: 180 }).then(({ after }) => {
            const ph = slot.querySelector('.as-photo');
            ph.innerHTML = '';
            ph.append(h('img', { src: after, alt: '' }));
          });
        }
        return slot;
      });
      this.body.append(h('div.album-page.card.paper' + (open ? '' : '.closed'),
        h('div.ap-head', h('div.display.ap-name', { text: scene.name }), h('span.label.muted', { text: `${Object.keys(ss.album).length} / 6` })),
        open ? h('div.album-slots', slots) : h('div.hand.ap-closed', { text: 'Not yet visited. Restore the way there on the map.' }),
      ));
    }
    this.body.prepend(h('div.album-summary.hand', { text: `${filled} of ${total} postcards collected` }));
    // future villages: empty pages that tease the next assignment
    for (const other of app.content.index.villages.filter((x) => !x.playable)) {
      this.body.append(h('div.album-page.card.paper.future',
        h('div.ap-head', h('div.display.ap-name', { text: other.name }), h('span.label.muted', { text: other.region })),
        h('div.album-slots', Array.from({ length: 6 }, () => h('div.album-slot.ghost', h('div.as-empty', icon('lock'))))),
        h('button.btn.small.mustard', { onclick: async () => { const { TravelScreen } = await import('./travel.js'); app.show(new TravelScreen(app, other.id)); } }, icon('train'), h('span', { text: 'Travel office' })),
      ));
    }
  }

  async openPostcard(sid, entry) {
    const app = this.app;
    const scene = app.content.scene(app.village, sid);
    const imgs = await renderPostcard(app, sid, entry, { width: 720, before: true });
    const pc = postcardEl(app, { photo: imgs.after, sceneName: scene.name, condition: entry.condition, date: entry.date, frame: entry.tier === 5 ? 'frame-gilt' : undefined });
    beforeAfter(app, pc, imgs.before, { auto: false }).set(1);
    const note = postcardNote(app.content, app.village, sid, entry);
    const back = h('div.pc-back.card.paper',
      h('div.pcb-left.hand',
        h('p', { text: `Dear ${note.to},` }),
        note.lines.map((l) => h('p', { text: l })),
        h('p.pcb-sig', { text: note.signature }),
      ),
      h('div.pcb-right',
        h('div.pcb-stamp.stamp', h('div.inner', h('img', { src: app.assets.spriteUrl('ui/postcard-stamp', 'common', 0.45) }))),
        h('div.pcb-lines', h('i'), h('i'), h('i'), h('i')),
        this.stamps ? h('div.pcb-meta.label', { text: `${'★'.repeat(entry.stamps)}  ·  ${entry.score.toLocaleString('en-GB')} pts  ·  ${entry.time}s` }) : null,
      ),
    );
    const flipper = h('div.flipper', h('div.flip-front', pc), h('div.flip-back', back));
    const flipBtn = h('button.btn.small.teal', { onclick: () => { app.sfx('page'); flipper.classList.toggle('flipped'); } }, icon('flip'), h('span', { text: 'Turn over' }));
    app.modal(h('div.postcard-view', flipper, h('div.pv-hint.hand', { text: 'Drag across the photo to see the before and after.' }), flipBtn), { cls: 'pv-modal' });
  }

  // ------------------------------------------------------------ scrapbook --
  renderScrapbook() {
    const app = this.app;
    const sets = app.v.collectibles.sets;
    const owned = app.save.collect.owned;
    for (const set of sets) {
      const have = set.items.filter((i) => owned[i.id]).length;
      const complete = have === set.items.length;
      this.body.append(h('div.scrap-page.card.paper' + (complete ? '.complete' : ''),
        h('div.ap-head', h('div.display.ap-name', { text: set.name }), h('span.label' + (complete ? '' : '.muted'), { text: complete ? 'Complete!' : `${have} / ${set.items.length}` })),
        h('div.scrap-items', set.items.map((it, i) => {
          const got = !!owned[it.id];
          return h('button.scrap-item' + (got ? '.got' : ''), {
            style: { transform: `rotate(${[-4, 3, -2, 5, -3][i % 5]}deg)` },
            onclick: () => got ? this.itemDetail(it, set) : app.toast('Not found yet. Keep an eye out for a glint in the scenes!', { ms: 2200 }),
          },
            h('img', { src: app.assets.spriteUrl(it.sprite, app.village, 0.45), alt: '' }),
            h('div.si-name', { text: got ? it.name : '?' }),
            got && owned[it.id] > 1 ? h('span.si-count', { text: `×${owned[it.id]}` }) : null,
            got ? h('i.tape.si-tape') : null,
          );
        })),
        h('div.scrap-reward.row', icon(complete ? 'check' : 'sparkle'), h('span', { text: `Set reward: ${set.reward.fund} for the Village Fund + ${rewardName(app, set.reward.cosmetic)}` })),
      ));
    }
  }

  itemDetail(it, set) {
    const app = this.app;
    app.modal(h('div.celebrate.card.paper.deckle',
      h('div.label.muted', { text: set.name }),
      h('div.keepsake', h('img', { src: app.assets.spriteUrl(it.sprite, app.village, 0.8), alt: '' })),
      h('div.display.celebrate-title', { text: it.name }),
      h('p.hand.keepsake-text', { text: it.text }),
    ));
  }

  // ---------------------------------------------------------------- diary --
  renderDiary() {
    const app = this.app;
    const hist = Object.entries(app.save.daily.history).sort((a, b) => b[0].localeCompare(a[0]));
    this.body.append(h('div.diary-head.card.paper',
      h('div.row', icon('calendar'), h('div', h('div.display', { text: `Streak: ${app.save.daily.streak} day${app.save.daily.streak === 1 ? '' : 's'}` }), h('div.label.muted', { text: `Best ever: ${app.save.daily.best}` }))),
      h('p.hand', { text: 'A Daily Postcard is waiting every day. Everyone in the country gets the same mess!' }),
    ));
    if (!hist.length) {
      this.body.append(h('div.hand.empty-note', { text: 'No Daily Postcards yet. Tap “Daily” on the map to take your first.' }));
      return;
    }
    this.body.append(h('div.diary-list', hist.map(([date, e]) => h('div.diary-entry.card',
      h('div.display', { text: new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }),
      h('div.as-stamps', { text: '★'.repeat(e.stamps) }),
      h('div.label.muted', { text: `${e.score.toLocaleString('en-GB')} pts` }),
    ))));
  }
}

function rewardName(app, id) {
  const c = app.content.cosmetics;
  return c.frames[id]?.name || c.films[id]?.name || c.postmarks[id]?.name || 'a keepsake';
}
