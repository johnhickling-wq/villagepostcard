import { h, icon, wait } from '../dom.js';

/**
 * A letter from a villager (or the Postcard Company), shown as a modal.
 * Resolves when the reader taps the button.
 */
export function showLetter(app, { from, title, body, button = 'Continue', reward = null }) {
  const v = app.v;
  const who = v.villagers[from];
  const portrait = who ? h('div.letter-portrait.stamp', h('img', { src: app.assets.spriteUrl(who.portrait, app.village, 0.6), alt: '' })) : null;
  const text = h('div.letter-body.typed');
  const btn = h('button.btn.teal', { text: button });
  const skip = { done: false };
  const el = h('div.letter.card.paper.deckle',
    h('div.letter-head',
      portrait,
      h('div', h('div.label.muted', { text: who ? who.role : 'Wold & Vale Postcard Co.' }), h('div.display.letter-title', { text: title })),
    ),
    text,
    reward ? h('div.letter-reward.row', icon('fund'), h('span', { text: reward })) : null,
    h('div.letter-foot', btn),
  );
  const m = app.modal(el, { dismissable: false, cls: 'letter-modal' });
  app.sfx('page');
  // typewriter reveal, tap to finish
  (async () => {
    const paras = body.split('\n');
    for (const p of paras) {
      const para = h('p');
      text.append(para);
      if (skip.done) { para.textContent = p; continue; }
      for (let i = 0; i < p.length; i += 3) {
        if (skip.done) break;
        para.textContent = p.slice(0, i + 3);
        if (i % 12 === 0) app.sfx('tick');
        await wait(12);
      }
      para.textContent = p;
    }
    skip.done = true;
    btn.classList.add('pulse');
  })();
  el.addEventListener('click', () => { skip.done = true; });
  return new Promise((res) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!skip.done) { skip.done = true; return; }
      app.sfx('ui.tap');
      m.close();
      res();
    });
  });
}
