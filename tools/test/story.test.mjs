// The restoration route, its saves and their migration.
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

// ------------------------------------------------------------ migration --

function v2Save(kind) {
  const scenes = Object.fromEntries(c.village(V).sceneOrder.map((sid) => [sid, { tier: 0, plays: 0, best: 0, bestStamps: 0, album: {} }]));
  const s = {
    v: 2, created: 1_690_000_000_000,
    settings: { sfx: false, music: true, haptics: false, reducedMotion: true },
    player: { xp: 0, fund: 40, flashbulbs: 1, secondClass: 0, plays: 0 },
    cosmetics: { owned: ['frame-classic', 'film-natural', 'postmark-wold'], equipped: { frames: 'frame-classic', films: 'film-natural', postmarks: 'postmark-wold' } },
    stats: { fixes: {}, cats: 0, bestCombo: 0, hints: 0, collectibles: 0, perfect: 0, score: 0 },
    flags: { intro: true, tutorial: false, seen: {} },
    current: V,
    villages: { [V]: { scenes, projects: {}, judged: false, letters: {} } },
    requests: { active: [], seq: 0, friendship: {}, done: 0, letters: {} },
    collect: { owned: {}, sets: {}, pity: 0 },
    daily: { last: null, streak: 0, best: 0, history: {} },
    purchases: { porthkennack: true },
  };
  const vs = s.villages[V];
  const card = (seed, tier, condition, projects) => ({ seed, tier, condition, stamps: 2, score: 1500, time: 50, date: '2026-09-01', projects, script: null, types: null, cat: true });
  if (kind === 'fresh') return s;
  s.flags.tutorial = true;
  if (kind === 'partial') {
    Object.assign(s.player, { xp: 800, fund: 420, plays: 14 });
    for (const p of ['open-high-street', 'halt-paint', 'open-village-green', 'hs-paint']) vs.projects[p] = 1_695_000_000_000;
    Object.assign(vs.scenes['railway-halt'], { tier: 4, plays: 6 });
    Object.assign(vs.scenes['high-street'], { tier: 2, plays: 3 });
    Object.assign(vs.scenes['village-green'], { tier: 1, plays: 1 });
    vs.scenes['railway-halt'].album = { clear: card(11, 1, 'clear', []), golden: card(12, 2, 'golden', ['open-high-street']) };
    s.requests.active = [{ id: 'r3', villager: 'colonel', kind: 'plays', progress: 0, count: 2, scene: 'high-street', text: 'x', goal: 'y', reward: { fund: 60, xp: 20 } }];
    s.requests.seq = 3;
    return s;
  }
  if (kind === 'judged' || kind === 'collector') {
    Object.assign(s.player, { xp: 9000, fund: 180, plays: 75, secondClass: 2 });
    for (const p of [...Object.keys(c.village(V).legacy.access), ...c.village(V).legacy.effects]) vs.projects[p] = 1_695_000_000_000;
    for (const sid of c.village(V).sceneOrder) { Object.assign(vs.scenes[sid], { tier: 5, plays: 8 }); vs.scenes[sid].album = { storm: card(sid.length, 5, 'storm', Object.keys(vs.projects)) }; }
    if (kind === 'judged') vs.judged = 1_696_000_000_000;
    if (kind === 'collector') {
      for (const set of c.village(V).collectibles.sets) for (const it of set.items) s.collect.owned[it.id] = 2;
      for (const set of c.village(V).collectibles.sets) s.collect.sets[set.id] = 1;
      s.daily = { last: '2026-09-20', streak: 4, best: 9, history: { '2026-09-17': { stamps: 3, score: 2000 }, '2026-09-18': { stamps: 1, score: 900 }, '2026-09-20': { stamps: 2, score: 1500 } } };
      s.requests.friendship = { colonel: 9, landlady: 5 };
      s.cosmetics.owned.push('frame-gilt', 'film-sepia');
    }
    return s;
  }
}

test('save v2 migrates: settings, album, keepsakes and purchases are kept', () => {
  for (const kind of ['fresh', 'partial', 'judged', 'collector']) {
    const old = v2Save(kind);
    const save = P.migrate(clone(old), c, 1_700_000_000_000);
    assert.equal(save.v, 3, kind);
    assert.deepEqual(save.settings, old.settings);
    assert.deepEqual(save.cosmetics, old.cosmetics);
    assert.deepEqual(save.collect, old.collect);
    assert.deepEqual(save.purchases, old.purchases);
    for (const sid of c.village(V).sceneOrder) assert.deepEqual(save.villages[V].scenes[sid].album, old.villages[V].scenes[sid].album, `${kind} ${sid} album`);
    assert.equal(save.legacy.fund, old.player.fund);
    assert.deepEqual(P.migrate(clone(old), c, 1_700_000_000_000), save, `${kind}: migration is repeatable`);
    assert.deepEqual(P.migrate(clone(save), c), save, `${kind}: a v3 save is left alone`);
  }
});

test('a part-restored v2 village stays restored and stays open', () => {
  const save = P.migrate(v2Save('partial'), c);
  const vs = save.villages[V];
  assert.ok(vs.effects['halt-paint'] && vs.effects['hs-paint']);
  assert.ok(vs.visits['halt-tidy'] && vs.visits['hs-refresh'] && vs.visits['green-tidy']);
  assert.ok(!vs.visits['halt-refresh'], 'the halt still has flowers to plant');
  for (const sid of ['railway-halt', 'high-street', 'village-green']) assert.ok(P.placeStatus(save, c, V, sid).open, `${sid} stays open`);
  // what they bought doesn't reappear as work
  const m = generateVisit(c, { village: V, visit: 'halt-refresh', seed: 3, effectsDone: P.effectsDone(save, V), fixed: [], cat: false });
  assert.deepEqual(m.skipped.sort(), ['valance', 'win-left']);
  assert.equal(save.requests.active[0].reward.fund, undefined);
});

test('a judged v2 village is complete and keeps its rosette', () => {
  const save = P.migrate(v2Save('judged'), c);
  assert.ok(P.storyComplete(save, c, V));
  assert.ok(save.villages[V].judged);
  assert.equal(P.judgingReady(save, c, V), false);
  assert.equal(P.placesRestored(save, c, V).done, 8);
});

test('an opened-but-unrestored v2 place offers its restoration', () => {
  const old = v2Save('partial');
  old.villages[V].projects['open-weavers-row'] = 1;
  const save = P.migrate(old, c);
  assert.ok(P.placeStatus(save, c, V, 'weavers-row').open);
  assert.ok(P.visitAvailable(save, c, V, c.visit(V, 'row-restore')));
});
