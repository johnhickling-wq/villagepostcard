import { h, icon, countUp } from '../dom.js';
import { levelInfo, rosettes } from '../../core/progression.js';
import { openSettings } from './settings.js';

/** Level badge, pennies, rosettes and settings. */
export function topBar(app, { back = null, onChange } = {}) {
  const lvl = levelInfo(app.content, app.save.player.xp);
  const pennies = h('span', { text: app.save.player.pennies.toLocaleString('en-GB') });
  const penniesChip = h('div.chip.pennies', icon('penny'), pennies);
  const ros = rosettes(app.save, app.village);
  const el = h('div.topbar',
    back ? h('button.iconbtn', { 'aria-label': 'Back', onclick: () => { app.sfx('ui.tap'); back(); } }, icon('back')) : null,
    h('button.chip.level-badge', { onclick: () => profile(app) },
      h('div.num', { text: String(lvl.level) }),
      h('div.col', { style: { gap: '3px' } }, h('div.t', { text: lvl.title }), h('div.bar', h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } })))),
    h('div.grow'),
    penniesChip,
    h('div.chip', icon('rosette'), h('span', { text: String(ros) })),
    h('button.iconbtn.small', { 'aria-label': 'Settings', onclick: () => { app.sfx('ui.tap'); openSettings(app, onChange); } }, icon('gear')),
  );
  return {
    el,
    animatePennies(from, to) {
      pennies.textContent = from.toLocaleString('en-GB');
      setTimeout(() => {
        app.sfx('coin');
        penniesChip.classList.add('bump');
        countUp(pennies, to, { from, dur: 900, tick: () => app.sfx('tick') });
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
      row('Best combo', `×${s.bestCombo}`),
      row('Three-stamp cards', s.perfect),
      row('Flashbulbs', app.save.player.flashbulbs),
      row('Second-Class Stamps', app.save.player.secondClass),
      row('Daily best streak', app.save.daily.best),
    ),
  ));
}
