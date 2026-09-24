import { h } from '../dom.js';

export class BootScreen {
  constructor(app) {
    this.app = app;
    this.bar = h('i');
    this.msg = h('div.boot-msg.typed', { text: 'Loading…' });
    this.el = h('div.boot',
      h('div.boot-logo', h('div.script', { text: 'Postcard' }), h('div.display', { text: 'PERFECT' })),
      h('div.boot-bar', this.bar),
      this.msg,
    );
  }
  progress(k, text) {
    this.bar.style.width = `${Math.round(k * 100)}%`;
    if (text) this.msg.textContent = text;
  }
}
