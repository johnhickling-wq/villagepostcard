import { h, icon, countUp } from '../dom.js';
import { levelInfo, introduced } from '../../core/progression.js';
import { openSettings } from './settings.js';

/** Level badge (once introduced), the Village Fund and settings. */
export function topBar(app, { back = null, onChange } = {}) {
  const lvl = levelInfo(app.content, app.save.player.xp);
  const fund = h('span', { text: app.save.player.fund.toLocaleString('en-GB') });
  const fundChip = h('div.chip.fund', { 'aria-label': 'The Village Fund', title: 'The Village Fund' }, icon('fund'), fund);
  const el = h('div.topbar',
    back ? h('button.iconbtn', { 'aria-label': 'Back', onclick: () => { app.sfx('ui.tap'); back(); } }, icon('back')) : null,
    introduced(app.save, app.content, 'level') ? h('button.chip.level-badge', { onclick: () => profile(app) },
      h('div.num', { text: String(lvl.level) }),
      h('div.col', { style: { gap: '3px' } }, h('div.t', { text: lvl.title }), h('div.bar', h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } })))) : null,
    h('div.grow'),
    fundChip,
    h('button.iconbtn.small', { 'aria-label': 'Settings', onclick: () => { app.sfx('ui.tap'); openSettings(app, onChange); } }, icon('gear')),
  );
  return {
    el,
    fundChip,
    animateFund(from, to) {
      fund.textContent = from.toLocaleString('en-GB');
      setTimeout(() => {
        app.sfx('coin');
        fundChip.classList.add('bump');
        countUp(fund, to, { from, dur: 900, tick: () => app.sfx('tick') });
      }, 500);
    },
  };
}

function profile(app) {
  app.sfx('ui.tap');
  const lvl = levelInfo(app.content, app.save.player.xp);
  const s = app.save.stats;
  const fixes = Object.values(s.fixes).reduce((a, b) => a + b, 0);
  const row = (label, val) => h('div.stat', h('span.label.muted', { text: label }), h('span.display', { text: String(val) }));
  app.sheet(h('div.profile',
    h('div.row', h('div.levelup-badge.display', { text: String(lvl.level) }), h('div', h('div.label.muted', { text: 'Photographer' }), h('div.display.sheet-title', { text: lvl.title }), h('div.xp-bar.big', h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } })), h('div.label.muted', { text: `${lvl.into} / ${lvl.need} xp to level ${lvl.level + 1}` }))),
    h('div.stats',
      row('Postcards taken', app.save.player.plays),
      row('Things tidied', fixes),
      row('Marmalade spotted', s.cats),
      row('Best run', `${s.bestCombo} in a row`),
      row('Three-stamp cards', s.perfect),
      row('Flashbulbs', app.save.player.flashbulbs),
      row('Second-Class Stamps', app.save.player.secondClass),
      row('Daily best streak', app.save.daily.best),
    ),
  ));
}
