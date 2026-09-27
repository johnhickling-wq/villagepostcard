// The developer panel (Settings -> Developer, while DEV_TOOLS is on). It
// plays any part of the game the way a player meets it:
//
//   story visits  as first met (the brief, a new job explained, the coached
//                 first visit), carried on after closing the game half-way,
//                 one job from the reveal, or the map as you arrive from the
//                 visit before (a newly opened place celebrated)
//   the finale    Judging Day, and the village after it
//   photo walks   any place, any weather postcard (1-5, Free Play), any
//                 weather, on an untouched, half-restored or restored village;
//                 the Daily Postcard
//
// Each jump builds a save that has really played the route up to that point
// (every earlier visit completed through the game's own rules, postcards
// included). The first jump puts the player's own village aside; "Back to my
// real village" brings it back. Nothing here is village-specific.

import { h } from '../ui/dom.js';
import { storage } from '../engine/storage.js';
import {
  newSave, planVisit, beginPlay, visitsOf, planWalk, introduced, completeJudging, SAVE_VERSION,
} from '../core/progression.js';
import { generateVisit } from '../core/mess.js';
import { PlaySession } from '../core/session.js';
import * as flows from '../ui/flows.js';

const REAL = 'postcard-perfect/save/dev-real';
const DEV_NOTE = 'devVillage';

export function openDevTools(app, { onClose } = {}) {
  const c = app.content, vid = app.village, v = app.v;
  const visits = visitsOf(c, vid);
  const stashed = readStash();
  const row = (label, sub, ...buttons) => h('div.dev-row', h('div.dev-row-text', h('div', { text: label }), sub ? h('div.label.muted', { text: sub }) : null), h('div.dev-btns', ...buttons));
  const btn = (text, fn) => h('button.chip.dev-btn', { onclick: () => { app.sfx('ui.tap'); sheet.close(); fn(); } }, h('span', { text }));

  const story = visits.map((visit, i) => {
    const place = c.scene(vid, visit.scene).name;
    const kind = visit.kind === 'restoration' ? '' : visit.kind === 'committee' ? ' · Committee' : ' · Incident';
    return row(`${i + 1}. ${visit.title}`, `${place}${kind}`,
      btn('Play', () => jumpVisit(app, i, 'fresh')),
      btn('Resume', () => jumpVisit(app, i, 'half')),
      btn('One to go', () => jumpVisit(app, i, 'last')),
      btn('Map', () => jumpMap(app, i)));
  });

  // photo walks
  const pick = (options, value) => h('select.dev-select', {}, options.map(([val, text]) => h('option', { value: val, text, ...(val === value ? { selected: 'selected' } : {}) })));
  const placeSel = pick(v.sceneOrder.map((sid) => [sid, c.scene(vid, sid).name]), v.start);
  const tierSel = pick([1, 2, 3, 4, 5, 6].map((t) => [String(t), t === 6 ? 'Free Play' : `Postcard ${t} (${c.conditions[Object.keys(c.tier(t).conditions)[0]].name})`]), '1');
  const condSel = pick([['', 'Its own weather'], ...Object.entries(c.conditions).map(([id, cd]) => [id, cd.name])], '');
  const stateSel = pick([['0', 'Village untouched'], [String(Math.floor(visits.length / 2)), 'Half restored'], [String(visits.length), 'Fully restored']], String(visits.length));

  const content = h('div.settings.dev-tools',
    h('div.display.sheet-title', { text: 'Developer' }),
    h('p.dev-note', { text: 'For testing only; this panel is removed for release. A jump replaces the village on this device until you go back to your real one.' }),
    stashed ? h('div.dev-real.card', h('span', { text: 'You are in a test village.' }),
      h('button.btn.teal.small', { onclick: () => backToReal(app) }, h('span', { text: 'Back to my real village' }))) : null,
    h('div.display.sheet-sub', { text: 'Story visits' }),
    h('p.dev-note', { text: 'Play: as first met. Resume: after closing half-way. One to go: one tap from the reveal. Map: arriving from the visit before.' }),
    ...story,
    h('div.display.sheet-sub', { text: 'The finale' }),
    row('Judging Day', 'every visit done', btn('Play', () => jumpJudging(app, false))),
    row('After the judging', 'the village as Best-Kept Village', btn('Map', () => jumpJudging(app, true))),
    h('div.display.sheet-sub', { text: 'Photo walks' }),
    h('div.dev-walk', placeSel, tierSel, condSel, stateSel,
      h('button.btn.teal.small', { onclick: () => { sheet.close(); jumpWalk(app, placeSel.value, +tierSel.value, condSel.value || null, +stateSel.value); } }, h('span', { text: 'Take the walk' }))),
    row('The Daily Postcard', 'today’s walk, on a fully restored village', btn('Play', () => jumpDaily(app))),
    h('div.display.sheet-sub', { text: 'Playtest reports' }),
    row('Your reports', 'made with the bug button at the left edge of any screen', btn('Open', () => import('./feedback.js').then((m) => m.openReports(app, { onClose })))),
    h('div.display.sheet-sub', { text: 'Introductions' }),
    row('Show every introduction again', 'new-job lines, coach tips, map cues', btn('Reset', () => { resetIntros(app.save); app.persist(true); app.toast('Introductions will show again.'); })),
  );
  const sheet = app.sheet(content, { cls: 'dev-sheet', onClose });
}

// ------------------------------------------------------------- saves ---

function readStash() {
  try { return storage.backend.get(REAL); } catch { return null; }
}

/** Put the player's own village aside (once), then make `save` the one in play. */
function useSave(app, save) {
  if (!readStash() && !app.save.flags?.[DEV_NOTE]) {
    try { storage.backend.set(REAL, JSON.stringify(app.save)); } catch { /* can't keep it: carry on */ }
  }
  save.flags[DEV_NOTE] = true;
  app.save = save;
  app.persist(true);
}

function backToReal(app) {
  const raw = readStash();
  if (!raw) return;
  try { storage.backend.remove(REAL); } catch { /* nothing to remove */ }
  const real = JSON.parse(raw);
  app.resetting = true;
  storage.reset(real);
  location.reload();
}

/**
 * A save that has played the first `n` visits of the route through the
 * game's own rules (each completed perfectly, with its postcard), with the
 * introductions a player would have seen by then.
 */
export function seededSave(app, n) {
  const c = app.content, vid = app.village;
  const save = newSave(c);
  Object.assign(save.settings, app.save.settings);
  save.flags.intro = true;
  const route = visitsOf(c, vid).slice(0, n);
  const real = app.save;
  app.save = save; // commitPlay works on app.save
  try {
    for (const visit of route) {
      const plan = planVisit(save, c, vid, visit.id);
      beginPlay(save, plan);
      const mess = generateVisit(c, { village: vid, visit: visit.id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, collectible: plan.collectible, cat: plan.cat });
      const s = new PlaySession(c, mess, plan);
      for (const f of mess.faults) s.tap(f.cx, f.cy, 4);
      for (const t of Object.keys(s.fixes)) save.flags.seen[`job:${t}`] = true;
      flows.commitPlay(app, plan, mess, s.results());
    }
  } finally {
    app.save = real;
  }
  // the coach's tips and map cues a player would already have had
  for (const f of Object.keys(c.intro.cards || {})) if (introduced(save, c, f) && (c.intro.features?.[f] ?? 99) < n) save.flags.seen[`intro:${f}`] = true;
  if (n >= 2) for (const k of ['coach:loupe', 'coach:loupeClearer', 'coach:zoom']) save.flags.seen[k] = true;
  save.v = SAVE_VERSION;
  return save;
}

function resetIntros(save) {
  for (const k of Object.keys(save.flags.seen)) if (/^(job|coach|intro):/.test(k)) delete save.flags.seen[k];
}

// ------------------------------------------------------------- jumps ---

/** mode: 'fresh' as first met, 'half' carried on after a reload, 'last' one job from the reveal. */
function jumpVisit(app, i, mode) {
  const c = app.content, vid = app.village;
  const visit = visitsOf(c, vid)[i];
  const save = seededSave(app, i);
  if (mode !== 'fresh') {
    const plan = planVisit(save, c, vid, visit.id);
    const p = beginPlay(save, plan);
    const mess = generateVisit(c, { village: vid, visit: visit.id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, collectible: plan.collectible, cat: plan.cat });
    const ids = mess.faults.map((f) => f.id);
    p.done = mode === 'last' ? ids.slice(0, -1) : ids.slice(0, Math.floor(ids.length / 2));
    p.t = 20;
    // they met these jobs before they left
    for (const f of mess.faults) if (p.done.includes(f.id)) save.flags.seen[`job:${f.type}`] = true;
    save.active = null;
  }
  useSave(app, save);
  return flows.playVisit(app, visit.id);
}

function jumpMap(app, i) {
  const c = app.content, vid = app.village;
  const save = seededSave(app, i);
  useSave(app, save);
  const prev = visitsOf(c, vid)[i - 1];
  const receipt = prev ? save.villages[vid].visits[prev.id]?.receipt : null;
  const next = visitsOf(c, vid)[i];
  return flows.goMap(app, receipt ? { transition: 'iris', from: 'reveal', receipt, focus: next.scene, next: true } : { transition: 'iris' });
}

function jumpJudging(app, after) {
  const save = seededSave(app, visitsOf(app.content, app.village).length);
  useSave(app, save);
  if (!after) return flows.judging(app);
  // the verdict, without the ceremony
  completeJudging(app.save, app.content, app.village);
  app.persist(true);
  return flows.goMap(app, { transition: 'iris' });
}

function jumpWalk(app, sid, tier, condition, n) {
  const c = app.content, vid = app.village;
  const save = seededSave(app, n);
  save.player.plays = Math.max(save.player.plays, c.intro.features?.walks ?? 3);
  // the weather postcards before this one are in the album
  const ss = save.villages[vid].scenes[sid];
  ss.tier = Math.min(5, tier - 1);
  useSave(app, save);
  const plan = planWalk(save, c, vid, sid, { tier, ...(condition ? { condition } : {}) });
  // photo walks use the jobs the story has taught; a dev walk at any point may use them all
  plan.types = Object.keys(c.faults).filter((t) => !c.faults[t].story);
  return flows.playWalk(app, sid, { plan });
}

function jumpDaily(app) {
  const save = seededSave(app, visitsOf(app.content, app.village).length);
  save.player.plays = Math.max(save.player.plays, app.content.intro.features?.daily ?? 9);
  useSave(app, save);
  return flows.playDaily(app);
}

