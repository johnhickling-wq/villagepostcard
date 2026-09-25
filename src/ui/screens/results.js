// The payoff: the postcard prints, develops, shows its before/after, and the
// rewards roll in. Early on it is only the postcard and what it raised for the
// Village Fund; stamps, the score and experience join once they're introduced.

import { h, icon, wait, countUp, CONDITION_ICONS } from '../dom.js';
import { postcardEl, beforeAfter, gradeStamp } from '../components/postcard.js';
import { goMap, playScene } from '../flows.js';
import { levelInfo, sceneStatus, nextGoal, introduced } from '../../core/progression.js';
import { showRewardsQueue } from '../components/rewards.js';

const STAMP_WORDS = ['Snapped!', 'Lovely!', 'Picture Perfect!'];
const WEATHERS = ['clear', 'golden', 'mist', 'dusk', 'storm'];

export class ResultsScreen {
  constructor(app, data) {
    this.app = app;
    this.d = data;
    this.usesCanvas = false;
    const { play } = data;
    const scene = app.content.scene(play.village, play.scene);
    this.stamps = play.stamps !== false;
    this.level = introduced(app.save, app.content, 'level');
    this.pc = postcardEl(app, { photo: data.stills.after, sceneName: scene.name, condition: play.condition });
    this.pc.classList.add('printing');
    this.stampSlots = [1, 2, 3].map((n) => h('div.stamp-slot', h('span.label', { text: STAMP_WORDS[n - 1] })));
    this.stampsRow = h('div.results-stamps' + (this.stamps ? '' : '.hidden'), this.stampSlots);
    this.panel = h('div.results-panel.card.paper.hidden');
    const again = play.daily || play.tutorial ? null : h('button.btn.mustard.small', { text: 'Snap it again', onclick: () => this.again() });
    this.buttons = h('div.results-buttons.hidden', again, h('button.btn.teal', { text: 'Continue', onclick: () => this.done() }));
    // landscape: the print on the left, the tally on the right
    this.el = h('div.results',
      h('div.results-flash'),
      h('div.results-slot', this.pc),
      h('div.results-side', this.stampsRow, this.panel, this.buttons),
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
    // stamps, once they've been introduced
    if (this.stamps) {
      this.stampsRow.classList.add('show');
      await W(250);
      for (let i = 1; i <= r.stamps; i++) {
        const st = gradeStamp(i, STAMP_WORDS[i - 1]);
        st.style.setProperty('--r', `${[-10, 6, -4][i - 1]}deg`);
        this.stampSlots[i - 1].innerHTML = '';
        this.stampSlots[i - 1].append(st);
        this.stampSlots[i - 1].classList.add('filled');
        app.sfx('stamp');
        app.haptic(i === 3 ? 'heavy' : 'medium');
        await W(380);
      }
      if (r.stamps === 3) app.audio.jingle();
    }
    // the tally
    this.renderPanel();
    this.panel.classList.remove('hidden');
    this.panel.classList.add('pop-in');
    await W(300);
    await this.tally(W);
    this.buttons.classList.remove('hidden');
    this.buttons.classList.add('fade-in');
    if (this.stamps && !app.save.flags.seen.stamps) {
      // explained once, beside the stamps rather than over them
      app.save.flags.seen.stamps = true;
      this.panel.prepend(h('div.stamps-note.hand.pop-in', { text: 'Stamps show how well you did. Quick, careful tidying earns all three, and raises more.' }));
    }
    await showRewardsQueue(app, d.out, { play: d.play });
  }

  renderPanel() {
    const { result, out, play } = this.d;
    const app = this.app;
    const b = result.breakdown;
    const line = (label, val, cls = '') => h(`div.tally-line${cls ? '.' + cls : ''}`, h('span', { text: label }), h('span.dots'), h('span.tally-val', { text: '0', 'data-to': val }));
    this.lines = this.stamps ? h('div.tally',
      line('Tidying', b.fixPoints),
      b.penalties ? line('Mis-taps', -b.penalties, 'neg') : null,
      line(`Time bonus (${Math.round(result.time)}s, par ${result.par}s)`, b.timeBonus),
      b.noHint ? line('No hints used', b.noHint) : null,
      b.cat ? line('Found Marmalade', b.cat) : null,
      b.collectible ? line('Keepsake found', b.collectible) : null,
      h('div.tally-line.total', h('span.display', { text: 'Score' }), h('span.dots'), h('span.tally-val.display', { text: '0', 'data-to': b.total })),
    ) : null;
    // where the money goes: the Fund, and how close the next project is
    this.fundEl = h('span.reward-num', { text: '0' });
    const goal = nextGoal(app.save, app.content, play.village);
    const p = goal.project;
    const have = app.save.player.fund;
    this.jarFill = h('i', { style: { width: `${p ? Math.min(100, ((have - out.fund) / p.cost) * 100) : 100}%` } });
    this.jarTarget = p ? Math.min(100, (have / p.cost) * 100) : 100;
    const fundBox = h('div.fund-raised',
      h('div.row.fund-line', icon('fund'), h('span', { text: 'Raised' }), this.fundEl, h('span', { text: 'for the Village Fund' })),
      p ? h('div.fund-goal.row',
        h('div.jar-bar', this.jarFill),
        h('div.fund-goal-text', { text: goal.kind === 'project' ? `Enough for “${p.name}”!` : `${goal.need} more for “${p.name}”` })) : null,
    );
    // xp, once levels are introduced
    const lvl = levelInfo(app.content, app.save.player.xp - out.xp);
    this.xpFill = h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } });
    this.xpEl = h('span.reward-num', { text: '0' });
    const xpBox = this.level ? h('div.xp-line.row', h('div.xp-mini', h('div.label', { text: `Level ${lvl.level}` }), h('div.xp-bar', this.xpFill)), h('span.xp-num', '+', this.xpEl, ' xp')) : null;
    // this place's five postcards (the Daily Postcard has its own diary)
    const ss = sceneStatus(app.save, app.content, play.village, play.scene);
    const cards = play.daily ? null : h('div.results-mastery',
      h('span.label', { text: `Postcards of ${app.content.scene(play.village, play.scene).name}` }),
      h('div.results-postcards', WEATHERS.map((c, i) => h('span' + (i < ss.tiersDone ? '.on' : ''), { title: app.content.conditions[c].name }, icon(CONDITION_ICONS[c])))));
    this.panel.append(...[this.lines, fundBox, cards || xpBox ? h('div.results-foot.row', cards, xpBox) : null].filter(Boolean));
  }

  async tally(W) {
    const app = this.app;
    const vals = this.lines ? [...this.lines.querySelectorAll('.tally-val')] : [];
    for (const v of vals) {
      const to = +v.dataset.to;
      app.sfx('tick');
      await countUp(v, to, { from: 0, dur: this.fast ? 150 : 420, format: (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-GB') });
    }
    app.sfx('coin');
    await countUp(this.fundEl, this.d.out.fund, { from: 0, dur: this.fast ? 250 : 900, tick: () => app.sfx('tick') });
    this.jarFill.style.width = `${this.jarTarget}%`;
    if (this.level) {
      await countUp(this.xpEl, this.d.out.xp, { from: 0, dur: this.fast ? 200 : 700 });
      const lvl = levelInfo(app.content, app.save.player.xp);
      this.xpFill.style.width = `${(lvl.into / lvl.need) * 100}%`;
    }
    const pcEv = this.d.out.events.find((e) => e.kind === 'postcard');
    if (pcEv) {
      const sp = this.panel.querySelectorAll('.results-postcards span')[pcEv.tier - 1];
      if (sp) sp.classList.add('on', 'new');
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
