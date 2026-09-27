// Development only: keep the last few errors, so a playtest report can say
// what went wrong behind the scenes (src/dev/feedback.js).

export const recentErrors = [];

function keep(kind, detail) {
  recentErrors.push({ t: new Date().toISOString(), kind, detail: String(detail).slice(0, 400) });
  if (recentErrors.length > 12) recentErrors.shift();
}

export function watchErrors() {
  const orig = console.error.bind(console);
  console.error = (...args) => { keep('console', args.map((a) => (a?.stack || a?.message || a)).join(' ')); orig(...args); };
  window.addEventListener('error', (e) => keep('error', `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => keep('promise', e.reason?.stack || e.reason));
}
