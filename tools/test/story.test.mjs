// The restoration route and its saves.
//   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFromDisk } from '../lib/node-content.mjs';
import * as P from '../../src/core/progression.js';
import { generateVisit, generateMess, activeProps, activeNeglect } from '../../src/core/mess.js';
import { PlaySession } from '../../src/core/session.js';
import { Rng } from '../../src/core/rng.js';

const c = await loadFromDisk();
const V = 'honeycombe';
const clone = (x) => JSON.parse(JSON.stringify(x));
const reload = (save) => P.migrate(clone(save), c); // what the game does at boot

/** Play a visit to the end with a perfect player; returns the receipt. */
function playVisit(save, id, { reloadHalfway = false } = {}) {
  let plan = P.planVisit(save, c, V, id);
  let progress = P.beginPlay(save, plan);
  let mess = generateVisit(c, { village: V, visit: id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, collectible: plan.collectible, cat: plan.cat });
  let s = new PlaySession(c, mess, plan, { resume: progress });
  const half = Math.floor(mess.faults.length / 2);
  let fixedCount = 0;
  for (const f of mess.faults.filter((x) => s.remaining.has(x.id))) {
    if (s.done) break;
    const ev = s.tap(f.cx, f.cy, 4);
    assert.equal(ev.kind, 'fix', `${id}: tapping ${f.id} at its centre fixes it`);
    P.checkpoint(save, s.progress());
    if (reloadHalfway && ++fixedCount === half) {
      save = reload(save);
      plan = P.resumePlan(save);
      assert.ok(plan, 'the unfinished visit is remembered');
      progress = P.beginPlay(save, P.planVisit(save, c, V, id));
      mess = generateVisit(c, { village: V, visit: id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, collectible: plan.collectible, cat: plan.cat });
      s = new PlaySession(c, mess, plan, { resume: progress });
      assert.equal(s.left, mess.faults.length - half, 'finished tasks stay finished after a reload');
      return { save, resumed: true, left: s.left };
    }
  }
  assert.ok(s.done, `${id} finishes`);
  const r = s.results();
  return { save, receipt: P.completeVisit(save, c, plan, r, { rv: 2 }) };
}

test('the whole route can be played in story order, then judged once', () => {
  let save = P.newSave(c, 1_700_000_000_000);
  const order = [];
  for (let guard = 0; guard < 40; guard++) {
    const next = P.nextVisit(save, c, V);
    if (!next) break;
    order.push(next.id);
    ({ save } = playVisit(save, next.id));
    save = reload(save);
  }
  assert.deepEqual(order, c.village(V).visits.map((v) => v.id), 'the next step always follows the route');
  assert.ok(P.judgingReady(save, c, V));
  assert.equal(P.placesRestored(save, c, V).done, 8);
  assert.ok(P.completeJudging(save, c, V));
  assert.equal(P.completeJudging(save, c, V), null, 'judging rewards are granted once');
  assert.equal(P.nextStep(save, c, V).kind, 'free');
});

test('any order of available visits reaches the finale (no stranding)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rng = new Rng(seed);
    let save = P.newSave(c, 1_700_000_000_000 + seed);
    for (let guard = 0; guard < 40; guard++) {
      const avail = P.availableVisits(save, c, V);
      if (!avail.length) break;
      ({ save } = playVisit(save, rng.pick(avail).id));
    }
    assert.ok(P.storyComplete(save, c, V), `run ${seed} completes the story`);
  }
});

test('the first three places open by playing, never by paying', () => {
  let save = P.newSave(c);
  assert.deepEqual(P.openScenes(save, c, V), ['railway-halt']);
  for (const id of ['halt-tidy', 'hs-refresh']) ({ save } = playVisit(save, id));
  assert.ok(P.placeStatus(save, c, V, 'village-green').open);
  assert.equal(P.nextStep(save, c, V).label, 'Visit the Village Green');
  ({ save } = playVisit(save, 'green-tidy'));
  assert.equal(P.nextStep(save, c, V).label, 'Return to the Halt: plant the tubs');
});

test('the High Street repaint makes the kiosk and pillar box the job', () => {
  const save = P.newSave(c);
  playVisit(save, 'halt-tidy');
  const plan = P.planVisit(save, c, V, 'hs-refresh');
  const mess = generateVisit(c, { village: V, visit: 'hs-refresh', seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, cat: false });
  const faded = mess.faults.filter((f) => f.type === 'faded').map((f) => f.region).sort();
  assert.deepEqual(faded, ['kiosk', 'postbox']);
  const s = new PlaySession(c, mess, plan);
  const kiosk = mess.faults.find((f) => f.region === 'kiosk');
  const ev = s.tap(kiosk.cx, kiosk.cy, 4);
  assert.equal(ev.kind, 'fix');
  assert.equal(s.remainingByType().faded.left, 1, 'the count goes down');
});

test('finishing twice changes nothing; reloading mid-visit keeps finished tasks', () => {
  let save = P.newSave(c);
  ({ save } = playVisit(save, 'halt-tidy'));
  const r = playVisit(save, 'hs-refresh', { reloadHalfway: true });
  assert.ok(r.resumed && r.left > 0);
  save = r.save;
  // finish it from the reloaded save
  ({ save } = playVisit(save, 'hs-refresh'));
  const xp = save.player.xp;
  const plays = save.player.plays;
  const again = P.completeVisit(save, c, { village: V, visit: 'hs-refresh', mode: 'visit' }, { time: 1, faultCount: 6 });
  assert.equal(again.repeat, true);
  assert.equal(save.player.xp, xp, 'no second reward');
  assert.equal(save.player.plays, plays);
});

test('permanent work survives later visits, the storm and photo walks', () => {
  let save = P.newSave(c);
  for (const v of c.village(V).visits) ({ save } = playVisit(save, v.id));
  const effects = P.effectsDone(save, V);
  for (const sid of c.village(V).sceneOrder) {
    const neglect = activeNeglect(c.scene(V, sid), effects, { fixed: P.fixedIn(save, V, sid) });
    assert.deepEqual(neglect, [], `${sid} has no neglect left`);
  }
  // the storm brought only storm work, and it touched nothing permanent
  const storm = c.visit(V, 'mill-storm');
  const inc = c.story.incidents.storm;
  const m = generateVisit(c, { village: V, visit: storm, seed: 9, effectsDone: effects, fixed: P.fixedIn(save, V, 'old-mill'), cat: false });
  assert.ok(m.faults.every((f) => inc.ops.includes(f.type)), 'storm ops only');
  assert.ok(m.faults.filter((f) => f.type === 'litter').every((f) => inc.items.includes(f.item)), 'storm debris only');
  // photo walks never spoil what was restored
  for (const sid of c.village(V).sceneOrder) {
    const protect = P.protectedTargets(save, c, V, sid);
    for (let seed = 1; seed <= 30; seed++) for (const tier of [1, 3, 5]) {
      const w = generateMess(c, { village: V, scene: sid, tier, seed, projectsDone: effects, fixed: P.fixedIn(save, V, sid), protect, policy: true });
      for (const f of w.faults) {
        if (['faded', 'grimy', 'wilted'].includes(f.type)) assert.ok(!protect.includes(f.region || f.prop), `${sid} walk spoils ${f.region || f.prop}`);
        if (tier === 5) assert.notEqual(f.type, 'faded', 'a storm walk never strips paint');
      }
    }
  }
});

test('the colour request plants red, white and blue and keeps everything else', () => {
  let save = P.newSave(c);
  for (const v of c.village(V).visits) { if (v.id === 'green-judging') break; ({ save } = playVisit(save, v.id)); }
  const props = activeProps(c.scene(V, 'railway-halt'), P.effectsDone(save, V));
  const tint = (id) => props.find((p) => p.id === id)?.tint;
  assert.deepEqual([tint('tub'), tint('tub-b'), tint('tub-c')], ['red', 'white', 'blue']);
  for (const id of ['basket-2', 'trolley', 'pot-door-l', 'pot-door-r']) assert.ok(props.some((p) => p.id === id), `${id} still there`);
});

// ---------------------------------------------------------------- saves --

test('a current save survives a reload unchanged; older development saves are not carried over', () => {
  let save = P.newSave(c, 1_700_000_000_000);
  ({ save } = playVisit(save, 'halt-tidy'));
  assert.deepEqual(reload(save), save, 'a current-version save loads as it was');
  for (const v of [2, 3]) {
    const old = { ...clone(save), v };
    assert.equal(P.migrate(clone(old), c), null, `a version ${v} save is not migrated`);
    assert.ok(P.olderSave(old), `a version ${v} save is recognised as older`);
  }
  assert.equal(P.migrate({ nonsense: true }, c), null);
  assert.ok(!P.olderSave({ nonsense: true }), 'something that is not a save is not called older');
});

test('a photo walk left pending never brings back work the story has since restored', () => {
  let save = P.newSave(c, 1_700_000_000_000);
  for (const id of ['halt-tidy', 'hs-refresh', 'green-tidy']) ({ save } = playVisit(save, id));
  // start a walk at the Halt, fix one thing, walk away
  const plan = P.planWalk(save, c, V, 'railway-halt', {});
  const progress = P.beginPlay(save, plan);
  progress.done = ['f0'];
  P.leavePlay(save);
  // the story then restores the Halt further
  ({ save } = playVisit(save, 'halt-refresh'));
  const resumed = P.pendingWalk(save, c, 'railway-halt');
  const now = P.effectsDone(save, V);
  if (resumed) {
    assert.deepEqual([...resumed.effects].sort(), [...now].sort(), 'a resumed walk shows the Halt as it is now');
  }
  const walk = resumed || P.planWalk(save, c, V, 'railway-halt', {});
  const mess = generateMess(c, { village: V, scene: walk.scene, tier: walk.tier, condition: walk.condition, seed: walk.seed, projectsDone: walk.effects, fixed: walk.fixed, protect: walk.protect, policy: true, types: walk.types, cat: false });
  const halt = c.visit(V, 'halt-refresh');
  for (const e of halt.effects) assert.ok(walk.effects.includes(e), `${e} stays in force on the walk`);
  const restoredNeglect = (c.scene(V, 'railway-halt').neglect || []).filter((n) => halt.effects.includes(n.effect)).map((n) => n.target);
  for (const n of mess.neglect) assert.ok(!restoredNeglect.includes(n.target), `${n.target} is not neglected again`);
});

test('a pending photo walk carries on when nothing has changed', () => {
  let save = P.newSave(c, 1_700_000_000_000);
  for (const id of ['halt-tidy', 'hs-refresh', 'green-tidy']) ({ save } = playVisit(save, id));
  const plan = P.planWalk(save, c, V, 'high-street', {});
  P.beginPlay(save, plan).done = ['f0'];
  P.leavePlay(save);
  const again = P.pendingWalk(reload(save), c, 'high-street');
  assert.ok(again && again.seed === plan.seed, 'the same walk resumes');
});
