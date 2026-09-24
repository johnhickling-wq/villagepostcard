import { h, icon } from '../dom.js';
import { storage } from '../../engine/storage.js';

export function openSettings(app, onChange) {
  const s = app.save.settings;
  const toggle = (key, label, ico) => {
    const sw = h('button.switch' + (s[key] ? '.on' : ''), { role: 'switch', 'aria-checked': String(!!s[key]) }, h('i'));
    sw.addEventListener('click', () => {
      s[key] = !s[key];
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
    h('div.display.sheet-sub', { text: 'Your postcards' }),
    group('frames', 'Frames'),
    group('films', 'Film'),
    group('postmarks', 'Postmarks'),
    h('div.about.card',
      h('div.script', { text: 'Postcard Perfect' }),
      h('p', { text: 'A cosy tidy-up game. Hand-made collage art, synthesised sound, no ads and no energy meters. Your progress is saved on this device.' }),
      h('button.btn.ink.small', { onclick: () => resetProgress(app) }, h('span', { text: 'Start again' })),
    ),
  );
  const sheet = app.sheet(content, { onClose: onChange });
}

function resetProgress(app) {
  const yes = h('button.btn', { text: 'Yes, start again' });
  const no = h('button.btn.teal.small', { text: 'Keep my village' });
  const m = app.modal(h('div.celebrate.card.paper', h('div.display.celebrate-title', { text: 'Start again?' }), h('p', { text: 'This erases your postcards, restoration and scrapbook on this device.' }), h('div.col', yes, no)));
  no.addEventListener('click', () => m.close());
  yes.addEventListener('click', () => { storage.clear(); location.reload(); });
}
