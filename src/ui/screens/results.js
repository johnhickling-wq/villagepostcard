// The payoff: the postcard prints, develops, gets stamped, shows its
// before/after, and the rewards roll in.

import { h, icon, wait, countUp } from '../dom.js';
import { postcardEl, beforeAfter, gradeStamp } from '../components/postcard.js';
import { goMap, playScene } from '../flows.js';
import { levelInfo, xpToNext, sceneStatus } from '../../core/progression.js';
import { showRewardsQueue } from '../components/rewards.js';

const STAMP_WORDS = ['Snapped!', 'Lovely!', 'Picture Perfect!'];

export class ResultsScreen {
  constructor(app, data) {
    this.app = app;
    this.d = data;
    this.usesCanvas = false;
    const { play, result } = data;
    const scene = app.content.scene(play.village, play.scene);
    this.pc = postcardEl(app, { photo: data.stills.after, sceneName: scene.name, condition: play.condition });
    this.pc.classList.add('printing');
    this.stampsRow = h('div.results-stamps');
    this.panel = h('div.results-panel.card.paper.hidden');
    this.buttons = h('div.results-buttons.hidden',
      h('button.btn.teal.big', { text: 'Continue', onclick: () => this.done() }),
      h('button.btn.mustard.small', { text: 'Snap it again', onclick: () => this.again() }),
    );
    this.el = h('div.results',
      h('div.results-flash'),
      h('div.results-slot', this.pc, this.stampsRow),
      this.panel,
      this.buttons,
    );
    this.el.addEventListener('pointerdown', () => { this.fast = true; }, { passive: true });
  }

  async enter() {
    this.app.audio.stopMusic();
    this.run();
  }

  async run() {
    const app = this.app, d = this.d, r = d.result;
    const W = (ms) => wait(this.fast ? ms * 0.35 : ms);
    app.sfx('print');
    await W(80);
    this.pc.classList.add('out');
    await W(1100);
    this.pc.classList.add('developed');
    await W(900);
    // before / after
    const ba = beforeAfter(app, this.pc, d.stills.before);
    app.sfx('page');
    await ba.play();
    // stamps
    for (let i = 1; i <= r.stamps; i++) {
      const st = gradeStamp(i, STAMP_WORDS[i - 1]);
      st.style.setProperty('--r', `${[-14, 8, -6][i - 1]}deg`);
      this.stampsRow.append(st);
      app.sfx('stamp');
      app.haptic(i === 3 ? 'heavy' : 'medium');
      await W(380);
    }
    if (r.stamps === 3) app.audio.jingle();
    // the tally
    this.renderPanel();
    this.panel.classList.remove('hidden');
    this.panel.classList.add('pop-in');
    await W(300);
    await this.tally(W);
    this.buttons.classList.remove('hidden');
    this.buttons.classList.add('fade-in');
    await showRewardsQueue(app, d.out, { play: d.play });
    if (d.play.tutorial) {
      app.toast('Your first postcard! It has gone straight into your album.', { ms: 3200 });
    }
  }

  renderPanel() {
    const { result, out, play } = this.d;
    const b = result.breakdown;
    const line = (label, val, cls = '') => h(`div.tally-line${cls ? '.' + cls : ''}`, h('span', { text: label }), h('span.dots'), h('span.tally-val', { text: '0', 'data-to': val }));
    this.lines = h('div.tally',
      line('Tidying', b.fixPoints),
      b.penalties ? line('Mis-taps', -b.penalties, 'neg') : null,
      line(`Time bonus (${Math.round(result.time)}s, par ${result.par}s)`, b.timeBonus),
      b.noHint ? line('No hints used', b.noHint) : null,
      b.cat ? line('Found Marmalade', b.cat) : null,
      b.collectible ? line('Keepsake found', b.collectible) : null,
      h('div.tally-line.total', h('span.display', { text: 'Score' }), h('span.dots'), h('span.tally-val.display', { text: '0', 'data-to': b.total })),
    );
    const ss = sceneStatus(this.app.save, this.app.content, play.village, play.scene);
    const lvl = levelInfo(this.app.content, this.app.save.player.xp - out.xp);
    this.xpFill = h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } });
    this.penniesEl = h('span.reward-num', { text: '0' });
    this.xpEl = h('span.reward-num', { text: '0' });
    const rosettes = h('div.results-rosettes', Array.from({ length: 5 }, (_, i) => h('span.ros' + (i < ss.tiersDone ? '.on' : ''), icon(i < ss.tiersDone ? 'rosette' : 'rosetteGrey'))));
    this.panel.append(
      this.lines,
      h('div.rewards-row',
        h('div.reward', icon('penny'), this.penniesEl, h('span.label', { text: 'pennies' })),
        h('div.reward', h('div.xp-mini', h('div.label', { text: `Level ${lvl.level}` }), h('div.xp-bar', this.xpFill)), this.xpEl, h('span.label', { text: 'xp' })),
      ),
      h('div.results-mastery.row', h('span.label', { text: play.daily ? 'Daily Postcard' : 'Scene rosettes' }), rosettes),
    );
  }

  async tally(W) {
    const app = this.app;
    const vals = [...this.lines.querySelectorAll('.tally-val')];
    for (const v of vals) {
      const to = +v.dataset.to;
      app.sfx('tick');
      await countUp(v, to, { from: 0, dur: this.fast ? 150 : 420, format: (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-GB') });
    }
    app.sfx('coin');
    await countUp(this.penniesEl, this.d.out.pennies, { from: 0, dur: this.fast ? 250 : 900, tick: () => app.sfx('tick') });
    await countUp(this.xpEl, this.d.out.xp, { from: 0, dur: this.fast ? 200 : 700 });
    const lvl = levelInfo(app.content, app.save.player.xp);
    this.xpFill.style.width = `${(lvl.into / lvl.need) * 100}%`;
    const rosEv = this.d.out.events.find((e) => e.kind === 'rosette');
    if (rosEv) {
      const spans = this.panel.querySelectorAll('.results-rosettes span');
      const sp = spans[rosEv.tier - 1];
      if (sp) {
        sp.innerHTML = '';
        sp.append(icon('rosette'));
        sp.classList.add('on', 'new');
      }
      app.sfx('rosette');
      app.haptic('success');
      await W(500);
    }
  }

  done() {
    this.app.sfx('ui.tap');
    goMap(this.app, { from: 'results', play: this.d.play, out: this.d.out });
  }

  again() {
    this.app.sfx('ui.tap');
    const { play } = this.d;
    if (play.daily) return goMap(this.app);
    playScene(this.app, play.scene);
  }
}
