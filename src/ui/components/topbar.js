import { h, icon } from '../dom.js';
import { levelInfo, introduced, placesRestored } from '../../core/progression.js';
import { openSettings } from './settings.js';

/** Back, the level badge (once introduced) and settings. There is no currency. */
export function topBar(app, { back = null, onChange } = {}) {
  const lvl = levelInfo(app.content, app.save.player.xp);
  const el = h('div.topbar',
    back ? h('button.iconbtn', { 'aria-label': 'Back', onclick: () => { app.sfx('ui.tap'); back(); } }, icon('back')) : null,
    introduced(app.save, app.content, 'level') ? h('button.chip.level-badge', { onclick: () => profile(app) },
      h('div.num', { text: String(lvl.level) }),
      h('div.col', { style: { gap: '3px' } }, h('div.t', { text: lvl.title }), h('div.bar', h('i', { style: { width: `${(lvl.into / lvl.need) * 100}%` } })))) : null,
    h('div.grow'),
    h('button.iconbtn.small', { 'aria-label': 'Settings', onclick: () => { app.sfx('ui.tap'); openSettings(app, onChange); } }, icon('gear')),
  );
  return { el };
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
      row('Places restored', `${placesRestored(app.save, app.content, app.village).done} of ${app.v.sceneOrder.length}`),
      row('Visits', app.save.stats.visits || 0),
      row('Photo walks', app.save.player.walks || 0),
      row('Things tidied', fixes),
      row('Marmalade spotted', s.cats),
      row('Best run', `${s.bestCombo} in a row`),
      row('Three-stamp cards', s.perfect),
      row('Flashbulbs', app.save.player.flashbulbs),
      row('Daily Postcards', app.save.daily.days || 0),
    ),
  ));
}
