// The hub: an illustrated village map. Each place you can go is a pinned
// postcard with its stage ("First tidy complete") and what's still to do;
// the ribbon along the bottom always names the one next step of the story,
// one tap away. "3 of 8 places restored" is the village's progress.

import { h, icon, CONDITION_ICONS } from '../dom.js';
import {
  placeStatus, placesRestored, nextStep, judgingReady, dailyInfo, introduced, introCardsDue, visitLabel, nextWeather,
} from '../../core/progression.js';
import { playVisit, playWalk, playDaily, judging } from '../flows.js';
import { topBar } from '../components/topbar.js';
import { renderPostcard } from '../../render/stills.js';

export class MapScreen {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.usesCanvas = false;
    this.el = h('div.map');
    this.render();
  }

  render() {
    const app = this.app, v = app.v, save = app.save;
    this.el.innerHTML = '';
    this.top = topBar(app, { onChange: () => this.render() });
    this.inner = h('div.map-inner');
    this.inner.append(h('img.map-img', { src: app.assets.imageUrl(v.map.image, app.village), alt: `Map of ${v.name}`, draggable: 'false' }));
    const pr = placesRestored(save, app.content, app.village);
    const dot = (sid) => { const st = placeStatus(save, app.content, app.village, sid); return h('i' + (st.restored ? '.on' : st.done ? '.half' : ''), { title: v.scenes[sid].name }); };
    this.cartouche = h('div.map-cartouche.card.paper',
      h('div.script.map-name', { text: v.name }),
      h('div.milestone.row', h('div.ms-dots', v.sceneOrder.map(dot)),
        h('span.ms-text', { text: `${pr.done} of ${pr.total} places restored` })),
    );
    if (!app.reducedMotion) {
      for (let i = 0; i < 3; i++) {
        this.inner.append(h('div.map-cloud', { style: { top: `${10 + i * 28}%`, width: `${120 + i * 40}px`, height: `${50 + i * 14}px`, animationDuration: `${70 + i * 25}s`, animationDelay: `${-i * 30}s`,
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%)' } }));
      }
    }
    // only the places you can go: the map fills in as the story opens it up
    this.next = nextStep(save, app.content, app.village);
    for (const sid of v.sceneOrder) if (placeStatus(save, app.content, app.village, sid).open) this.inner.append(this.pin(sid));
    if (judgingReady(save, app.content, app.village)) {
      const [MW, MH] = v.map.size;
      const [x, y] = v.map.judging || v.map.pins[v.start];
      this.inner.append(h('button.judging-btn.pulse', { style: { left: `${(x / MW) * 100}%`, top: `${(y / MH) * 100}%` }, onclick: () => judging(app) },
        icon('rosette'), h('span.display', { text: 'The judges are here!' })));
    }
    this.scroll = h('div.map-scroll', this.inner);
    this.ribbon = this.nextRibbon();
    this.nav = this.navBar();
    this.el.append(this.scroll, this.top.el, this.cartouche, this.ribbon, this.nav);
  }

  async enter() {
    const app = this.app, o = this.opts;
    const focus = o.focus || this.next.scene || o.play?.scene || app.v.start;
    requestAnimationFrame(() => this.centerOn(focus));
    const opened = (o.receipt?.events || []).filter((e) => e.kind === 'placeOpened').map((e) => e.scene);
    for (const sid of opened) setTimeout(() => this.celebrateUnlock(sid), 450);
    if (o.next || opened.length) this.ribbon.classList.add('attention');
    setTimeout(() => this.introduceFeatures(), opened.length ? 1500 : 800);
  }

  /** New features arrive one per visit to the map, each with a card and a pulsing button. */
  async introduceFeatures() {
    const app = this.app, seen = app.save.flags.seen;
    const update = app.save.flags.updated && !seen[`update:${app.save.flags.updated}`] ? 'update' : null;
    for (const f of update ? [update] : introCardsDue(app.save, app.content).slice(0, 1)) {
      if (app.screen !== this || app.ui.querySelector('.overlay')) return;
      const card = f === 'update' ? app.content.intro.updateCard : app.content.intro.cards[f];
      seen[f === 'update' ? `update:${app.save.flags.updated}` : `intro:${f}`] = true;
      app.persist();
      const btn = this.nav.querySelector(`[data-feature="${f}"]`) || (f === 'level' ? this.top.el.querySelector('.level-badge') : null);
      btn?.classList.add('just-new');
      app.sfx('unlock');
      const ok = h('button.btn.teal', { text: 'Lovely!' });
      const m = app.modal(h('div.celebrate.card.paper.deckle.intro-card',
        h('div.intro-ico.pop-in', icon(card.icon)),
        h('div.label.muted', { text: f === 'update' ? 'Welcome back' : 'Something new' }),
        h('div.display.celebrate-title', { text: card.title }),
        h('p.hand', { text: card.text }),
        h('div.celebrate-foot', ok),
      ), { dismissable: false });
      await new Promise((res) => ok.addEventListener('click', () => { app.sfx('ui.tap'); m.close(); res(); }));
    }
  }

  centerOn(sid, smooth = false) {
    const pin = this.inner.querySelector(`[data-scene="${sid}"]`);
    if (!pin) return;
    const s = this.scroll;
    const x = pin.offsetLeft + this.inner.offsetLeft - s.clientWidth / 2;
    const y = pin.offsetTop + this.inner.offsetTop - s.clientHeight / 2 + 20;
    s.scrollTo({ left: x, top: y, behavior: smooth && !this.app.reducedMotion ? 'smooth' : 'auto' });
  }

  pin(sid) {
    const app = this.app, v = app.v;
    const scene = v.scenes[sid];
    const st = placeStatus(app.save, app.content, app.village, sid);
    const [x, y] = v.map.pins[sid];
    const [MW, MH] = v.map.size;
    const thumb = app.assets.imageUrl(scene.plate, app.village, true);
    const rot = ((sid.length * 7) % 9) - 4;
    const isNext = this.next.scene === sid;
    const line = st.restored ? 'Restored' : st.progress ? `${st.progress.done.length} job${st.progress.done.length === 1 ? '' : 's'} done` : st.stage || (st.available.length ? 'Not visited yet' : '');
    const el = h('button.pin' + (st.restored ? '.restored' : '') + (isNext ? '.next' : ''), {
      'data-scene': sid, style: { left: `${(x / MW) * 100}%`, top: `${(y / MH) * 100}%`, '--rot': `${rot}deg` },
      'aria-label': `${scene.name}${line ? `: ${line}` : ''}`,
      onclick: () => { app.sfx('ui.tap'); this.placeSheet(sid); },
    },
      h('div.pin-card', h('img', { src: thumb, alt: '' })),
      h('div.pin-pushpin'),
      h('div.pin-tag', h('span.pin-name', { text: scene.name }), line ? h('span.pin-stage', { text: line }) : null),
    );
    if (st.restored) el.append(h('div.pin-rosette', icon('check')));
    // work waiting here: a flag (a committee request gets the Committee's colours)
    const avail = st.available[0];
    if (avail) el.append(h('div.pin-flag' + (isNext ? '.wiggle' : '') + (avail.kind === 'committee' ? '.committee' : ''), icon(avail.kind === 'committee' ? 'notice' : 'sparkle')));
    return el;
  }

  /** The one next step, named, one tap away. */
  nextRibbon() {
    const app = this.app, n = this.next;
    const who = n.villager ? app.v.villagers[n.villager] : app.v.villagers[app.v.finale.judge];
    const go = () => {
      app.sfx('ui.tap');
      if (n.kind === 'visit') return playVisit(app, n.visit.id);
      if (n.kind === 'judging') return judging(app);
      return this.placeSheet(this.opts.play?.scene || app.v.start);
    };
    return h('button.next-ribbon.card.paper', { onclick: go },
      h('img.nr-portrait', { src: app.assets.spriteUrl(who.portrait, app.village, 0.35), alt: '' }),
      h('div.nr-text', h('div.label.muted', { text: n.kind === 'free' ? 'Best-Kept Village' : 'Next' }), h('div.nr-label.display', { text: n.label }),
        n.text ? h('div.nr-sub', { text: n.text }) : null),
      h('div.nr-go', icon('play')),
    );
  }

  navBar() {
    const app = this.app;
    const claimable = app.save.requests.active.filter((r) => r.progress >= r.count).length;
    const daily = dailyInfo(app.save, app.content, app.village);
    const btn = (feature, name, label, onclick, badge) => (introduced(app.save, app.content, feature)
      ? h('button.nav-btn', { 'data-feature': feature, onclick: () => { app.sfx('ui.tap'); onclick(); } },
        h('div.nav-ico', icon(name), badge ? h('span.badge', { text: String(badge) }) : null), h('span.label', { text: label }))
      : null);
    return h('div.nav',
      btn('journal', 'album', 'Journal', async () => { const { AlbumScreen } = await import('./album.js'); app.show(new AlbumScreen(app)); }),
      btn('requests', 'notice', 'Notices', async () => { const { NoticeboardScreen } = await import('./noticeboard.js'); app.show(new NoticeboardScreen(app)); }, claimable),
      btn('daily', 'calendar', 'Daily', () => this.dailySheet(), daily.unlocked && !daily.done ? '!' : 0),
      btn('travel', 'train', 'Travel', async () => { const { TravelScreen } = await import('./travel.js'); app.show(new TravelScreen(app)); }),
    );
  }

  // --------------------------------------------------------------- sheets ---
  /** A place: how it stands, the visit waiting here, and (optionally) a photo walk. */
  placeSheet(sid) {
    const app = this.app, v = app.v, c = app.content;
    const scene = v.scenes[sid];
    const st = placeStatus(app.save, c, app.village, sid);
    const who = v.villagers[scene.villager];
    const visits = st.available.map((visit) => {
      const prog = app.vs.progress[visit.id];
      const label = visitLabel(app.save, c, app.village, visit);
      return h('div.visit-card.card' + (this.next.visit?.id === visit.id ? '.next' : ''),
        h('div.vc-body',
          h('div.label.muted', { text: visit.kind === 'committee' ? 'Committee request' : visit.kind === 'incident' ? 'After the storm' : v.villagers[visit.villager].short }),
          h('div.display.vc-title', { text: visit.title }),
          prog?.done?.length ? h('div.vc-progress', { text: `${prog.done.length} job${prog.done.length === 1 ? '' : 's'} done: carry on where you left off` }) : null,
        ),
        h('button.btn.teal.vc-go', { 'aria-label': label, onclick: () => { sheet.close(); playVisit(app, visit.id); } }, icon('play'), h('span', { text: prog?.done?.length ? 'Carry on' : 'Go' })),
      );
    });
    const walks = introduced(app.save, c, 'walks') && st.visited;
    const w = walks ? nextWeather(app.save, c, app.village, sid) : null;
    const journal = Object.entries(app.vs.journal).filter(([id]) => c.visit(app.village, id)?.scene === sid);
    const photos = h('div.ss-photos', journal.map(([id, entry]) => {
      const slot = h('div.ss-photo', h('div.as-loading'));
      renderPostcard(app, sid, entry, { width: 200 }).then(({ after }) => { slot.innerHTML = ''; slot.append(h('img', { src: after, alt: c.visit(app.village, id).title })); });
      return slot;
    }));
    const sheet = app.sheet(h('div.scene-sheet',
      h('div.ss-col',
        h('div.ss-thumb.card', h('img', { src: app.assets.imageUrl(scene.plate, app.village, true), alt: '' }), h('div.tape', { style: { left: '34%', top: '-10px', transform: 'rotate(-4deg)' } })),
        h('div.display.ss-name', { text: scene.name }),
        h('div.ss-stage.row', st.restored ? icon('check') : null, h('span', { text: st.restored ? 'Restored' : st.stage || 'Not visited yet' })),
        !st.restored && st.todo ? h('p.ss-todo', { text: st.todo }) : null,
        journal.length ? photos : h('p.ss-blurb', { text: scene.blurb }),
      ),
      h('div.ss-col',
        visits.length ? h('div.ss-visits', visits) : h('div.ss-quiet.hand', { text: st.restored ? `${scene.name} is looking its best.` : 'Nothing to do here just yet.' }),
        walks ? h('div.ss-walk.card',
          h('div.label.muted', { text: 'Optional · Weather postcards' }),
          h('div.row.ss-walk-row', h('span.cond-pill', icon(CONDITION_ICONS[w.condition]), h('span', { text: w.free ? 'Any weather' : w.name })),
            h('button.btn.small.mustard', { onclick: () => { sheet.close(); playWalk(app, sid); } }, icon('camera'), h('span', { text: 'Photo walk' }))),
        ) : null,
        who ? h('div.ss-villager.row', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }), h('div.hand', { text: `“${(who.thanks || [''])[sid.length % (who.thanks?.length || 1)]}” — ${who.short}` })) : null,
      ),
    ), { cls: 'wide' });
  }

  dailySheet() {
    const app = this.app;
    const d = dailyInfo(app.save, app.content, app.village);
    if (!d.unlocked) return;
    const scene = app.content.scene(app.village, d.scene);
    const cond = app.content.conditions[d.condition];
    const filled = d.done ? d.cardDay : d.cardDay - 1;
    const card = d.card.map((r, i) => h('div.streak-day' + (i < filled ? '.on' : '') + (i === d.cardDay - 1 ? '.today' : ''),
      h('span.label', { text: `Day ${i + 1}` }),
      r.flashbulbs ? h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.25) }) : r.collectible ? icon('sparkle') : icon('camera'),
      h('span.sd-amt', { text: r.flashbulbs ? `×${r.flashbulbs}` : `+${r.xp}` })));
    const sheet = app.sheet(h('div.daily-sheet',
      h('div.ss-col',
        h('div.label.muted', { text: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }),
        h('div.display.sheet-title', { text: 'The Daily Postcard' }),
        h('div.daily-card.card', h('img', { src: app.assets.imageUrl(scene.plate, app.village, true), alt: '' }),
          h('div.daily-info', h('div.display', { text: scene.name }), h('div.cond-pill', icon(CONDITION_ICONS[d.condition]), h('span', { text: cond.name })))),
        h('p.hand.daily-note', { text: 'Everyone gets the same photo walk today. Just for fun.' }),
      ),
      h('div.ss-col',
        h('div.label.muted', { text: `Stamp card · ${d.days} day${d.days === 1 ? '' : 's'} played` }),
        h('div.streak-card', card),
        h('p.label.muted', { text: 'Missed a day? No matter: your card keeps its stamps.' }),
        d.done ? h('div.daily-done.hand', { text: 'Done for today! There’s a new one tomorrow.' })
          : h('button.btn.big', { onclick: () => { sheet.close(); playDaily(app); } }, icon('camera'), h('span', { text: 'Take today’s' })),
      ),
    ), { cls: 'wide' });
  }

  celebrateUnlock(sid) {
    const pin = this.inner.querySelector(`[data-scene="${sid}"]`);
    if (!pin) return;
    this.centerOn(sid, true);
    pin.classList.add('just-unlocked');
    this.app.sfx('unlock');
  }
}
