// The finale: the judges tour the village (your best postcard of each scene),
// then the Best-Kept Village rosette, and the next assignment.

import { h, icon, wait } from '../dom.js';
import { renderPostcard } from '../../render/stills.js';
import { showLetter } from '../components/letter.js';
import { showRewardsQueue } from '../components/rewards.js';
import { goMap } from '../flows.js';

const REMARKS = [
  'Not a crisp packet in sight.', 'The window boxes are a triumph.', 'Immaculate paintwork.', 'Charming, utterly charming.',
  'One could eat one’s dinner off that path.', 'The bunting! The bunting!', 'Delightful. Truly delightful.', 'Best-kept in the county, surely?',
];

export class JudgingScreen {
  constructor(app, out) {
    this.app = app;
    this.out = out;
    this.stage = h('div.judge-stage');
    this.el = h('div.judging',
      h('div.judge-title', h('div.label.muted-light', { text: `${app.v.county} · ${app.v.year}` }), h('div.display', { text: 'Judging Day' })),
      this.stage,
    );
  }

  enter() {
    // the ceremony runs on its own; show() must not wait for it
    this.run();
  }

  async run() {
    const app = this.app, v = app.v;
    app.audio.startMusic('map');
    await wait(600);
    let i = 0;
    for (const sid of v.sceneOrder) {
      const ss = app.vs.scenes[sid];
      const best = Object.values(ss.album).sort((a, b) => b.score - a.score)[0];
      if (!best) continue;
      const card = h('div.judge-card', { style: { '--rot': `${[-6, 4, -3, 5, -5, 3, -4, 6][i % 8]}deg` } },
        h('div.jc-photo', h('div.as-loading')),
        h('div.jc-name.script', { text: v.scenes[sid].name }),
        h('div.jc-remark.hand', { text: `“${REMARKS[i % REMARKS.length]}”` }),
      );
      this.stage.append(card);
      renderPostcard(app, sid, best, { width: 300 }).then(({ after }) => { const p = card.querySelector('.jc-photo'); p.innerHTML = ''; p.append(h('img', { src: after, alt: '' })); });
      app.sfx('page');
      await wait(900);
      card.classList.add('stacked');
      i++;
    }
    await wait(600);
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
    for (let k = 0; k < 3; k++) { this.confetti(); await wait(400); }
    await wait(1800);
    await showLetter(app, { from: 'colonel', title: 'We did it!', body: 'My dear photographer,\n\nBest-Kept Village! In eleven years of trying! The whole village is on the Green, Mabel has opened a barrel, and the Reverend is ringing all eight bells with six ringers.\n\nYou tidied every corner and made us see how lovely we are. Honeycombe will always have a bench with your name on it.\n\nWith heartfelt thanks,\nColonel Rupert Whitby', button: 'Hooray!' });
    if (this.out) await showRewardsQueue(app, this.out);
    await showLetter(app, { from: 'editor', ...v.letters.finale, button: 'To the Travel Office' });
    const { TravelScreen } = await import('./travel.js');
    app.show(new TravelScreen(app, 'porthkennack'));
  }

  confetti() {
    for (let i = 0; i < 40; i++) {
      const c = h('i.confetto', { style: { left: `${Math.random() * 100}%`, background: ['#d9483b', '#f2c14e', '#4f86c6', '#6ea96a', '#f4ecd8', '#e38fb0'][i % 6], animationDelay: `${Math.random() * 0.6}s`, '--dx': `${(Math.random() - 0.5) * 120}px` } });
      this.el.append(c);
      setTimeout(() => c.remove(), 3500);
    }
  }
}
