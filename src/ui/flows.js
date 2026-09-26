// Game flows that cross screens: the opening, playing a visit or a photo
// walk, carrying on after a reload, finishing (the save first, the ceremony
// after), and the finale.

import {
  planVisit, planWalk, beginPlay, resumePlan, pendingWalk, completeVisit, completeWalk, dailyInfo, completeJudging,
  placeBloom, effectsDone, fixedIn, visitsOf, nextVisit,
} from '../core/progression.js';
import { generateMess, generateVisit } from '../core/mess.js';
import { makeSnapshot } from '../render/stills.js';
import { h, icon } from './dom.js';

/** The opening: one sentence, then straight to the platform. */
export async function startGame(app) {
  const s = app.save;
  if (!s.flags.intro) {
    await showOpening(app);
    s.flags.intro = true;
    app.persist(true);
  }
  const plan = resumePlan(s);
  if (plan) return resume(app, plan);
  const first = visitsOf(app.content, app.village)[0];
  if (!app.vs.visits[first.id]) return playVisit(app, first.id);
  return goMap(app);
}

function showOpening(app) {
  const v = app.v;
  const go = h('button.btn.teal.big', {}, icon('train'), h('span', { text: `Off to ${app.content.scene(app.village, v.start).short || 'the station'}` }));
  const m = app.modal(h('div.opening.card.paper.deckle',
    h('div.label.muted', { text: `${v.region} · ${v.year}` }),
    h('p.opening-line.display', { text: v.opening }),
    h('div.opening-foot', go),
  ), { dismissable: false, cls: 'opening-modal' });
  return new Promise((res) => go.addEventListener('click', () => { app.sfx('whistle'); m.close(); res(); }));
}

export async function goMap(app, opts = {}) {
  const { MapScreen } = await import('./screens/map.js');
  app.audio.startMusic('map');
  return app.show(new MapScreen(app, opts), { transition: opts.transition || 'fade' });
}

/** Carry on with whatever was on screen when the game was closed. */
export function resume(app, plan) {
  return plan.mode === 'visit' ? playVisit(app, plan.visit) : playWalk(app, plan.scene, { plan });
}

export async function playVisit(app, visitId) {
  const plan = planVisit(app.save, app.content, app.village, visitId);
  const progress = beginPlay(app.save, plan);
  app.persist(true);
  const mess = generateVisit(app.content, {
    village: plan.village, visit: visitId, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed,
    collectible: plan.collectible, cat: plan.cat,
  });
  return showPlay(app, plan, mess, progress);
}

/** An optional photo walk (or, with opts.daily, the Daily Postcard). */
export async function playWalk(app, sceneId, opts = {}) {
  const plan = opts.plan || pendingWalk(app.save, sceneId, opts.daily || null) || planWalk(app.save, app.content, app.village, sceneId, opts);
  const progress = beginPlay(app.save, plan);
  app.persist(true);
  const mess = generateMess(app.content, {
    village: plan.village, scene: plan.scene, tier: plan.tier, condition: plan.condition, seed: plan.seed,
    projectsDone: plan.effects, fixed: plan.fixed, protect: plan.protect, policy: true,
    collectible: plan.collectible, types: plan.script ? null : plan.types, cat: plan.cat, script: plan.script,
  });
  return showPlay(app, plan, mess, progress);
}

async function showPlay(app, plan, mess, progress) {
  const { PlayScreen } = await import('./screens/play.js');
  await app.assets.image(app.content.scene(plan.village, plan.scene).plate, plan.village);
  return app.show(new PlayScreen(app, plan, mess, progress), { transition: 'iris' });
}

export async function playDaily(app) {
  const d = dailyInfo(app.save, app.content, app.village);
  return playWalk(app, d.scene, { daily: d.date, tier: d.tier, condition: d.condition, seed: d.seed });
}

/**
 * The last thing is fixed: commit everything to the save before any
 * ceremony, so a reload during the reveal keeps the result (and a second
 * commit changes nothing).
 */
export function commitPlay(app, play, mess, result) {
  const vid = play.village;
  const before = { effects: play.effects, fixed: play.fixed, bloom: play.bloom };
  let receipt;
  if (play.mode === 'visit') {
    const visit = app.content.visit(vid, play.visit);
    const after = {
      effects: [...new Set([...play.effects, ...visit.effects])],
      fixed: [...new Set([...play.fixed, ...fixedAfter(app, visit)])],
      bloom: placeBloom(app.save, app.content, vid, play.scene, visit.id),
    };
    receipt = completeVisit(app.save, app.content, play, result, makeSnapshot(mess, before, after));
    receipt.after = after;
  } else {
    receipt = completeWalk(app.save, app.content, play, result, makeSnapshot(mess, before, before));
    receipt.after = before;
  }
  receipt.saved = app.persist(true);
  return receipt;
}

function fixedAfter(app, visit) {
  const scene = app.content.scene(app.village, visit.scene);
  return visit.tasks.filter((t) => t.target && ['faded', 'grimy', 'wilted'].includes(t.op) && (scene.neglect || []).some((n) => n.target === t.target && n.type === t.op)).map((t) => t.target);
}

export async function showReveal(app, data) {
  const { RevealScreen } = await import('./screens/results.js');
  return app.show(new RevealScreen(app, data), { transition: 'none', instant: true });
}

export async function leavePlay(app) {
  return goMap(app, { transition: 'iris' });
}

/** Go to the story's next step directly. */
export function goNext(app) {
  const next = nextVisit(app.save, app.content, app.village);
  if (next) return playVisit(app, next.id);
  return goMap(app, { transition: 'iris' });
}

export async function judging(app) {
  const { JudgingScreen } = await import('./screens/judging.js');
  const out = completeJudging(app.save, app.content, app.village);
  app.persist(true);
  return app.show(new JudgingScreen(app, out), { transition: 'iris' });
}

/** Permanent state of a place right now (for the finale and the map). */
export function placeState(app, sid) {
  return { effects: effectsDone(app.save, app.village), fixed: fixedIn(app.save, app.village, sid), bloom: placeBloom(app.save, app.content, app.village, sid) };
}
