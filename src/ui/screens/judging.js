// The finale: the judges tour the village. Each place is shown as it was
// when you arrived and wipes to how it stands now (drawn from the actual
// restored state, not an old postcard), with a word from its resident. Then
// the rosette, the Colonel's letter, and the choice to stay in the finished
// village or look in at the Travel Office. From the journal it can be
// watched again (no rewards the second time).

import { h, icon, wait } from '../dom.js';
import { renderPlace, renderPostcard } from '../../render/stills.js';
import { visitsOf } from '../../core/progression.js';
import { showLetter } from '../components/letter.js';
import { showRewardsQueue } from '../components/rewards.js';
import { goMap, placeState } from '../flows.js';

const REMARKS = [
  'Not a crisp packet in sight.', 'Immaculate paintwork.', 'The Market Cross gleams!', 'Window boxes all along. Charming.',
  'One could eat one’s dinner off that path.', 'The festoon lights! Delightful.', 'Best-kept in the county, surely?', 'The roses, the hives, the tea!',
];

export class JudgingScreen {
  constructor(app, out, { replay = false } = {}) {
    this.app = app;
    this.out = out;
    this.replay = replay || !out;
    this.fast = false;
    this.stage = h('div.judge-stage');
    this.el = h('div.judging',
      h('div.judge-title', h('div.label.muted-light', { text: `${app.v.county} · ${app.v.year}` }), h('div.display', { text: 'Judging Day' })),
      this.stage,
    );
    this.el.addEventListener('pointerdown', () => { this.fast = true; }, { passive: true });
  }

  enter() {
    // the ceremony runs on its own; show() must not wait for it
    this.run();
  }

  W(ms) { return wait(this.fast ? ms * 0.3 : ms); }

  async run() {
    const app = this.app, v = app.v;
    app.audio.startMusic('map');
    await this.W(500);
    let i = 0;
    for (const sid of v.sceneOrder) {
      const who = v.villagers[v.scenes[sid].villager];
      const before = h('div.jc-before', h('div.as-loading'));
      const after = h('div.jc-after', h('div.as-loading'));
      const card = h('div.judge-card', { style: { '--rot': `${[-5, 4, -3, 5, -4, 3, -4, 5][i % 8]}deg` } },
        h('div.jc-photo', after, before, h('div.jc-tag.label', { text: 'When you arrived' })),
        h('div.jc-name.script', { text: v.scenes[sid].name }),
        h('div.jc-remark.hand', { text: `“${REMARKS[i % REMARKS.length]}”` }),
        who ? h('div.jc-who.row', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.3), alt: '' }), h('span.label', { text: `with thanks to ${who.name}` })) : null,
      );
      this.stage.append(card);
      // as it really was: the first visit's own "before" photo, where the journal has it
      const first = visitsOf(app.content, app.village).find((x) => x.scene === sid && app.vs.journal[x.id]);
      const [was, now] = await Promise.all([
        first ? renderPostcard(app, sid, app.vs.journal[first.id], { width: 520, before: true }).then((r) => r.before)
          : renderPlace(app, sid, { effects: [], fixed: [], bloom: 0 }, { width: 520, condition: 'clear' }),
        renderPlace(app, sid, { ...placeState(app, sid), bloom: 1 }, { width: 520, condition: 'golden' }),
      ]);
      before.innerHTML = ''; before.append(h('img', { src: was, alt: `${v.scenes[sid].name} before` }));
      after.innerHTML = ''; after.append(h('img', { src: now, alt: `${v.scenes[sid].name} restored` }));
      app.sfx('page');
      await this.W(700);
      card.classList.add('wiped');
      await this.W(1500);
      card.classList.add('stacked');
      i++;
    }
    await this.W(500);
    app.sfx('bell');
    const award = h('div.award.pop-in',
      h('div.award-rosette', icon('rosette')),
      h('div.label.muted-light', { text: 'The judges have decided…' }),
      h('div.display.award-title', { text: v.finale.title }),
      h('div.script.award-village', { text: v.name }),
      h('div.label', { text: v.finale.award }),
    );
    this.el.append(award);
    app.audio.jingle();
    app.haptic('success');
    if (!app.reducedMotion) for (let k = 0; k < 3; k++) { this.confetti(); await wait(400); }
    await wait(1600);
    if (!this.replay) {
      await showLetter(app, { from: 'colonel', title: 'We did it!', body: 'My dear photographer,\n\nBest-Kept Village! In eleven years of trying! The whole village is on the Green, Mabel has opened a barrel, and the Reverend is ringing all eight bells with six ringers.\n\nYou put every corner to rights and made us see how lovely we are. Honeycombe will always have a bench with your name on it.\n\nWith heartfelt thanks,\nColonel Rupert Whitby', button: 'Hooray!' });
      if (this.out) await showRewardsQueue(app, this.out);
      await showLetter(app, { from: 'editor', ...v.letters.finale, button: 'Thank you' });
    }
    this.ending();
  }

  /** The free village ends here. Staying comes first; the next village is a gentle "one day". */
  ending() {
    const app = this.app;
    const stay = h('button.btn.teal.big', { onclick: () => { app.sfx('ui.tap'); goMap(app, { transition: 'iris' }); } }, icon('home'), h('span', { text: `Stay in ${app.v.short}` }));
    const travel = h('button.btn.ink.small', { onclick: async () => { app.sfx('ui.tap'); const { TravelScreen } = await import('./travel.js'); app.show(new TravelScreen(app)); } }, icon('train'), h('span', { text: 'Look in at the Travel Office' }));
    this.el.append(h('div.judge-end.card.paper.pop-in',
      h('p.hand', { text: `${app.v.short} is yours to enjoy: photo walks in every weather, the Daily Postcard and favours for the neighbours.` }),
      h('div.row.judge-end-btns', stay, this.replay ? null : travel),
    ));
  }

  confetti() {
    for (let i = 0; i < 40; i++) {
      const c = h('i.confetto', { style: { left: `${Math.random() * 100}%`, background: ['#d9483b', '#f2c14e', '#4f86c6', '#6ea96a', '#f4ecd8', '#e38fb0'][i % 6], animationDelay: `${Math.random() * 0.6}s`, '--dx': `${(Math.random() - 0.5) * 120}px` } });
      this.el.append(c);
      setTimeout(() => c.remove(), 3500);
    }
  }
}
