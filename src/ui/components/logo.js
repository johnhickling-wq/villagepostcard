import { h } from '../dom.js';

/** The cut-paper wordmark: "Postcard" in script over scrap-paper capitals. */
export function logo(size = 1) {
  const colors = ['#e3a72f', '#c9483b', '#2f7f7a', '#f4ecd8', '#2f4f86', '#8fa876', '#e38fb0'];
  const rot = [-5, 3, -2, 4, -4, 2, -3];
  const letters = 'PERFECT'.split('').map((ch, i) => h('span.logo-letter', {
    style: { background: colors[i], transform: `rotate(${rot[i]}deg) translateY(${i % 2 ? 3 : -2}px)`, color: i === 3 ? '#2c2a35' : '#fffdf7', animationDelay: `${0.35 + i * 0.07}s` },
    text: ch,
  }));
  return h('div.logo', { style: { '--s': size } },
    h('div.logo-script.script', { text: 'Postcard' }),
    h('div.logo-letters', letters),
  );
}
