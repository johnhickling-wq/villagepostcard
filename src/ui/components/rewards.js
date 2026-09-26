// Celebrations: level ups, new keepsakes, completed sets, friendship
// letters, the stamp card. After a visit they wait as small chips on the
// results rail (celebrateEvent) rather than holding up the next step; a
// claimed favour on the noticeboard plays them in turn (showRewardsQueue).

import { h, icon } from '../dom.js';
import { showLetter } from './letter.js';
import { introduced } from '../../core/progression.js';

function cosmeticName(app, id) {
  const c = app.content.cosmetics;
  return c.frames[id]?.name || c.films[id]?.name || c.postmarks[id]?.name || id;
}

export function rewardList(app, reward) {
  const items = [];
  if (reward.xp) items.push(h('div.rw', icon('camera'), h('span', { text: `${reward.xp} experience` })));
  if (reward.flashbulbs) items.push(h('div.rw', h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.3) }), h('span', { text: `${reward.flashbulbs} flashbulb${reward.flashbulbs > 1 ? 's' : ''}` })));
  if (reward.cosmetic) items.push(h('div.rw', icon('sparkle'), h('span', { text: `New look: ${cosmeticName(app, reward.cosmetic)}` })));
  if (reward.perk) items.push(h('div.rw', icon('eye'), h('span', { text: app.content.levels.perks[reward.perk].text })));
  return h('div.reward-list', items);
}

function celebrate(app, content, { button = 'Lovely!', cls = '' } = {}) {
  const btn = h('button.btn.teal', { text: button });
  const box = h(`div.celebrate.card.paper.deckle${cls ? '.' + cls : ''}`, content, h('div.celebrate-foot', btn));
  const m = app.modal(box, { dismissable: false });
  return new Promise((res) => btn.addEventListener('click', () => { app.sfx('ui.tap'); m.close(); res(); }));
}

/** One celebration, on demand (a chip on the results rail). */
export function celebrateEvent(app, ev) {
  if (ev.kind === 'levelUp') return showRewardsQueue(app, { levelUps: [ev], events: [], sets: [] }, { levels: true });
  if (ev.kind === 'set') return showRewardsQueue(app, { levelUps: [], events: [], sets: [ev.set] });
  return showRewardsQueue(app, { levelUps: [], events: [ev], sets: [] });
}

export async function showRewardsQueue(app, out, { levels = false } = {}) {
  // before levels are introduced, experience (and its rewards) build up quietly
  const levelUps = levels || introduced(app.save, app.content, 'level') ? out.levelUps || [] : [];
  for (const lu of levelUps) {
    app.sfx('levelup');
    app.haptic('success');
    await celebrate(app, h('div.col.center',
      h('div.label.muted', { text: 'Photographer level' }),
      h('div.levelup-badge.display.pop-in', { text: String(lu.level) }),
      h('div.display.celebrate-title', { text: lu.title }),
      rewardList(app, lu.reward),
    ), { button: 'Splendid!', cls: 'levelup' });
  }
  for (const ev of out.events || []) {
    if (ev.kind === 'collectible') {
      const set = ev.set;
      const owned = set.items.filter((i) => app.save.collect.owned[i.id]).length;
      app.sfx('collect');
      await celebrate(app, h('div.col.center',
        h('div.label.muted', { text: 'A keepsake for the scrapbook' }),
        h('div.keepsake.pop-in', h('img', { src: app.assets.spriteUrl(ev.item.sprite, app.village, 0.8), alt: '' })),
        h('div.display.celebrate-title', { text: ev.item.name }),
        h('div.label', { text: `${set.name} · ${owned} of ${set.items.length}` }),
        h('p.hand.keepsake-text', { text: ev.item.text }),
      ), { button: 'Into the scrapbook' });
    }
    if (ev.kind === 'mastered') {
      app.sfx('rosette');
      await celebrate(app, h('div.col.center',
        h('div.mastered-badge.pop-in', icon('rosette')),
        h('div.display.celebrate-title', { text: 'Every weather!' }),
        h('p.hand', { text: `You've photographed ${app.content.scene(app.village, ev.scene).name} in all five weathers. A gold postcard is in your album.` }),
      ), { button: 'Marvellous!' });
    }
    if (ev.kind === 'daily') {
      app.sfx('stamp');
      await celebrate(app, h('div.col.center',
        h('div.label.muted', { text: 'Daily Postcard' }),
        h('div.display.celebrate-title', { text: `A stamp for day ${ev.day}!` }),
        h('div.streak-card', Array.from({ length: 7 }, (_, i) => h('div.streak-day' + (i < ev.day ? '.on' : '') + (i === ev.day - 1 ? '.today' : ''), h('span.label', { text: `Day ${i + 1}` }), i < ev.day ? icon('check') : null))),
        rewardList(app, ev.reward),
      ), { button: 'Lovely' });
    }
    if (ev.kind === 'friendship') {
      await showLetter(app, { from: ev.villager, title: 'A letter for you', body: ev.letter, button: 'How kind' });
    }
    if (ev.kind === 'duplicate') app.toast(`Another ${ev.item.name} for the scrapbook`, { ms: 2400 });
    if (ev.kind === 'newPostcard' && !app.save.flags.seen.album) app.save.flags.seen.album = true;
  }
  for (const set of out.sets || []) {
    app.sfx('levelup');
    await celebrate(app, h('div.col.center',
      h('div.label.muted', { text: 'Scrapbook set complete' }),
      h('div.set-fan', set.items.map((it, i) => h('img', { src: app.assets.spriteUrl(it.sprite, app.village, 0.5), style: { transform: `rotate(${(i - 2) * 12}deg) translateY(${Math.abs(i - 2) * 6}px)` } }))),
      h('div.display.celebrate-title', { text: set.name }),
      rewardList(app, set.reward),
    ), { button: 'Wonderful!' });
  }
  app.persist();
}
