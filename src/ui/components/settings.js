import { h, icon } from '../dom.js';
import { DEV_TOOLS } from '../../dev/flags.js';

export function openSettings(app, onChange) {
  const s = app.save.settings;
  const value = (key) => (key === 'reducedMotion' ? app.reducedMotion : !!s[key]);
  const toggle = (key, label, ico) => {
    const sw = h('button.switch' + (value(key) ? '.on' : ''), { role: 'switch', 'aria-checked': String(value(key)), 'aria-label': label }, h('i'));
    sw.addEventListener('click', () => {
      s[key] = !value(key);
      sw.classList.toggle('on', s[key]);
      sw.setAttribute('aria-checked', String(s[key]));
      app.applySettings();
      if (key === 'music' && s.music) app.audio.startMusic('map');
      app.sfx('ui.toggle');
      if (key === 'haptics' && s.haptics) app.haptic('medium');
      app.persist();
    });
    return h('div.setting.row', icon(ico), h('span.grow', { text: label }), sw);
  };
  const cos = app.content.cosmetics;
  const owned = new Set(app.save.cosmetics.owned);
  const group = (kind, title) => {
    const list = Object.entries(cos[kind]);
    return h('div.cos-group', { 'data-kind': kind },
      h('div.label.muted', { text: title }),
      h('div.cos-list', list.map(([id, c]) => {
        const have = owned.has(id);
        const on = app.save.cosmetics.equipped[kind] === id;
        return h('button.cos' + (on ? '.on' : '') + (have ? '' : '.locked'), {
          onclick: (e) => {
            if (!have) return app.toast(`${c.name}: earn it through levels, sets or friendships.`, { ms: 2200 });
            app.save.cosmetics.equipped[kind] = id;
            app.persist();
            app.sfx('ui.toggle');
            sheet.el.querySelectorAll(`.cos-group[data-kind="${kind}"] .cos`).forEach((b) => b.classList.remove('on'));
            e.currentTarget.classList.add('on');
          },
        }, h('span.cos-name', { text: c.name }), h('span.cos-desc', { text: have ? c.desc : 'Locked' }), have ? null : icon('lock'));
      })),
    );
  };
  const content = h('div.settings',
    h('div.display.sheet-title', { text: 'Settings' }),
    toggle('sfx', 'Sound effects', 'sound'),
    toggle('music', 'Music', 'music'),
    toggle('haptics', 'Haptics', 'vibrate'),
    toggle('reducedMotion', 'Reduce motion', 'eye'),
    h('div.display.sheet-sub', { text: 'Progress' }),
    h('div.setting.progress-row',
      h('div.grow', h('div', { text: 'Start again' }), h('div.label.muted', { text: 'A fresh village from the first visit.' })),
      h('button.btn.ink.small', { 'data-act': 'start-again', onclick: () => resetProgress(app) }, h('span', { text: 'Start again' })),
    ),
    DEV_TOOLS ? h('div.setting.progress-row.dev-entry',
      h('div.grow', h('div', { text: 'Developer' }), h('div.label.muted', { text: 'Testing tools: play any visit, walk or the finale. Removed for release.' })),
      h('button.btn.small', { 'data-act': 'developer', onclick: () => { app.sfx('ui.tap'); sheet.close(); import('../../dev/devtools.js').then((m) => m.openDevTools(app)); } }, h('span', { text: 'Open' })),
    ) : null,
    h('div.display.sheet-sub', { text: 'Your postcards' }),
    group('frames', 'Frames'),
    group('films', 'Film'),
    group('postmarks', 'Postmarks'),
    h('div.about.card',
      h('div.script', { text: 'Postcard Perfect' }),
      h('p', { text: 'A cosy restoration game. Cut-paper collage art, synthesised sound, no ads, no energy meters and nothing to buy while you play. Your progress is saved on this device.' }),
    ),
  );
  const sheet = app.sheet(content, { onClose: onChange });
}

function resetProgress(app) {
  const yes = h('button.btn.small', { 'data-act': 'confirm-reset', text: 'Yes, start again' });
  const no = h('button.btn.teal', { 'data-act': 'cancel-reset', text: 'Keep my village' });
  const m = app.modal(h('div.celebrate.card.paper',
    h('div.display.celebrate-title', { text: 'Start again?' }),
    h('p', { text: 'Every visit, postcard, keepsake and level on this device will be cleared, and Honeycombe starts again from the station. This can’t be undone. Your sound and motion settings stay as they are.' }),
    h('div.col', no, yes)));
  no.addEventListener('click', () => { app.sfx('ui.tap'); m.close(); });
  yes.addEventListener('click', () => { yes.disabled = true; no.disabled = true; app.startAgain(); });
}
