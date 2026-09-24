// The hub: an illustrated village map with pinned postcards for each scene,
// restoration stickers, the Committee Letter (next goal) and navigation.

import { h, icon, svg, ICONS, countUp, CONDITION_ICONS } from '../dom.js';
import {
  sceneStatus, projectStatus, rosettes, bloom, nextGoal, judgingReady, dailyInfo, levelInfo,
} from '../../core/progression.js';
import { playScene, restoreProject, playDaily, judging } from '../flows.js';
import { topBar } from '../components/topbar.js';

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
    // title cartouche (fixed, over the map)
    const b = Math.round(bloom(save, app.content, app.village) * 100);
    this.cartouche = h('div.map-cartouche.card.paper',
      h('div.script.map-name', { text: v.name }),
      h('div.bloom.row', h('span.label', { text: 'Village Bloom' }), h('div.bloom-bar', h('i', { style: { width: `${b}%` } })), h('span.bloom-num.display', { text: `${b}%` })),
    );
    // a little life: drifting cloud shadows
    for (let i = 0; i < 3; i++) {
      this.inner.append(h('div.map-cloud', { style: { top: `${10 + i * 28}%`, width: `${120 + i * 40}px`, height: `${50 + i * 14}px`, animationDuration: `${70 + i * 25}s`, animationDelay: `${-i * 30}s`,
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%)' } }));
    }
    for (const sid of v.sceneOrder) this.inner.append(this.pin(sid));
    if (judgingReady(save, app.content, app.village)) {
      const [x, y] = v.map.pins['village-green'];
      this.inner.append(h('button.judging-btn.pulse', { style: { left: `${x / 10}%`, top: `${y / 15 + 7}%` }, onclick: () => judging(app) },
        icon('rosette'), h('span.display', { text: 'The judges are here!' })));
    }
    this.scroll = h('div.map-scroll', this.inner);
    this.goal = this.goalRibbon();
    this.nav = this.navBar();
    this.el.append(this.scroll, this.top.el, this.cartouche, this.goal, this.nav);
  }

  async enter() {
    const app = this.app;
    requestAnimationFrame(() => this.centerOn(this.focusScene()));
    const o = this.opts;
    // arriving after a play: count the pennies up
    if (o.from === 'results' && o.out) {
      this.top.animatePennies(app.save.player.pennies - o.out.pennies, app.save.player.pennies);
    }
    if (o.unlocked) setTimeout(() => this.celebrateUnlock(o.unlocked), 400);
    const letter = (o.events || []).find((e) => e.kind === 'letter');
    if (letter?.letter === 'teaser') setTimeout(() => this.teaser(), 1200);
    if ((o.events || []).some((e) => e.kind === 'judgingReady')) setTimeout(() => app.toast([icon('rosette'), 'The judges have arrived on the Green!'], { ms: 3600 }), 900);
    // first visit after the tutorial: point at the first project
    if (!app.save.flags.seen.mapIntro) {
      app.save.flags.seen.mapIntro = true;
      app.persist();
      setTimeout(() => this.coachFirstProject(), 700);
    } else if (o.from === 'results' && app.save.player.plays === 3 && !app.save.flags.seen.daily) {
      app.save.flags.seen.daily = true;
      setTimeout(() => app.toast([icon('calendar'), 'The Daily Postcard is open! A new scene to snap every day.'], { ms: 3600 }), 900);
    }
  }

  focusScene() {
    const app = this.app;
    const goal = nextGoal(app.save, app.content, app.village);
    if (this.opts.focus) return this.opts.focus;
    if (goal.project) return goal.project.unlocks || goal.project.scene;
    return this.opts.play?.scene || app.v.start;
  }

  centerOn(sid, smooth = false) {
    const pin = this.inner.querySelector(`[data-scene="${sid}"]`);
    if (!pin) return;
    const s = this.scroll;
    const x = pin.offsetLeft + this.inner.offsetLeft - s.clientWidth / 2;
    const y = pin.offsetTop + this.inner.offsetTop - s.clientHeight / 2 + 20;
    s.scrollTo({ left: x, top: y, behavior: smooth ? 'smooth' : 'auto' });
  }

  pin(sid) {
    const app = this.app, v = app.v;
    const scene = v.scenes[sid];
    const st = sceneStatus(app.save, app.content, app.village, sid);
    const [x, y] = v.map.pins[sid];
    const thumb = app.assets.imageUrl(scene.plate, app.village, true);
    const rot = ((sid.length * 7) % 9) - 4;
    const dots = h('div.pin-rosettes', Array.from({ length: 5 }, (_, i) => h('i' + (i < st.tiersDone ? '.on' : ''))));
    const el = h('button.pin' + (st.unlocked ? '' : '.locked') + (st.mastered ? '.mastered' : ''), {
      'data-scene': sid, style: { left: `${x / 10}%`, top: `${y / 15}%`, '--rot': `${rot}deg` },
      onclick: () => {
        app.sfx('ui.tap');
        app.save.flags.seen[`pin:${sid}`] = true;
        st.unlocked ? this.sceneSheet(sid) : this.lockedSheet(sid);
      },
    },
      h('div.pin-card', h('img', { src: thumb, alt: '' }), st.unlocked ? null : h('div.pin-lock', icon('lock'))),
      h('div.pin-pushpin'),
      h('div.pin-tag', h('span', { text: scene.name }), st.unlocked ? dots : null),
    );
    // restoration stickers: one per finished beautification project
    const stickers = h('div.pin-stickers');
    for (const r of scene.restoration || []) {
      if (!app.save.villages[app.village].projects[r.project]) continue;
      const p = (r.props || [])[0];
      if (p) stickers.append(h('img', { src: app.assets.spriteUrl(p.sprite, app.village, 0.25), alt: '' }));
      else stickers.append(h('span.sticker-paint', icon('paint')));
    }
    el.append(stickers);
    if (st.unlocked && st.plays === 0 && !this.app.save.flags.seen[`pin:${sid}`]) el.append(h('div.pin-new.label', { text: 'New!' }));
    // a project you can afford gets a flag
    const affordable = v.projects.some((p) => (p.scene === sid || p.unlocks === sid) && projectStatus(app.save, app.content, app.village, p.id).canBuy);
    if (affordable) el.append(h('div.pin-flag.wiggle', icon('sparkle')));
    return el;
  }

  goalRibbon() {
    const app = this.app;
    const goal = nextGoal(app.save, app.content, app.village);
    const who = app.v.villagers[goal.project?.villager || 'colonel'];
    const el = h('button.goal.card.paper', {
      onclick: () => {
        app.sfx('ui.tap');
        if (goal.kind === 'judging') return judging(app);
        const sid = goal.project ? goal.project.unlocks || goal.project.scene : null;
        if (sid) {
          this.centerOn(sid, true);
          const st = sceneStatus(app.save, app.content, app.village, sid);
          setTimeout(() => (st.unlocked ? this.sceneSheet(sid) : this.lockedSheet(sid)), 350);
        }
      },
    },
      h('img.goal-portrait', { src: app.assets.spriteUrl(who.portrait, app.village, 0.35), alt: '' }),
      h('div.goal-text', h('div.label.muted', { text: 'The Committee Letter' }), h('div.hand', { text: goal.text })),
      goal.kind === 'project' ? h('div.goal-go.pulse', icon('sparkle')) : null,
    );
    return el;
  }

  navBar() {
    const app = this.app;
    const claimable = app.save.requests.active.filter((r) => r.progress >= r.count).length;
    const daily = dailyInfo(app.save, app.content, app.village);
    const btn = (name, label, onclick, badge) => h('button.nav-btn', { onclick: () => { app.sfx('ui.tap'); onclick(); } },
      h('div.nav-ico', icon(name), badge ? h('span.badge', { text: String(badge) }) : null), h('span.label', { text: label }));
    return h('div.nav',
      btn('album', 'Album', async () => { const { AlbumScreen } = await import('./album.js'); app.show(new AlbumScreen(app)); }),
      btn('notice', 'Noticeboard', async () => {
        if (app.save.player.plays < app.content.requests.unlockAfterPlays) return app.toast('The Noticeboard opens after a couple more postcards.', { ms: 2400 });
        const { NoticeboardScreen } = await import('./noticeboard.js'); app.show(new NoticeboardScreen(app));
      }, claimable),
      btn('calendar', 'Daily', () => this.dailySheet(), daily.unlocked && !daily.done ? '!' : 0),
      btn('train', 'Travel', async () => { const { TravelScreen } = await import('./travel.js'); app.show(new TravelScreen(app)); }),
    );
  }

  // --------------------------------------------------------------- sheets ---
  sceneSheet(sid) {
    const app = this.app, v = app.v, c = app.content;
    const scene = v.scenes[sid];
    const st = sceneStatus(app.save, c, app.village, sid);
    const next = c.tier(st.nextTier);
    const conds = Object.keys(next.conditions);
    const who = v.villagers[scene.villager];
    const slots = ['clear', 'golden', 'mist', 'dusk', 'storm'].map((cid) => {
      const e = st.album[cid];
      return h('div.slot' + (e ? '.filled' : ''), { title: c.conditions[cid].name }, icon(CONDITION_ICONS[cid]), e ? h('span.slot-stamps', { text: '★'.repeat(e.stamps) }) : null);
    });
    const projects = v.projects.filter((p) => p.scene === sid && !p.unlocks);
    const sheet = app.sheet(h('div.scene-sheet',
      h('div.ss-head',
        h('div.ss-thumb.card', h('img', { src: app.assets.imageUrl(scene.plate, app.village, true), alt: '' }), h('div.tape', { style: { left: '30%', top: '-10px', transform: 'rotate(-4deg)' } })),
        h('div.ss-info',
          h('div.display.ss-name', { text: scene.name }),
          h('p.ss-blurb', { text: scene.blurb }),
          h('div.ss-rosettes', Array.from({ length: 5 }, (_, i) => h('span', icon(i < st.tiersDone ? 'rosette' : 'rosetteGrey')))),
        ),
      ),
      h('div.ss-next.card',
        h('div.label.muted', { text: st.mastered ? 'Free Play' : `Next: tier ${st.nextTier} of 5` }),
        h('div.display.ss-tier', { text: next.name }),
        h('div.row.ss-conds', conds.map((cid) => h('span.cond-pill', icon(CONDITION_ICONS[cid]), h('span', { text: c.conditions[cid].name })))),
        h('div.ss-meta.row', h('span', { text: `${next.faults[0]}–${next.faults[1]} things to tidy` }), st.best ? h('span', { text: `Best ${st.best.toLocaleString('en-GB')}` }) : null),
      ),
      h('div.ss-album', h('div.label.muted', { text: 'Album slots' }), h('div.slots', slots)),
      projects.length ? h('div.ss-projects', h('div.label.muted', { text: 'Restoration' }), projects.map((p) => this.projectCard(p, () => sheet.close()))) : null,
      who ? h('div.ss-villager.row', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }), h('div.hand', { text: `“${(who.thanks || [''])[sid.length % (who.thanks?.length || 1)]}” — ${who.short}` })) : null,
      h('button.btn.big.ss-play', { onclick: () => { sheet.close(); playScene(app, sid); } }, icon('camera'), h('span', { text: 'Snap it!' })),
    ));
  }

  projectCard(p, closeSheet) {
    const app = this.app;
    const ps = projectStatus(app.save, app.content, app.village, p.id);
    let reason = '';
    if (ps.done) reason = 'Done!';
    else if (!ps.sceneOpen) reason = 'Scene not open yet';
    else if (ps.needRosettes) reason = `Needs ${ps.needRosettes} more rosette${ps.needRosettes > 1 ? 's' : ''}`;
    else if (ps.needPennies) reason = `${ps.needPennies} more pennies`;
    const btn = h('button.btn.small' + (ps.canBuy ? '.mustard.pulse' : '.ink'), {
      disabled: !ps.canBuy,
      onclick: () => { closeSheet?.(); restoreProject(app, p.id); },
    }, ps.done ? icon('check') : icon('penny'), h('span', { text: ps.done ? 'Done' : String(p.cost) }));
    return h('div.project-card.card' + (ps.done ? '.done' : ''),
      h('div.pc-icon', icon(p.icon in ICONS ? p.icon : 'sparkle')),
      h('div.pc-body', h('div.display.pc-name', { text: p.name }), h('div.pc-desc', { text: p.desc }), reason && !ps.done ? h('div.pc-reason.label', { text: reason }) : null),
      h('div.pc-cost', btn, p.rosettes ? h('div.pc-req.row', icon('rosette'), h('span', { text: String(p.rosettes) })) : null),
    );
  }

  lockedSheet(sid) {
    const app = this.app, v = app.v;
    const scene = v.scenes[sid];
    const access = v.projects.find((p) => p.unlocks === sid);
    const who = v.villagers[access.villager];
    const sheet = app.sheet(h('div.scene-sheet.locked',
      h('div.ss-head',
        h('div.ss-thumb.card.greyed', h('img', { src: app.assets.imageUrl(scene.plate, app.village, true), alt: '' }), h('div.pin-lock', icon('lock'))),
        h('div.ss-info', h('div.label.muted', { text: 'Not yet open' }), h('div.display.ss-name', { text: scene.name }), h('p.ss-blurb', { text: scene.blurb })),
      ),
      h('div.ss-villager.row', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }), h('div.hand', { text: `“${access.desc}” — ${who.short}` })),
      this.projectCard(access, () => sheet.close()),
    ));
  }

  dailySheet() {
    const app = this.app;
    const d = dailyInfo(app.save, app.content, app.village);
    if (!d.unlocked) return app.toast('The Daily Postcard opens after your third postcard.', { ms: 2400 });
    const scene = app.content.scene(app.village, d.scene);
    const cond = app.content.conditions[d.condition];
    const card = d.card.map((r, i) => h('div.streak-day' + (i < (d.done ? d.cardDay : d.cardDay - 1) ? '.on' : '') + (i === d.cardDay - 1 ? '.today' : ''),
      h('span.label', { text: `Day ${i + 1}` }),
      r.flashbulbs ? h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.25) }) : icon('penny'),
      h('span.sd-amt', { text: r.flashbulbs ? `×${r.flashbulbs}` : `${r.pennies}${r.collectible ? '+' : ''}` })));
    const sheet = app.sheet(h('div.daily-sheet',
      h('div.label.muted', { text: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }),
      h('div.display.sheet-title', { text: 'The Daily Postcard' }),
      h('div.daily-card.card', h('img', { src: app.assets.imageUrl(scene.plate, app.village, true), alt: '' }),
        h('div.daily-info', h('div.display', { text: scene.name }), h('div.cond-pill', icon(CONDITION_ICONS[d.condition]), h('span', { text: cond.name })), h('p.hand', { text: 'Everyone gets the same mess today. How tidy can you make it?' }))),
      h('div.label.muted', { text: `Stamp card · streak ${d.streak} day${d.streak === 1 ? '' : 's'}` }),
      h('div.streak-card', card),
      d.done ? h('div.daily-done.hand', { text: 'Done for today! Come back tomorrow for a new postcard.' })
        : h('button.btn.big', { onclick: () => { sheet.close(); playDaily(app); } }, icon('camera'), h('span', { text: 'Snap today’s' })),
    ));
  }

  // ------------------------------------------------------------ moments ---
  celebrateUnlock(sid) {
    const pin = this.inner.querySelector(`[data-scene="${sid}"]`);
    if (!pin) return;
    this.centerOn(sid, true);
    pin.classList.add('just-unlocked');
    this.app.sfx('unlock');
  }

  async teaser() {
    const app = this.app;
    const { showLetter } = await import('../components/letter.js');
    await showLetter(app, { from: 'postman', ...app.v.letters.teaser, button: 'Pin it up' });
    const poster = app.content.index.villages.find((x) => !x.playable);
    const m = app.modal(h('div.celebrate.card.paper.deckle',
      h('div.label.muted', { text: 'A picture postcard from' }),
      h('div.display.celebrate-title', { text: poster.name }),
      h('img.teaser-img', { src: app.assets.imageUrl(poster.poster, null), alt: '' }),
      h('p.hand', { text: poster.tagline }),
      h('div.col',
        h('button.btn.mustard', { onclick: async () => { m.close(); const { TravelScreen } = await import('./travel.js'); app.show(new TravelScreen(app, poster.id)); } }, icon('train'), h('span', { text: 'Travel Office' })),
        h('button.link.dark', { onclick: () => m.close() }, 'Maybe later'),
      ),
    ));
  }

  coachFirstProject() {
    const app = this.app;
    const access = app.v.projects[0];
    const sid = access.unlocks;
    this.centerOn(access.scene, true);
    app.toast([h('img', { src: app.assets.spriteUrl(app.v.villagers.colonel.portrait, app.village, 0.3) }), 'Splendid snap! Now, the lane to the High Street is a disgrace. Tap the High Street to restore it.'], { ms: 5200 });
    const pin = this.inner.querySelector(`[data-scene="${sid}"]`);
    pin?.classList.add('coach-glow');
  }
}
