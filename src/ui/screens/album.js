// The journal: the story of the village's restoration, one page per place
// with the postcard of every visit (before and after), and the letters the
// village has written. Optional collections sit in their own tabs, clearly
// separate: weather postcards from photo walks, the scrapbook of keepsakes
// and the Daily Postcard diary.

import { h, icon, CONDITION_ICONS } from '../dom.js';
import { topBar } from '../components/topbar.js';
import { postcardEl, beforeAfter } from '../components/postcard.js';
import { goMap } from '../flows.js';
import { renderPostcard } from '../../render/stills.js';
import { postcardNote } from '../../core/notes.js';
import { introduced, placeStatus, placesRestored, visitsOf } from '../../core/progression.js';
import { showLetter } from '../components/letter.js';

const CONDS = ['clear', 'golden', 'mist', 'dusk', 'storm'];

export class AlbumScreen {
  constructor(app, tab = 'journal') {
    this.app = app;
    this.tab = tab;
    this.stamps = introduced(app.save, app.content, 'walks');
    this.body = h('div.album-body');
    const tabs = ['journal', introduced(app.save, app.content, 'walks') && 'weather', introduced(app.save, app.content, 'collectibles') && 'scrapbook',
      introduced(app.save, app.content, 'daily') && 'diary', 'letters'].filter(Boolean);
    const names = { journal: 'Journal', weather: 'Weather postcards', scrapbook: 'Scrapbook', diary: 'Daily Diary', letters: 'Letters' };
    this.tabs = h('div.album-tabs',
      tabs.map((t) => h('button.album-tab' + (t === tab ? '.on' : ''), { 'data-tab': t, onclick: () => this.switch(t) }, names[t])),
    );
    this.el = h('div.album',
      topBar(app, { back: () => goMap(app) }).el,
      h('div.album-cover', h('div.script.album-title', { text: 'My Journal' }), h('div.label', { text: app.v.name }), this.tabs),
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
    ({ journal: () => this.renderJournal(), weather: () => this.renderWeather(), scrapbook: () => this.renderScrapbook(), diary: () => this.renderDiary(), letters: () => this.renderLetters() })[this.tab]();
  }

  thumb(sid, entry, width = 200) {
    const ph = h('div.as-photo', h('div.as-loading'));
    renderPostcard(this.app, sid, entry, { width }).then(({ after }) => { ph.innerHTML = ''; ph.append(h('img', { src: after, alt: '' })); });
    return ph;
  }

  // -------------------------------------------------------------- journal --
  renderJournal() {
    const app = this.app, v = app.v, c = app.content;
    const pr = placesRestored(app.save, c, app.village);
    this.body.append(h('div.album-summary.row',
      h('div.ms-dots', Array.from({ length: pr.total }, (_, i) => h('i' + (i < pr.done ? '.on' : '')))),
      h('span.hand', { text: `${pr.done} of ${pr.total} places restored` }),
      app.vs.judged ? h('button.btn.small.mustard', { onclick: async () => { const { JudgingScreen } = await import('./judging.js'); app.show(new JudgingScreen(app, null, { replay: true }), { transition: 'iris' }); } }, icon('rosette'), h('span', { text: 'The judging again' })) : null,
    ));
    for (const sid of v.sceneOrder) {
      const st = placeStatus(app.save, c, app.village, sid);
      if (!st.open) continue;
      const scene = v.scenes[sid];
      const visits = visitsOf(c, app.village).filter((x) => x.scene === sid);
      const cards = visits.map((visit) => {
        const entry = app.vs.journal[visit.id];
        const done = !!app.vs.visits[visit.id];
        if (!entry) {
          return h('div.album-slot.journal-slot' + (done ? '.filled' : ''),
            h('div.as-empty', icon(done ? 'check' : visit.kind === 'committee' ? 'notice' : 'camera')),
            h('div.as-label', { text: done ? visit.title : `Still to come: ${visit.title}` }));
        }
        return h('button.album-slot.journal-slot.filled', { onclick: () => this.openPostcard(sid, entry, { title: visit.title, improved: visit.improved }) },
          this.thumb(sid, entry), h('div.as-label', { text: visit.title }));
      });
      this.body.append(h('div.album-page.journal-page.card.paper' + (st.restored ? '.restored' : ''),
        h('div.ap-head', h('div.display.ap-name', { text: scene.name }),
          h('span.label' + (st.restored ? '.ap-restored' : '.muted'), { text: st.restored ? 'Restored' : st.stage || 'Not visited yet' })),
        !st.restored && st.todo ? h('div.ap-todo', { text: st.todo }) : null,
        h('div.album-slots', cards),
      ));
    }
  }

  // -------------------------------------------------------------- weather --
  renderWeather() {
    const app = this.app, v = app.v, c = app.content;
    let filled = 0, total = 0;
    for (const sid of v.sceneOrder) {
      const st = placeStatus(app.save, c, app.village, sid);
      const ss = app.vs.scenes[sid];
      if (!st.visited && !Object.keys(ss.album).length) continue;
      const slots = [...CONDS, 'mastered'].map((cid) => {
        total++;
        const e = ss.album[cid];
        if (e) filled++;
        const gold = cid === 'mastered';
        return h('button.album-slot' + (e ? '.filled' : '') + (gold ? '.gold' : ''), { onclick: () => e && this.openPostcard(sid, e, { weather: true }) },
          e ? this.thumb(sid, e, 180) : h('div.as-empty', gold ? icon('rosette') : icon(CONDITION_ICONS[cid])),
          h('div.as-label.label', { text: gold ? 'Every weather' : c.conditions[cid].name }),
          e ? h('div.as-stamps', { text: '★'.repeat(e.stamps) }) : null,
        );
      });
      this.body.append(h('div.album-page.card.paper',
        h('div.ap-head', h('div.display.ap-name', { text: v.scenes[sid].name }), h('span.label.muted', { text: `${Object.keys(ss.album).length} / 6` })),
        h('div.album-slots', slots),
      ));
    }
    this.body.prepend(h('div.album-summary.hand', { text: total ? `${filled} weather postcards · just for fun, whenever you fancy a photo walk` : 'Photo walks are optional: take one from any place you’ve visited on the map.' }));
  }

  async openPostcard(sid, entry, { title = null, improved = null, weather = false } = {}) {
    const app = this.app;
    const scene = app.content.scene(app.village, sid);
    const imgs = await renderPostcard(app, sid, entry, { width: 720, before: true });
    const pc = postcardEl(app, { photo: imgs.after, sceneName: scene.name, condition: entry.condition, date: entry.date, frame: weather && entry.tier === 5 ? 'frame-gilt' : undefined });
    beforeAfter(app, pc, imgs.before, { auto: false }).set(1);
    const note = postcardNote(app.content, app.village, sid, entry);
    const back = h('div.pc-back.card.paper',
      h('div.pcb-left.hand',
        h('p', { text: `Dear ${note.to},` }),
        improved ? h('p', { text: `${improved}!` }) : null,
        note.lines.map((l) => h('p', { text: l })),
        h('p.pcb-sig', { text: note.signature }),
      ),
      h('div.pcb-right',
        h('div.pcb-stamp.stamp', h('div.inner', h('img', { src: app.assets.spriteUrl('ui/postcard-stamp', 'common', 0.45) }))),
        h('div.pcb-lines', h('i'), h('i'), h('i'), h('i')),
        weather && entry.stamps ? h('div.pcb-meta.label', { text: `${'★'.repeat(entry.stamps)}  ·  ${entry.score.toLocaleString('en-GB')} pts  ·  ${entry.time}s` }) : null,
      ),
    );
    const flipper = h('div.flipper', h('div.flip-front', pc), h('div.flip-back', back));
    const flipBtn = h('button.btn.small.teal', { onclick: () => { app.sfx('page'); flipper.classList.toggle('flipped'); } }, icon('flip'), h('span', { text: 'Turn over' }));
    app.modal(h('div.postcard-view', flipper, h('div.pv-hint.hand', { text: title ? `${title} · drag across the photo for before and after` : 'Drag across the photo to see the before and after.' }), flipBtn), { cls: 'pv-modal' });
  }

  // ------------------------------------------------------------ scrapbook --
  renderScrapbook() {
    const app = this.app;
    const owned = app.save.collect.owned;
    for (const set of app.v.collectibles.sets) {
      const have = set.items.filter((i) => owned[i.id]).length;
      const complete = have === set.items.length;
      this.body.append(h('div.scrap-page.card.paper' + (complete ? '.complete' : ''),
        h('div.ap-head', h('div.display.ap-name', { text: set.name }), h('span.label' + (complete ? '' : '.muted'), { text: complete ? 'Complete!' : `${have} / ${set.items.length}` })),
        h('div.scrap-items', set.items.map((it, i) => {
          const got = !!owned[it.id];
          return h('button.scrap-item' + (got ? '.got' : ''), {
            style: { transform: `rotate(${[-4, 3, -2, 5, -3][i % 5]}deg)` },
            onclick: () => (got ? this.itemDetail(it, set) : app.toast('Not found yet. Keep an eye out for a glint in the scenes!', { ms: 2200 })),
          },
            h('img', { src: app.assets.spriteUrl(it.sprite, app.village, 0.45), alt: '' }),
            h('div.si-name', { text: got ? it.name : '?' }),
            got && owned[it.id] > 1 ? h('span.si-count', { text: `×${owned[it.id]}` }) : null,
            got ? h('i.tape.si-tape') : null,
          );
        })),
        h('div.scrap-reward.row', icon(complete ? 'check' : 'sparkle'), h('span', { text: `Set reward: ${rewardName(app, set.reward.cosmetic)}` })),
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
      h('div.row', icon('calendar'), h('div', h('div.display', { text: `${app.save.daily.days || 0} Daily Postcard${app.save.daily.days === 1 ? '' : 's'}` }), h('div.label.muted', { text: 'Every day you play adds a stamp' }))),
      h('p.hand', { text: 'A new photo walk every day, the same for everyone. There’s no streak to keep.' }),
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

  // -------------------------------------------------------------- letters --
  renderLetters() {
    const app = this.app, v = app.v;
    const L = v.letters;
    const letters = [
      { from: 'editor', ...L.intro },
      { from: 'colonel', ...L.welcome },
      ...Object.entries(v.villagers).flatMap(([id, vg]) => (vg.letters || []).map((body, i) => ({ from: id, title: `From ${vg.short}`, body, key: `${id}:${i + 1}` })))
        .filter((l) => app.save.requests.letters[l.key]),
      ...(app.vs.judged ? [{ from: 'postman', ...L.teaser }, { from: 'editor', ...L.finale }] : []),
    ];
    this.body.append(h('div.album-summary.hand', { text: 'Letters from the village. Tap one to read it.' }));
    this.body.append(h('div.letter-list', letters.map((l) => {
      const who = v.villagers[l.from];
      return h('button.letter-item.card.paper', { onclick: () => { this.app.sfx('page'); showLetter(app, { ...l, button: 'Close' }); } },
        who ? h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }) : null,
        h('div', h('div.display.li-title', { text: l.title }), h('div.label.muted', { text: who ? who.name : 'Wold & Vale Postcard Co.' })),
      );
    })));
  }
}

function rewardName(app, id) {
  const c = app.content.cosmetics;
  return c.frames[id]?.name || c.films[id]?.name || c.postmarks[id]?.name || 'a keepsake';
}
