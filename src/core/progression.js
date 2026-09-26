// Progression: the meta-game. Pure functions over a plain-JSON save object,
// so the same rules run in the browser, the route simulator and the tests.
//
//   visits     the restoration route (content/villages/<id>/visits.json): each visit
//              is a short, authored job at one place; finishing it makes permanent
//              improvements and opens the next step of the story
//   effects    permanent restoration layers (paint, flowers, bunting...) that never
//              regress; `fixed` records things a story task restored for good
//   progress   an unfinished visit's completed tasks, saved after every fix
//   journal    one postcard per finished visit, with its exact before and after
//   walks      optional photo walks: a weather postcard of any visited place (the album)
//   intro      content/common/intro.json opens features one at a time
//   requests   optional favours from the neighbours, 3 active slots
//   scrapbook  collectible sets with a pity timer
//   daily      a seeded Daily Postcard walk and a stamp card with no streak to lose
//   level      account-wide photographer XP, perks and cosmetics
//
// There is no currency. The Village Fund of save version 2 is kept only as
// history (save.legacy.fund).

import { Rng, seedOf, clamp } from './rng.js';
import { activeProps } from './mess.js';

export const SAVE_VERSION = 3;
const STAMP_XP = [0, 10, 25];
const DAILY_CARD = [
  { xp: 40 }, { xp: 50 }, { xp: 60 }, { flashbulbs: 1 },
  { xp: 80 }, { xp: 100 }, { xp: 120, collectible: true },
];
const PERSISTENT = ['faded', 'grimy', 'wilted'];

// ---------------------------------------------------------------- save ----

export function newSave(content, now = Date.now()) {
  const save = {
    v: SAVE_VERSION, created: now,
    settings: { sfx: true, music: true, haptics: true, reducedMotion: null },
    player: { xp: 0, flashbulbs: 1, plays: 0, walks: 0 },
    cosmetics: { owned: [], equipped: {} },
    stats: { fixes: {}, cats: 0, bestCombo: 0, hints: 0, collectibles: 0, perfect: 0, score: 0, visits: 0 },
    flags: { intro: false, tutorial: false, seen: {} },
    current: 'honeycombe',
    villages: {},
    active: null,
    walk: null,
    requests: { active: [], seq: 0, friendship: {}, done: 0, letters: {} },
    collect: { owned: {}, sets: {}, pity: 0 },
    daily: { last: null, days: 0, history: {} },
    purchases: {},
  };
  for (const [kind, list] of Object.entries(content.cosmetics)) {
    for (const [id, c] of Object.entries(list)) {
      if (c.default) { save.cosmetics.owned.push(id); save.cosmetics.equipped[kind] = id; }
    }
  }
  for (const vid of Object.keys(content.villages)) ensureVillage(save, content, vid);
  return save;
}

/**
 * Bring any older save up to date. Repeatable: migrating the same old save
 * twice gives the same result. Returns null only for something that isn't a
 * save at all (the caller decides what to do; it never silently starts again).
 */
export function migrate(save, content, now = Date.now()) {
  if (!save || typeof save !== 'object' || !save.v || !save.villages) return null;
  if (save.v < 2) return null; // pre-release saves: never shipped
  if (save.v < 3) migrateV2(save, content, now);
  for (const vid of Object.keys(content.villages)) ensureVillage(save, content, vid);
  return save;
}

function ensureVillage(save, content, vid) {
  const v = content.village(vid);
  const vs = (save.villages[vid] ||= {});
  vs.scenes ||= {};
  for (const k of ['effects', 'fixed', 'visits', 'journal', 'progress', 'letters']) vs[k] ||= {};
  vs.judged ??= false;
  vs.legacyOpen ||= [];
  for (const sid of v.sceneOrder) vs.scenes[sid] ||= { tier: 0, plays: 0, best: 0, bestStamps: 0, album: {} };
  return vs;
}

/** Version 2 (the Village Fund and purchased projects) -> version 3 (visits). */
function migrateV2(save, content, now) {
  save.legacy = { from: save.v, fund: save.player?.fund || 0, projects: {} };
  delete save.player.fund;
  save.player.walks = save.player.plays || 0;
  save.stats.visits ||= 0;
  save.active = null;
  save.walk = null;
  save.settings.reducedMotion ??= null;
  // the stamp card no longer resets: count the days played
  save.daily = { last: save.daily?.last || null, days: Object.keys(save.daily?.history || {}).length, history: save.daily?.history || {} };
  // favours pay experience now, not money
  for (const r of save.requests?.active || []) {
    if (r.reward) r.reward = { xp: (r.reward.xp || 20) + 25, ...(r.reward.flashbulbs ? { flashbulbs: r.reward.flashbulbs } : {}), ...(r.reward.collectible ? { collectible: true } : {}) };
  }
  for (const [vid, vs] of Object.entries(save.villages)) {
    const v = content.village(vid);
    if (!v) continue;
    const bought = vs.projects || {};
    save.legacy.projects[vid] = Object.keys(bought);
    const legacy = v.legacy || { access: {}, effects: [] };
    vs.effects = {};
    for (const [p, ts] of Object.entries(bought)) if (legacy.effects.includes(p)) vs.effects[p] = ts || now;
    // an area that was opened stays open
    vs.legacyOpen = Object.keys(bought).filter((p) => legacy.access[p]).map((p) => legacy.access[p]);
    delete vs.projects;
    for (const k of ['fixed', 'visits', 'journal', 'progress']) vs[k] ||= {};
    // visits whose work the player already paid for count as done, so nothing
    // they restored looks unfinished; new jobs are never marked done just
    // because of money
    for (const visit of v.visits) {
      const ss = vs.scenes?.[visit.scene];
      const old = visit.effects.filter((e) => legacy.effects.includes(e));
      let done = false;
      if (vs.judged) done = true;
      else if (old.length) done = old.every((e) => vs.effects[e]);
      else if (visit.kind === 'restoration' && !visit.effects.some((e) => legacy.effects.includes(e))) {
        // a first tidy of a place: done if they took a postcard there
        const first = v.visits.find((x) => x.scene === visit.scene) === visit;
        done = first && ((ss?.tier || 0) > 0 || (visit.tutorial && save.flags?.tutorial));
      }
      if (!done) continue;
      for (const e of visit.effects) vs.effects[e] ||= now;
      vs.visits[visit.id] = { done: now, migrated: true };
      save.stats.visits++;
    }
  }
  // they know their way around: cards for features they already had aren't
  // shown again; a single card explains the update instead
  for (const [f, at] of Object.entries(content.intro?.features || {})) if ((save.player.plays || 0) >= at && content.intro.cards?.[f]) save.flags.seen[`intro:${f}`] = true;
  save.flags.updated = 3;
  save.v = 3;
}

// ------------------------------------------------------------ derived -----

export const visitsOf = (content, vid) => content.village(vid).visits;
export const visitDone = (save, vid, id) => !!save.villages[vid]?.visits[id];
export const effectsDone = (save, vid) => Object.keys(save.villages[vid].effects);
export const fixedIn = (save, vid, sid) => Object.keys(save.villages[vid].fixed[sid] || {});

/** Can this visit be played now? Its earlier visits are done (or, for a save
 *  from version 2, the place was already open and this is its next restoration). */
export function visitAvailable(save, content, vid, visit) {
  const vs = save.villages[vid];
  if (vs.visits[visit.id]) return false;
  if ((visit.after || []).every((a) => vs.visits[a])) return true;
  if (visit.kind === 'restoration' && vs.legacyOpen.includes(visit.scene)) {
    const here = visitsOf(content, vid).filter((x) => x.scene === visit.scene);
    return here.slice(0, here.indexOf(visit)).every((x) => vs.visits[x.id]);
  }
  return false;
}

export const availableVisits = (save, content, vid) => visitsOf(content, vid).filter((x) => visitAvailable(save, content, vid, x));

/** The story's next step: the first available visit in route order. */
export const nextVisit = (save, content, vid) => availableVisits(save, content, vid)[0] || null;

export const storyComplete = (save, content, vid) => visitsOf(content, vid).every((x) => save.villages[vid].visits[x.id]);

/** "the Halt", "the High Street": a place's name as it reads mid-sentence. */
export function placeName(content, vid, sid) {
  const s = content.scene(vid, sid);
  return s.short || s.name.replace(/^The /, 'the ');
}

/** The one named thing to do next: "Visit the Village Green", "Return to the Halt: plant the tubs". */
export function visitLabel(save, content, vid, visit) {
  const place = placeName(content, vid, visit.scene);
  if (visit.kind === 'committee') return `Committee request: ${visit.title}`;
  const been = save.villages[vid].scenes[visit.scene].plays > 0 || visitsOf(content, vid).some((x) => x.scene === visit.scene && save.villages[vid].visits[x.id]);
  return been ? `Return to ${place}: ${visit.goal}` : `Visit ${place}`;
}

export function nextStep(save, content, vid) {
  const vs = save.villages[vid];
  if (vs.judged) return { kind: 'free', label: 'Take a photo walk', text: `${content.village(vid).short} is Best-Kept Village! Wander, snap and enjoy it.` };
  if (judgingReady(save, content, vid)) return { kind: 'judging', label: 'The judges are here!', text: 'Everyone is gathering on the Green.' };
  const visit = nextVisit(save, content, vid);
  if (!visit) return { kind: 'free', label: 'Take a photo walk', text: '' };
  const who = content.village(vid).villagers[visit.villager];
  const text = visit.kind === 'committee' ? `${content.scene(vid, visit.scene).name} · for ${who?.short || 'the Committee'}` : `${who?.short || ''}: ${visit.title}`;
  return { kind: 'visit', visit, scene: visit.scene, label: visitLabel(save, content, vid, visit), villager: visit.villager, text };
}

/** Where a place stands: its stage ("First tidy complete"), what's still to
 *  do ("Flowers still to plant") and whether it is restored. */
export function placeStatus(save, content, vid, sid) {
  const vs = save.villages[vid];
  const here = visitsOf(content, vid).filter((x) => x.scene === sid);
  const done = here.filter((x) => vs.visits[x.id]);
  const available = here.filter((x) => visitAvailable(save, content, vid, x));
  const restorer = here.find((x) => x.restores);
  const restored = restorer ? !!vs.visits[restorer.id] : here.length > 0 && here.filter((x) => x.kind === 'restoration').every((x) => vs.visits[x.id]);
  const stage = [...done].reverse().find((x) => x.stage)?.stage || null;
  const todo = here.find((x) => !vs.visits[x.id] && x.todo)?.todo || null;
  const ss = vs.scenes[sid];
  const open = done.length > 0 || available.length > 0 || vs.legacyOpen.includes(sid) || ss.plays > 0;
  const progress = available.map((x) => vs.progress[x.id]).find((p) => p?.done?.length) || null;
  return { open, visited: done.length > 0 || ss.plays > 0, restored, stage, todo, available, done: done.length, total: here.length, progress };
}

export function placesRestored(save, content, vid) {
  const v = content.village(vid);
  const done = v.sceneOrder.filter((sid) => placeStatus(save, content, vid, sid).restored).length;
  return { done, total: v.sceneOrder.length };
}

export const openScenes = (save, content, vid) => content.village(vid).sceneOrder.filter((sid) => placeStatus(save, content, vid, sid).open);

/** 0..1 warmth of a place's colour grade: its restoration visits done (1 once restored). */
export function placeBloom(save, content, vid, sid, extraDone = null) {
  const vs = save.villages[vid];
  const isDone = (x) => vs.visits[x.id] || x.id === extraDone;
  const here = visitsOf(content, vid).filter((x) => x.scene === sid && x.kind === 'restoration');
  if (!here.length) return 1;
  const restorer = here.find((x) => x.restores);
  if (restorer && isDone(restorer)) return 1;
  return here.filter(isDone).length / here.length;
}

/** Things restored for good at a place, which an optional photo walk must never spoil. */
export function protectedTargets(save, content, vid, sid) {
  const vs = save.villages[vid];
  const scene = content.scene(vid, sid);
  const out = new Set(fixedIn(save, vid, sid));
  for (const n of scene.neglect || []) if (vs.effects[n.effect]) out.add(n.target);
  for (const visit of visitsOf(content, vid)) {
    if (visit.scene !== sid || !vs.visits[visit.id]) continue;
    for (const t of visit.tasks) if (t.target && [...PERSISTENT, 'plant'].includes(t.op)) out.add(t.target);
  }
  return [...out];
}

export function judgingReady(save, content, vid) {
  return !save.villages[vid].judged && storyComplete(save, content, vid);
}

// ---------------------------------------------------------- intro -------

/** Has this feature been introduced yet? (content/common/intro.json, counted in visits and walks finished) */
export function introduced(save, content, feature) {
  if ((content.intro?.afterFinale || []).includes(feature)) return Object.values(save.villages).some((vs) => vs.judged);
  const at = content.intro?.features?.[feature];
  return at == null || save.player.plays >= at;
}

/** Jobs a photo walk may use: the ones the story has taught, plus weather jobs it doesn't teach. */
export function jobsOpen(save, content) {
  const taught = content.intro?.storyJobs || [];
  return Object.keys(content.faults).filter((t) => !content.faults[t].story && (!taught.includes(t) || save.flags.seen[`job:${t}`]));
}

/** Map-screen feature cards that are due and not yet shown, in order. */
export function introCardsDue(save, content) {
  const cards = content.intro?.cards || {};
  return Object.keys(cards).filter((f) => introduced(save, content, f) && !save.flags.seen[`intro:${f}`]);
}

// -------------------------------------------------------------- level -----

export function xpToNext(levels, level) { return levels.xpBase + levels.xpStep * (level - 1); }

export function levelInfo(content, xp) {
  let level = 1, rest = xp;
  while (rest >= xpToNext(content.levels, level)) { rest -= xpToNext(content.levels, level); level++; }
  let title = content.levels.titles[0][1];
  for (const [l, t] of content.levels.titles) if (level >= l) title = t;
  return { level, into: rest, need: xpToNext(content.levels, level), title };
}

export function loupeMultiplier(content, save) {
  const { level } = levelInfo(content, save.player.xp);
  let m = 1;
  for (let l = 2; l <= level; l++) {
    const perk = content.levels.rewards[l]?.perk;
    if (perk) m = Math.min(m, content.levels.perks[perk].loupe);
  }
  return m;
}

const newOut = () => ({ xp: 0, flashbulbs: 0, cosmetics: [], levelUps: [], events: [], requests: [], sets: [] });

function grant(save, content, reward, out) {
  if (!reward) return;
  if (reward.flashbulbs) { save.player.flashbulbs += reward.flashbulbs; out.flashbulbs += reward.flashbulbs; }
  if (reward.cosmetic && !save.cosmetics.owned.includes(reward.cosmetic)) {
    save.cosmetics.owned.push(reward.cosmetic);
    out.cosmetics.push(reward.cosmetic);
  }
  if (reward.xp) addXp(save, content, reward.xp, out);
}

function addXp(save, content, xp, out) {
  const before = levelInfo(content, save.player.xp).level;
  save.player.xp += xp;
  out.xp += xp;
  const after = levelInfo(content, save.player.xp).level;
  for (let l = before + 1; l <= after; l++) {
    const reward = content.levels.rewards[l] || content.levels.defaultReward;
    out.levelUps.push({ level: l, reward, title: levelInfo(content, save.player.xp).title });
    grant(save, content, reward, out);
  }
}

// ------------------------------------------------------ active play -----
// What is on screen right now, so a reload (or an iPhone killing the tab)
// lands back in it with every finished task still finished.

const fresh = (play) => ({ play, done: [], cat: false, collectible: false, hints: 0, t: 0 });

/** Start, or carry on with, a play. Returns the saved progress to restore. */
export function beginPlay(save, play) {
  if (play.mode === 'visit') {
    const vs = save.villages[play.village];
    const p = (vs.progress[play.visit] ||= fresh(play));
    save.active = { mode: 'visit', village: play.village, visit: play.visit };
    return p;
  }
  if (save.walk?.play !== play) save.walk = fresh(play);
  save.active = { mode: 'walk' };
  return save.walk;
}

/** The plan of the play that was on screen when the game was last closed (to resume it). */
export function resumePlan(save) {
  return activeProgress(save)?.play || null;
}

/** An unfinished photo walk at this place, if there is one. */
export function pendingWalk(save, sid, daily = null) {
  const w = save.walk;
  return w && w.play.scene === sid && (w.play.daily || null) === daily && w.done.length ? w.play : null;
}

/** The progress record of the play in hand (or null). */
export function activeProgress(save) {
  const a = save.active;
  if (!a) return null;
  if (a.mode === 'walk') return save.walk;
  return save.villages[a.village]?.progress[a.visit] || null;
}

/** Record progress after a fix, a find or a hint. */
export function checkpoint(save, patch) {
  const p = activeProgress(save);
  if (p) Object.assign(p, patch);
}

/** Leave a play without finishing: its progress waits for next time. */
export function leavePlay(save) { save.active = null; }

// -------------------------------------------------------------- visits ----

/** Everything needed to generate (and regenerate, exactly) a visit's work. */
export function planVisit(save, content, vid, visitId) {
  const visit = content.visit(vid, visitId);
  const vs = save.villages[vid];
  // an unfinished visit carries on exactly as it began
  if (vs.progress[visitId]?.play) return vs.progress[visitId].play;
  const seed = seedOf('visit', save.created, visitId) % 2 ** 31;
  const rng = new Rng(seedOf('visit-plan', save.created, visitId));
  const story = content.story;
  const scene = content.scene(vid, visit.scene);
  const collectible = introduced(save, content, 'collectibles') && !visit.tutorial
    ? rollCollectible(save, content, vid, scene, rng.fork('collect'), {}) : null;
  return {
    mode: 'visit', village: vid, scene: visit.scene, visit: visitId, seed,
    condition: visit.condition || story.incidents[visit.incident]?.condition || 'clear',
    effects: effectsDone(save, vid), fixed: fixedIn(save, vid, visit.scene),
    bloom: placeBloom(save, content, vid, visit.scene),
    collectible, cat: introduced(save, content, 'cat') && !visit.tutorial,
    tutorial: !!visit.tutorial,
    show: { score: false, timer: false, combo: introduced(save, content, 'combo'), loupe: true, flash: false },
    stamps: false,
    loupe: story.hints.cooldown, nudge: story.hints.nudgeEvery,
  };
}

/**
 * Finish a visit: commit its permanent work, the journal postcard and the
 * rewards. Safe to call twice: the second call changes nothing and returns
 * the first call's receipt. Call it (and save) before any ceremony.
 * result: {time, fixes:{type:n}, cat, collectible, maxCombo, hints, faultCount}
 * snapshot: the journal postcard's render description (render/stills.js)
 */
export function completeVisit(save, content, play, result, snapshot = null, now = new Date()) {
  const vid = play.village;
  const vs = save.villages[vid];
  const visit = content.visit(vid, play.visit);
  if (vs.visits[visit.id]) return { ...(vs.visits[visit.id].receipt || {}), repeat: true };
  const ts = now.getTime();
  const out = newOut();
  const openBefore = new Set(openScenes(save, content, vid));
  const wasRestored = placeStatus(save, content, vid, visit.scene).restored;
  const restoredBefore = placesRestored(save, content, vid).done;

  // the permanent work: this never regresses
  for (const e of visit.effects) vs.effects[e] ||= ts;
  const scene = content.scene(vid, visit.scene);
  const fixed = (vs.fixed[visit.scene] ||= {});
  for (const t of visit.tasks) {
    if (t.target && PERSISTENT.includes(t.op) && (scene.neglect || []).some((n) => n.target === t.target && n.type === t.op)) fixed[t.target] ||= ts;
  }
  vs.visits[visit.id] = { done: ts };
  delete vs.progress[visit.id];
  if (save.active?.visit === visit.id) save.active = null;
  if (snapshot) vs.journal[visit.id] = { ...snapshot, date: now.toISOString().slice(0, 10), time: Math.round(result.time || 0) };

  save.player.plays++;
  save.stats.visits = (save.stats.visits || 0) + 1;
  vs.scenes[visit.scene].plays++;
  if (visit.tutorial) save.flags.tutorial = true;
  const xp = content.story.xp;
  addXp(save, content, xp.visit + xp.perTask * (result.faultCount || visit.tasks.length), out);
  tallyStats(save, result);
  if (play.collectible) save.collect.pity = 0; else if (introduced(save, content, 'collectibles') && !visit.tutorial) save.collect.pity++;
  if (result.collectible && play.collectible) addCollectible(save, content, vid, play.collectible.id, out);
  progressRequests(save, content, play, result);
  refillRequests(save, content, vid);

  // what changed in the village
  const status = placeStatus(save, content, vid, visit.scene);
  if (status.restored && !wasRestored) out.events.push({ kind: 'placeRestored', scene: visit.scene });
  for (const sid of openScenes(save, content, vid)) if (!openBefore.has(sid)) out.events.push({ kind: 'placeOpened', scene: sid });
  const restored = placesRestored(save, content, vid);
  if (judgingReady(save, content, vid)) out.events.push({ kind: 'judgingReady' });
  const receipt = {
    visit: visit.id, scene: visit.scene, xp: out.xp, flashbulbs: out.flashbulbs, cosmetics: out.cosmetics,
    levelUps: out.levelUps, events: out.events, sets: out.sets.map((s) => s.id),
    restored: restored.done, restoredBefore, total: restored.total,
  };
  vs.visits[visit.id].receipt = receipt;
  return { ...receipt, sets: out.sets };
}

function tallyStats(save, result) {
  for (const [t, n] of Object.entries(result.fixes || {})) save.stats.fixes[t] = (save.stats.fixes[t] || 0) + n;
  if (result.cat) save.stats.cats++;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, result.maxCombo || 0);
  save.stats.hints += result.hints || 0;
}

// --------------------------------------------------------- photo walks ----

/** The postcards of a place taken on photo walks (five weathers each). */
export function postcards(save, vid) {
  return Object.values(save.villages[vid].scenes).reduce((s, sc) => s + Math.min(5, sc.tier), 0);
}

/** The next weather postcard of a place, in the album's order. */
export function nextWeather(save, content, vid, sid) {
  const ss = save.villages[vid].scenes[sid];
  const tier = Math.min(ss.tier + 1, 6);
  const condition = Object.keys(content.tier(tier).conditions)[0];
  return { tier, condition, free: tier > 5, name: content.conditions[condition].name };
}

/** Decide everything about a photo walk (or the Daily Postcard). */
export function planWalk(save, content, vid, sid, opts = {}) {
  const scene = content.scene(vid, sid);
  const ss = save.villages[vid].scenes[sid];
  const rng = new Rng(seedOf('play', save.created, save.player.plays, sid, opts.daily || ''));
  const tier = opts.tier ?? Math.min(ss.tier + 1, 6);
  let condition = opts.condition;
  const seed = opts.seed ?? rng.int(1, 2 ** 31);
  if (!condition) {
    // each postcard has its weather; Free Play prefers weathers not yet in the album
    const w = { ...content.tier(tier).conditions };
    for (const c of Object.keys(w)) if (!ss.album[c]) w[c] *= 3;
    condition = rng.fork('cond').weighted(w);
  }
  const collectible = introduced(save, content, 'collectibles') ? rollCollectible(save, content, vid, scene, rng.fork('collect'), opts) : null;
  const jobs = jobsOpen(save, content);
  return {
    mode: 'walk', village: vid, scene: sid, tier, condition, seed, collectible, script: opts.script || null,
    daily: opts.daily || null,
    effects: effectsDone(save, vid), fixed: fixedIn(save, vid, sid), protect: protectedTargets(save, content, vid, sid),
    bloom: placeBloom(save, content, vid, sid),
    types: jobs, cat: introduced(save, content, 'cat'),
    show: { score: true, timer: true, combo: introduced(save, content, 'combo'), loupe: true, flash: introduced(save, content, 'flash') },
    stamps: true,
    loupe: content.tier(tier).loupe * loupeMultiplier(content, save),
    nudge: content.tier(tier).nudge,
  };
}

function rollCollectible(save, content, vid, scene, rng, opts) {
  const sets = content.village(vid).collectibles.sets.filter((s) => (scene.sets || []).includes(s.id));
  if (!sets.length) return null;
  const first = !save.stats.collectibles && !save.collect.pity;
  const guaranteed = first || opts.forceCollectible;
  const chance = 0.35 + 0.2 * save.collect.pity;
  if (!guaranteed && !rng.chance(chance)) return null;
  const w = {};
  for (const s of sets) for (const it of s.items) w[`${s.id}/${it.id}`] = save.collect.owned[it.id] ? 1 : 4;
  const [setId, itemId] = rng.weighted(w).split('/');
  const item = sets.find((s) => s.id === setId).items.find((i) => i.id === itemId);
  return { id: item.id, set: setId, sprite: item.sprite, name: item.name };
}

/**
 * Apply a finished photo walk to the save.
 * result: {score, stamps, time, fixes:{type:n}, cat, collectible, maxCombo, hints, flashes, misses, faultCount}
 * snapshot: the postcard's render description, kept in the album
 */
export function completeWalk(save, content, play, result, snapshot = null, now = new Date()) {
  const out = newOut();
  const vs = save.villages[play.village];
  const ss = vs.scenes[play.scene];
  const tier = content.tier(play.tier);
  save.player.plays++;
  save.player.walks = (save.player.walks || 0) + 1;
  ss.plays++;
  save.walk = null;
  if (save.active?.mode === 'walk') save.active = null;

  const xpRule = content.levels.xpPerPlay;
  addXp(save, content, Math.round((xpRule.base + xpRule.perFault * result.faultCount + STAMP_XP[result.stamps - 1]) * tier.xp), out);

  // the next weather postcard of this place
  if (!play.daily && play.tier === ss.tier + 1 && play.tier <= 5) {
    ss.tier++;
    out.events.push({ kind: 'postcard', scene: play.scene, tier: ss.tier, total: postcards(save, play.village) });
    if (ss.tier === 5) out.events.push({ kind: 'mastered', scene: play.scene });
  }
  if (result.score > ss.best) ss.best = result.score;
  if (result.stamps > ss.bestStamps) ss.bestStamps = result.stamps;

  // album: one slot per weather, best score kept (the Daily Postcard has its own diary)
  const entry = { ...(snapshot || {}), seed: play.seed, tier: play.tier, condition: play.condition, stamps: result.stamps, score: result.score,
    time: Math.round(result.time), date: now.toISOString().slice(0, 10) };
  if (!play.daily) {
    const slot = ss.album[play.condition];
    if (!slot) { ss.album[play.condition] = entry; out.events.push({ kind: 'newPostcard', condition: play.condition }); }
    else if (result.score > slot.score) { ss.album[play.condition] = entry; out.events.push({ kind: 'betterPostcard', condition: play.condition }); }
    if (play.tier === 5 && !ss.album.mastered) { ss.album.mastered = { ...entry }; out.events.push({ kind: 'goldPostcard' }); }
  }

  tallyStats(save, result);
  save.stats.score += result.score;
  if (result.stamps === 3) save.stats.perfect++;
  if (play.collectible) save.collect.pity = 0; else if (introduced(save, content, 'collectibles')) save.collect.pity++;
  if (result.collectible && play.collectible) addCollectible(save, content, play.village, play.collectible.id, out);
  progressRequests(save, content, play, result);
  if (play.daily) completeDaily(save, content, play.daily, result, out);
  refillRequests(save, content, play.village);
  return out;
}

// ------------------------------------------------------------ scrapbook ---

export function findItem(content, vid, itemId) {
  for (const s of content.village(vid).collectibles.sets) {
    const it = s.items.find((i) => i.id === itemId);
    if (it) return { set: s, item: it };
  }
  return null;
}

function addCollectible(save, content, vid, itemId, out) {
  const found = findItem(content, vid, itemId);
  if (!found) return;
  const had = save.collect.owned[itemId] || 0;
  save.collect.owned[itemId] = had + 1;
  save.stats.collectibles++;
  if (had) {
    out.events.push({ kind: 'duplicate', item: found.item });
    return;
  }
  out.events.push({ kind: 'collectible', item: found.item, set: found.set });
  const complete = found.set.items.every((i) => save.collect.owned[i.id]);
  if (complete && !save.collect.sets[found.set.id]) {
    save.collect.sets[found.set.id] = Date.now();
    grant(save, content, found.set.reward, out);
    out.sets.push(found.set);
  }
}

export function grantRandomCollectible(save, content, vid, rng, out) {
  const all = content.village(vid).collectibles.sets.flatMap((s) => s.items);
  const missing = all.filter((i) => !save.collect.owned[i.id]);
  const pick = rng.pick(missing.length ? missing : all);
  addCollectible(save, content, vid, pick.id, out);
}

// -------------------------------------------------------------- requests --
// Optional favours from the neighbours. The Committee's story requests are
// visits (kind "committee") and live in visits.json, not here.

function sceneCanHave(content, vid, sid, type, effects) {
  const scene = content.scene(vid, sid);
  const f = content.faults[type];
  if (!f) return false;
  switch (f.strategy) {
    case 'spawn': return f.slot === 'edges' ? !!scene.edges?.length : !!scene.zones?.length;
    case 'prop': return activeProps(scene, effects).some((p) => (p.tags || []).includes(f.tag));
    case 'region': {
      const tags = Array.isArray(f.tag) ? f.tag : [f.tag];
      return (scene.regions || []).some((r) => r.tags.some((t) => tags.includes(t)));
    }
    case 'lamp': return false; // lamps only show up at dusk; too situational for a request
    case 'corner': return (scene.regions || []).some((r) => r.tags.includes('window'));
    case 'perch': return !!scene.perches?.length;
  }
  return false;
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function makeRequest(save, content, vid, rng) {
  const v = content.village(vid);
  const unlocked = openScenes(save, content, vid).filter((s) => placeStatus(save, content, vid, s).visited);
  if (!unlocked.length) return null;
  const effects = effectsDone(save, vid);
  const active = new Set(save.requests.active.map((r) => r.villager));
  const cfg = content.requests;
  const maxTier = Math.max(...unlocked.map((s) => save.villages[vid].scenes[s].tier));
  const villagers = Object.entries(v.villagers).filter(([id, vg]) => !vg.letterOnly && !active.has(id));
  if (!villagers.length) return null;
  const vw = {};
  for (const [id, vg] of villagers) vw[id] = vg.home && unlocked.includes(vg.home) ? 3 : 1;
  const vid2 = rng.weighted(vw);
  const vg = v.villagers[vid2];
  const tw = {};
  for (const t of cfg.templates) {
    if (t.minPlays && save.player.plays < t.minPlays) continue;
    if (t.minTierReached && maxTier < t.minTierReached) continue;
    if (!vg.lines[t.kind]) continue;
    tw[t.kind] = t.weight;
  }
  const kind = rng.weighted(tw);
  const t = cfg.templates.find((x) => x.kind === kind);
  const req = { id: `r${++save.requests.seq}`, villager: vid2, kind, progress: 0 };
  const scene = vg.home && unlocked.includes(vg.home) && rng.chance(0.6) ? vg.home : rng.pick(unlocked);
  if (t.needsScene) req.scene = scene;
  if (kind === 'fix' || kind === 'fixAny') {
    const types = vg.likes.filter((ty) => (kind === 'fixAny' ? unlocked.some((s) => sceneCanHave(content, vid, s, ty, effects)) : sceneCanHave(content, vid, scene, ty, effects)));
    req.type = types.length ? rng.pick(types) : 'litter';
    const [a, b] = t.count;
    const scale = { litter: 1.3, weeds: 0.7, crooked: 0.7, toppled: 0.5, faded: 0.6, grimy: 0.7, wilted: 0.5, cobweb: 0.5, pigeon: 0.5 }[req.type] ?? 1;
    req.count = Math.max(2, Math.round(rng.int(a, b) * scale));
  } else if (kind === 'condition') {
    const avail = new Set();
    for (const s of unlocked) {
      const nt = Math.min(save.villages[vid].scenes[s].tier + 1, 6);
      for (const c of Object.keys(content.tier(nt).conditions)) avail.add(c);
    }
    avail.delete('clear');
    req.condition = rng.pick([...(avail.size ? avail : new Set(['golden']))]);
    req.count = 1;
  } else if (kind === 'stamps' || kind === 'nohint') {
    req.count = 1;
  } else if (kind === 'quick') {
    req.seconds = rng.int(t.seconds[0], t.seconds[1]);
    req.count = 1;
  } else {
    req.count = rng.int(t.count[0], t.count[1]);
  }
  const vars = {
    count: req.count, seconds: req.seconds,
    scene: req.scene ? content.scene(vid, req.scene).name : '',
    thing: req.type ? content.faults[req.type].phrase : '',
    condition: req.condition ? content.conditions[req.condition].name : '',
  };
  req.text = fill(rng.pick(vg.lines[kind]), vars);
  req.goal = goalLabel(content, vid, req);
  req.reward = {
    xp: rng.int(t.reward.xp[0], t.reward.xp[1]),
    ...(t.reward.flashbulbs ? { flashbulbs: t.reward.flashbulbs } : {}),
    ...(t.reward.collectible ? { collectible: true } : {}),
  };
  return req;
}

export function goalLabel(content, vid, r) {
  const sceneName = r.scene ? content.scene(vid, r.scene).name : '';
  switch (r.kind) {
    case 'fix': return `Fix ${r.count} ${content.faults[r.type].phrase} at ${sceneName}`;
    case 'fixAny': return `Fix ${r.count} ${content.faults[r.type].phrase} anywhere`;
    case 'cat': return `Find Marmalade ${r.count === 1 ? 'once' : `${r.count} times`}`;
    case 'stamps': return `3-stamp photo walk at ${sceneName}`;
    case 'condition': return `A postcard in ${content.conditions[r.condition].name}`;
    case 'combo': return `Fix ${r.count} in a quick row`;
    case 'nohint': return 'Finish a photo walk without hints';
    case 'quick': return `A photo walk in under ${r.seconds}s`;
    case 'plays': return `${r.count} postcard${r.count > 1 ? 's' : ''} of ${sceneName}`;
    case 'collect': return `Find ${r.count} keepsake${r.count > 1 ? 's' : ''}`;
  }
  return '';
}

export function refillRequests(save, content, vid) {
  if (!introduced(save, content, 'requests')) return;
  const rng = new Rng(seedOf('req', save.created, save.requests.seq, save.player.plays));
  let guard = 0;
  while (save.requests.active.length < content.requests.slots && guard++ < 10) {
    const r = makeRequest(save, content, vid, rng);
    if (!r) break;
    save.requests.active.push(r);
  }
}

function progressRequests(save, content, play, result) {
  const walk = play.mode === 'walk';
  for (const r of save.requests.active) {
    const sceneOk = !r.scene || r.scene === play.scene;
    let add = 0;
    switch (r.kind) {
      case 'fix': if (sceneOk) add = result.fixes?.[r.type] || 0; break;
      case 'fixAny': add = result.fixes?.[r.type] || 0; break;
      case 'cat': add = result.cat ? 1 : 0; break;
      case 'stamps': add = walk && sceneOk && result.stamps === 3 ? 1 : 0; break;
      case 'condition': add = play.condition === r.condition ? 1 : 0; break;
      case 'combo': add = (result.maxCombo || 0) >= r.count ? r.count : 0; break;
      case 'nohint': add = walk && result.hints === 0 && result.flashes === 0 ? 1 : 0; break;
      case 'quick': add = walk && result.time <= r.seconds ? 1 : 0; break;
      case 'plays': add = sceneOk ? 1 : 0; break;
      case 'collect': add = result.collectible ? 1 : 0; break;
    }
    if (add) { r.progress = Math.min(r.count, r.progress + add); r.touched = true; }
  }
}

/** Claim a finished favour (tap on the noticeboard). */
export function claimRequest(save, content, vid, reqId) {
  const i = save.requests.active.findIndex((r) => r.id === reqId);
  if (i < 0) return null;
  const r = save.requests.active[i];
  if (r.progress < r.count) return null;
  const out = { ...newOut(), requests: [r] };
  save.requests.active.splice(i, 1);
  save.requests.done++;
  grant(save, content, { xp: r.reward.xp, flashbulbs: r.reward.flashbulbs }, out);
  if (r.reward.collectible) grantRandomCollectible(save, content, vid, new Rng(seedOf('reqc', r.id, save.created)), out);
  const f = (save.requests.friendship[r.villager] = (save.requests.friendship[r.villager] || 0) + content.requests.friendship.perRequest);
  const lvls = content.requests.friendship.levels;
  const lvl = lvls.filter((n) => f >= n).length;
  const prev = lvls.filter((n) => f - 1 >= n).length;
  if (lvl > prev) {
    const vg = content.village(vid).villagers[r.villager];
    out.events.push({ kind: 'friendship', villager: r.villager, level: lvl, letter: vg.letters[lvl - 1] });
    save.requests.letters[`${r.villager}:${lvl}`] = true;
    grant(save, content, { flashbulbs: 1 }, out);
  }
  refillRequests(save, content, vid);
  return out;
}

export function friendshipLevel(save, content, villager) {
  const f = save.requests.friendship[villager] || 0;
  const lvls = content.requests.friendship.levels;
  const level = lvls.filter((n) => f >= n).length;
  return { points: f, level, next: lvls[level] ?? null, prev: lvls[level - 1] ?? 0 };
}

// ----------------------------------------------------------------- daily --

export function dateKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Today's walk. Every day played adds a stamp to the card; a missed day costs nothing. */
export function dailyInfo(save, content, vid, today = dateKey()) {
  const v = content.village(vid);
  const rng = new Rng(seedOf('daily', vid, today));
  const open = openScenes(save, content, vid).filter((s) => placeStatus(save, content, vid, s).visited);
  const pool = open.length ? open : [v.start];
  const idx = rng.int(0, v.sceneOrder.length - 1);
  const scene = pool.includes(v.sceneOrder[idx]) ? v.sceneOrder[idx] : pool[idx % pool.length];
  const condition = rng.pick(['golden', 'mist', 'dusk', 'storm', 'clear', 'golden']);
  const maxTier = Math.max(...pool.map((s) => save.villages[vid].scenes[s].tier));
  const tier = clamp(maxTier + 1, 2, 3);
  const done = !!save.daily.history[today];
  const days = save.daily.days || 0;
  const cardDay = done ? ((days - 1) % 7) + 1 : (days % 7) + 1;
  return { date: today, scene, condition, tier, seed: seedOf('daily-seed', vid, today) % 2 ** 31, done, days, cardDay, card: DAILY_CARD, unlocked: introduced(save, content, 'daily') };
}

function completeDaily(save, content, date, result, out) {
  if (save.daily.history[date]) return;
  save.daily.days = (save.daily.days || 0) + 1;
  save.daily.last = date;
  save.daily.history[date] = { stamps: result.stamps, score: result.score };
  const day = ((save.daily.days - 1) % 7) + 1;
  const reward = DAILY_CARD[day - 1];
  grant(save, content, reward, out);
  if (reward.collectible) grantRandomCollectible(save, content, save.current, new Rng(seedOf('dailyc', date)), out);
  out.events.push({ kind: 'daily', days: save.daily.days, day, reward });
}

// --------------------------------------------------------------- finale ---

/** The judges' verdict. Once only: a second call returns null and grants nothing. */
export function completeJudging(save, content, vid) {
  if (!judgingReady(save, content, vid)) return null;
  save.villages[vid].judged = Date.now();
  const out = newOut();
  grant(save, content, { xp: 400, flashbulbs: 3, cosmetic: 'frame-gilt' }, out);
  return out;
}
