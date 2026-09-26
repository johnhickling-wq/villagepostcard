// The village noticeboard: three pinned requests from the villagers, plus
// everyone's friendship hearts and the letters they've written you.

import { h, icon, wait } from '../dom.js';
import { topBar } from '../components/topbar.js';
import { goMap } from '../flows.js';
import { claimRequest, friendshipLevel, refillRequests } from '../../core/progression.js';
import { showRewardsQueue } from '../components/rewards.js';
import { showLetter } from '../components/letter.js';

export class NoticeboardScreen {
  constructor(app) {
    this.app = app;
    this.el = h('div.notice');
    refillRequests(app.save, app.content, app.village);
    this.render();
  }

  render() {
    const app = this.app;
    this.el.innerHTML = '';
    this.top = topBar(app, { back: () => goMap(app) });
    const board = h('div.cork');
    board.append(h('div.notice-header.card.paper', h('div.display', { text: 'Village Noticeboard' }), h('div.hand', { text: 'Little jobs from the neighbours. New ones go up as soon as you finish.' })));
    app.save.requests.active.forEach((r, i) => board.append(this.note(r, i)));
    board.append(this.friends());
    this.el.append(h('div.notice-scroll', board), this.top.el);
  }

  note(r, i) {
    const app = this.app;
    const vg = app.v.villagers[r.villager];
    const done = r.progress >= r.count;
    const pct = Math.round((r.progress / r.count) * 100);
    const rw = [h('span.nr-item', icon('fund'), h('b', { text: String(r.reward.fund) })), h('span.nr-item', h('b', { text: `+${r.reward.xp}` }), h('span', { text: 'xp' }))];
    if (r.reward.flashbulbs) rw.push(h('span.nr-item', h('img', { src: app.assets.spriteUrl('ui/flashbulb', 'common', 0.2) }), h('b', { text: `×${r.reward.flashbulbs}` })));
    if (r.reward.collectible) rw.push(h('span.nr-item', icon('sparkle'), h('span', { text: 'keepsake' })));
    const el = h('div.req-note.card' + (done ? '.done' : ''), { style: { '--rot': `${[-2.5, 1.8, -1.2][i % 3]}deg` } },
      h('div.pushpin'),
      h('div.req-top',
        h('div.req-portrait', h('img', { src: app.assets.spriteUrl(vg.portrait, app.village, 0.4), alt: '' })),
        h('div', h('div.display.req-name', { text: vg.name }), h('div.label.muted', { text: vg.role })),
      ),
      h('p.hand.req-text', { text: r.text }),
      h('div.req-goal', h('div.label', { text: r.goal }), h('div.req-bar', h('i', { style: { width: `${pct}%` } })), h('span.req-count', { text: `${r.progress} / ${r.count}` })),
      h('div.req-foot', h('div.req-rewards', rw),
        done ? h('button.btn.small.mustard.pulse', { onclick: () => this.claim(r) }, h('span', { text: 'Collect' })) : null),
      done ? h('div.req-done-stamp.display', { text: 'Done!' }) : null,
    );
    return el;
  }

  async claim(r) {
    const app = this.app;
    const before = app.save.player.fund;
    const out = claimRequest(app.save, app.content, app.village, r.id);
    if (!out) return;
    app.persist(true);
    app.sfx('coin');
    app.haptic('success');
    const vg = app.v.villagers[r.villager];
    app.toast([h('img', { src: app.assets.spriteUrl(vg.portrait, app.village, 0.3) }), `“${vg.thanks[r.id.length % vg.thanks.length]}”`], { ms: 2600 });
    this.render();
    this.top.animateFund(before, app.save.player.fund);
    // let the thanks be read before a level-up (which clears it) takes over
    if (out.levelUps.length || out.events.length) await wait(1400);
    await showRewardsQueue(app, out);
    this.render();
  }

  friends() {
    const app = this.app;
    const people = Object.entries(app.v.villagers).filter(([, v]) => !v.letterOnly);
    return h('div.friends.card.paper',
      h('div.display.friends-title', { text: 'Friends in Honeycombe' }),
      h('div.friends-grid', people.map(([id, v]) => {
        const f = friendshipLevel(app.save, app.content, id);
        const hearts = Array.from({ length: 5 }, (_, i) => h('span.heart' + (i < f.level ? '.on' : ''), icon(i < f.level ? 'heart' : 'heartEmpty')));
        return h('button.friend', { onclick: () => this.letters(id) },
          h('img', { src: app.assets.spriteUrl(v.portrait, app.village, 0.35), alt: '' }),
          h('div.friend-name', { text: v.short }),
          h('div.hearts', hearts),
        );
      })),
    );
  }

  async letters(id) {
    const app = this.app;
    const v = app.v.villagers[id];
    const f = friendshipLevel(app.save, app.content, id);
    app.sfx('ui.tap');
    if (!f.level) {
      app.toast(`Help ${v.short} with a request or two and they'll write to you.`, { ms: 2600 });
      return;
    }
    const body = v.letters.slice(0, f.level).join('\n\n');
    await showLetter(app, { from: id, title: `Letters from ${v.short}`, body, button: 'Close' });
  }
}
