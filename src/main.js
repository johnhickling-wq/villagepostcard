import { App } from './app.js';
import * as flows from './ui/flows.js';
import * as progression from './core/progression.js';
import { DEV_TOOLS } from './dev/flags.js';
import { watchErrors } from './dev/errors.js';

if (DEV_TOOLS) watchErrors();

const app = new App(document.getElementById('app'));
window.__app = app; // handy for debugging and the QA harness
window.__flows = flows;
window.__progression = progression;
app.boot().then(() => {
  // development only: the playtest bug button on every screen
  if (DEV_TOOLS) import('./dev/feedback.js').then((m) => m.installBugButton(app));
}).catch((err) => {
  console.error(err);
  const ui = document.getElementById('ui');
  ui.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:#f4ecd8;font:600 16px system-ui;padding:24px;text-align:center">Sorry, the village couldn't load.<br><small style="opacity:.7">${String(err.message || err)}</small></div>`;
});
