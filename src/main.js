import { App } from './app.js';
import * as flows from './ui/flows.js';
import * as progression from './core/progression.js';

const app = new App(document.getElementById('app'));
window.__app = app; // handy for debugging and the QA harness
window.__flows = flows;
window.__progression = progression;
app.boot().catch((err) => {
  console.error(err);
  const ui = document.getElementById('ui');
  ui.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:#f4ecd8;font:600 16px system-ui;padding:24px;text-align:center">Sorry, the village couldn't load.<br><small style="opacity:.7">${String(err.message || err)}</small></div>`;
});
