// Progression: the meta-game. Pure functions over a plain-JSON save object,
// so the same rules run in the browser, the economy simulator and tests.
//
//   postcards  five per scene, one per weather, each a step harder     -> the album
//   fund       the Village Fund: raised by every postcard, spent on    -> the sink
//              restoration projects
//   projects   permanently beautify scenes; access projects unlock    -> "building something"
//   intro      content/common/intro.json opens jobs and features one at a time
//   requests   small self-contained villager goals, 3 active slots
//   scrapbook  collectible sets with a pity timer
//   daily      seeded Daily Postcard + 7-day stamp card
//   level      account-wide photographer XP, perks and cosmetics

import { Rng, seedOf, clamp } from './rng.js';
import { activeProps } from './mess.js';

export const SAVE_VERSION = 2;
const STAMP_MULT = [1, 1.2, 1.5];
const DAILY_CARD = [
  { fund: 40 }, { fund: 60 }, { fund: 80 }, { flashbulbs: 1 },
  { fund: 120 }, { fund: 150 }, { fund: 200, collectible: true },
];

// ---------------------------------------------------------------- save ----

export function newSave(content, now = Date.now()) {
  const save = {
    v: SAVE_VERSION, created: now,
    settings: { sfx: true, music: true, haptics: true, reducedMotion: false },
    player: { xp: 0, fund: 0, flashbulbs: 1, secondClass: 0, plays: 0 },
    cosmetics: { owned: [], equipped: {} },
    stats: { fixes: {}, cats: 0, bestCombo: 0, hints: 0, collectibles: 0, perfect: 0, score: 0 },
    flags: { intro: false, tutorial: false, seen: {} },
    current: 'honeycombe',
    villages: {},
    requests: { active: [], seq: 0, friendship: {}, done: 0, letters: {} },
    collect: { owned: {}, sets: {}, pity: 0 },
    daily: { last: null, streak: 0, best: 0, history: {} },
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

export function migrate(save, content) {
  if (!save || typeof save !== 'object' || !save.v) return newSave(content);
  // v2 (before release) replaced rosettes and pennies with postcards and the
  // Village Fund, so v1 saves start again. From here on, convert: if (save.v < 3) ...
  if (save.v < 2) return newSave(content);
  for (const vid of Object.keys(content.villages)) ensureVillage(save, content, vid);
  return save;
}

function ensureVillage(save, content, vid) {
  const v = content.village(vid);
  const vs = (save.villages[vid] ||= { scenes: {}, projects: {}, judged: false, letters: {} });
  for (const sid of v.sceneOrder) vs.scenes[sid] ||= { tier: 0, plays: 0, best: 0, bestStamps: 0, album: {} };
  return vs;
}

// ------------------------------------------------------------ derived -----

export const projectsDone = (save, vid) => new Set(Object.keys(save.villages[vid]?.projects || {}));

/** Postcards taken on the way to mastering the village's scenes (five per scene). */
export function postcards(save, vid) {
  return Object.values(save.villages[vid].scenes).reduce((s, sc) => s + Math.min(5, sc.tier), 0);
}

// ---------------------------------------------------------- intro -------

/** Has this feature been introduced yet? (content/common/intro.json, counted in postcards taken) */
export function introduced(save, content, feature) {
  const at = content.intro?.features?.[feature];
  return at == null || save.player.plays >= at;
}

/** Jobs that may appear in the next play; types not listed follow the tier alone. */
export function jobsOpen(save, content) {
  const jobs = content.intro?.jobs || {};
  return Object.keys(content.faults).filter((t) => jobs[t] == null || save.player.plays >= jobs[t]);
}

/** Map-screen feature cards that are due and not yet shown, in order. */
export function introCardsDue(save, content) {
  const cards = content.intro?.cards || {};
  return Object.keys(cards).filter((f) => introduced(save, content, f) && !save.flags.seen[`intro:${f}`]);
}

export function bloom(save, content, vid) {
  const v = content.village(vid);
  const done = projectsDone(save, vid);
  return v.projects.filter((p) => done.has(p.id)).length / v.projects.length;
}

export function sceneUnlocked(save, content, vid, sid) {
  const v = content.village(vid);
  if (sid === v.start) return true;
  const access = v.projects.find((p) => p.unlocks === sid);
  return !!(access && save.villages[vid].projects[access.id]);
}

export function unlockedScenes(save, content, vid) {
  return content.village(vid).sceneOrder.filter((sid) => sceneUnlocked(save, content, vid, sid));
}

export function sceneStatus(save, content, vid, sid) {
  const s = save.villages[vid].scenes[sid];
  const unlocked = sceneUnlocked(save, content, vid, sid);
  return {
    unlocked, tiersDone: s.tier, nextTier: Math.min(s.tier + 1, 6), mastered: s.tier >= 5,
    plays: s.plays, best: s.best, bestStamps: s.bestStamps, album: s.album,
    accessProject: content.village(vid).projects.find((p) => p.unlocks === sid),
  };
}

export function projectStatus(save, content, vid, pid) {
  const v = content.village(vid);
  const p = v.projects.find((x) => x.id === pid);
  const done = !!save.villages[vid].projects[pid];
  const sceneOpen = sceneUnlocked(save, content, vid, p.scene);
  const needFund = Math.max(0, p.cost - save.player.fund);
  return { project: p, done, sceneOpen, needFund, canBuy: !done && sceneOpen && !needFund };
}

export function buyProject(save, content, vid, pid) {
  const st = projectStatus(save, content, vid, pid);
  if (!st.canBuy) return null;
  save.player.fund -= st.project.cost;
  save.villages[vid].projects[pid] = Date.now();
  const events = [{ kind: 'project', project: st.project }];
  if (st.project.unlocks) events.push({ kind: 'sceneUnlocked', scene: st.project.unlocks });
  const b = bloom(save, content, vid);
  if (b >= 0.5 && !save.villages[vid].letters.teaser) {
    save.villages[vid].letters.teaser = true;
    events.push({ kind: 'letter', letter: 'teaser' });
  }
  if (judgingReady(save, content, vid)) events.push({ kind: 'judgingReady' });
  return events;
}

export function judgingReady(save, content, vid) {
  return !save.villages[vid].judged && bloom(save, content, vid) >= 1;
}

/** The postcard to take next: the open scene with the fewest postcards (earliest in the village's order). */
export function nextPostcard(save, content, vid) {
  const v = content.village(vid);
  const open = unlockedScenes(save, content, vid).filter((sid) => save.villages[vid].scenes[sid].tier < 5);
  if (!open.length) return null;
  const sid = open.reduce((a, b) => (save.villages[vid].scenes[b].tier < save.villages[vid].scenes[a].tier ? b : a));
  const tier = save.villages[vid].scenes[sid].tier + 1;
  const condition = Object.keys(content.tier(tier).conditions)[0];
  return { scene: sid, tier, condition, name: v.scenes[sid].name, weather: content.conditions[condition].name };
}

/** The Committee Letter: the single clearest next thing to do. */
export function nextGoal(save, content, vid) {
  const v = content.village(vid);
  const vs = save.villages[vid];
  if (vs.judged) return { kind: 'free', text: 'Honeycombe is Best-Kept Village! Keep snapping, and a new assignment awaits at the Travel Office.' };
  if (judgingReady(save, content, vid)) return { kind: 'judging', text: 'The judges have arrived! Open the Judging on the map.' };
  const next = nextPostcard(save, content, vid);
  const snap = next ? `Next postcard: ${next.name} in ${next.weather}.` : '';
  for (const p of v.projects) {
    if (vs.projects[p.id]) continue;
    if (!sceneUnlocked(save, content, vid, p.scene)) continue;
    if (p.cost > save.player.fund) {
      const need = p.cost - save.player.fund;
      return { kind: 'fund', project: p, need, next,
        text: `Raise ${need} more for “${p.name}”.`, hint: snap };
    }
    return { kind: 'project', project: p, next, text: `The Fund can pay for “${p.name}”! Tap it on the map.` };
  }
  return { kind: 'free', next, text: 'Every project is done. Keep snapping!', hint: snap };
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

function grant(save, content, reward, out) {
  if (!reward) return;
  if (reward.fund) { save.player.fund += reward.fund; out.fund += reward.fund; }
  if (reward.flashbulbs) { save.player.flashbulbs += reward.flashbulbs; out.flashbulbs += reward.flashbulbs; }
  if (reward.secondClass) { save.player.secondClass += reward.secondClass; out.secondClass += reward.secondClass; }
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

// --------------------------------------------------------------- plays ----

/** Decide everything about the next play of a scene. */
export function planPlay(save, content, vid, sid, opts = {}) {
  const v = content.village(vid);
  const scene = v.scenes[sid];
  const ss = save.villages[vid].scenes[sid];
  const plays = save.player.plays;
  const rng = new Rng(seedOf('play', save.created, plays, sid, opts.daily || ''));
  let tier = opts.tier ?? Math.min(ss.tier + 1, 6);
  let condition = opts.condition;
  let seed = opts.seed ?? rng.int(1, 2 ** 31);
  let script = opts.script || null;
  if (opts.tutorial) {
    tier = 1; condition = 'clear'; seed = 1957;
    script = content.intro?.tutorial?.script || ['litter', 'crooked', 'litter', 'crooked', 'litter'];
  }
  if (!condition) {
    // each postcard has its weather; Free Play prefers weathers not yet in the album
    const w = { ...content.tier(tier).conditions };
    for (const c of Object.keys(w)) if (!ss.album[c]) w[c] *= 3;
    condition = rng.fork('cond').weighted(w);
  }
  const collectible = introduced(save, content, 'collectibles') ? rollCollectible(save, content, vid, scene, rng.fork('collect'), opts) : null;
  const jobs = jobsOpen(save, content);
  const show = Object.fromEntries(['score', 'combo', 'loupe', 'flash'].map((f) => [f, introduced(save, content, f)]));
  show.timer = show.score;
  return {
    village: vid, scene: sid, tier, condition, seed, script, collectible,
    daily: opts.daily || null, tutorial: !!opts.tutorial,
    projects: [...projectsDone(save, vid)],
    // jobs and Marmalade are part of the mess, so the album keeps them to redraw the postcard
    types: jobs.length < Object.keys(content.faults).length ? jobs : null,
    cat: introduced(save, content, 'cat'),
    show,
    stamps: introduced(save, content, 'score'),
    loupe: content.tier(tier).loupe * loupeMultiplier(content, save),
    nudge: content.tier(tier).nudge,
  };
}

function rollCollectible(save, content, vid, scene, rng, opts) {
  if (opts.tutorial) return null;
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
 * Apply a finished play to the save.
 * result: {score, stamps, time, fixes:{type:n}, cat, collectible, maxCombo, hints, flashes, misses, faultCount}
 */
export function applyResult(save, content, play, result, now = new Date()) {
  const out = { fund: 0, xp: 0, flashbulbs: 0, secondClass: 0, cosmetics: [], levelUps: [], events: [], requests: [], sets: [] };
  const v = content.village(play.village);
  const vs = save.villages[play.village];
  const ss = vs.scenes[play.scene];
  const tier = content.tier(play.tier);

  save.player.plays++;
  ss.plays++;

  // the Village Fund & xp (stamps only count once they've been introduced)
  const fund = Math.round(tier.fund * (play.stamps === false ? 1 : STAMP_MULT[result.stamps - 1])) + (result.cat ? 25 : 0);
  save.player.fund += fund;
  out.fund += fund;
  out.baseFund = fund;
  const xpRule = content.levels.xpPerPlay;
  addXp(save, content, Math.round((xpRule.base + xpRule.perFault * result.faultCount + xpRule.perStamp * result.stamps) * tier.xp), out);

  // the next postcard of this place
  if (!play.daily && play.tier === ss.tier + 1 && play.tier <= 5) {
    ss.tier++;
    out.events.push({ kind: 'postcard', scene: play.scene, tier: ss.tier, total: postcards(save, play.village) });
    if (ss.tier === 5) out.events.push({ kind: 'mastered', scene: play.scene });
  }
  if (result.score > ss.best) ss.best = result.score;
  if (result.stamps > ss.bestStamps) ss.bestStamps = result.stamps;

  // album: one slot per weather, best score kept (the Daily Postcard has its own diary)
  const entry = { seed: play.seed, tier: play.tier, condition: play.condition, stamps: result.stamps, score: result.score,
    time: Math.round(result.time), date: now.toISOString().slice(0, 10), projects: play.projects,
    script: play.script || null, types: play.types || null, cat: play.cat !== false };
  if (!play.daily) {
    const slot = ss.album[play.condition];
    if (!slot) { ss.album[play.condition] = entry; out.events.push({ kind: 'newPostcard', condition: play.condition }); }
    else if (result.score > slot.score) { ss.album[play.condition] = entry; out.events.push({ kind: 'betterPostcard', condition: play.condition }); }
    if (play.tier === 5 && !ss.album.mastered) { ss.album.mastered = { ...entry }; out.events.push({ kind: 'goldPostcard' }); }
  }

  // stats
  for (const [t, n] of Object.entries(result.fixes)) save.stats.fixes[t] = (save.stats.fixes[t] || 0) + n;
  if (result.cat) save.stats.cats++;
  save.stats.bestCombo = Math.max(save.stats.bestCombo, result.maxCombo);
  save.stats.hints += result.hints;
  save.stats.score += result.score;
  if (result.stamps === 3) save.stats.perfect++;

  // scrapbook
  if (play.collectible) save.collect.pity = 0; else if (introduced(save, content, 'collectibles')) save.collect.pity++;
  if (result.collectible && play.collectible) addCollectible(save, content, play.village, play.collectible.id, out);

  // requests
  progressRequests(save, content, play, result, out);

  // daily postcard
  if (play.daily) completeDaily(save, content, play.daily, result, out);

  if (play.tutorial) save.flags.tutorial = true;
  if (judgingReady(save, content, play.village)) out.events.push({ kind: 'judgingReady' });
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
    save.player.fund += 15; out.fund += 15;
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

function sceneCanHave(content, vid, sid, type, projects) {
  const scene = content.scene(vid, sid);
  const f = content.faults[type];
  if (!f) return false;
  switch (f.strategy) {
    case 'spawn': return f.slot === 'edges' ? !!scene.edges?.length : !!scene.zones?.length;
    case 'prop': return activeProps(scene, projects).some((p) => (p.tags || []).includes(f.tag));
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
  const unlocked = unlockedScenes(save, content, vid);
  const projects = projectsDone(save, vid);
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
    const types = vg.likes.filter((ty) => (kind === 'fixAny' ? unlocked.some((s) => sceneCanHave(content, vid, s, ty, projects)) : sceneCanHave(content, vid, scene, ty, projects)));
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
  } else if (kind === 'stamps') {
    req.count = 1;
  } else if (kind === 'quick') {
    req.seconds = rng.int(t.seconds[0], t.seconds[1]);
    req.count = 1;
  } else if (kind === 'nohint') {
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
    fund: rng.int(t.reward.fund[0], t.reward.fund[1]),
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
    case 'stamps': return `3-stamp postcard of ${sceneName}`;
    case 'condition': return `A postcard in ${content.conditions[r.condition].name}`;
    case 'combo': return `Reach a ×${r.count} combo`;
    case 'nohint': return 'Finish a scene without hints';
    case 'quick': return `Finish a scene in under ${r.seconds}s`;
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

function progressRequests(save, content, play, result, out) {
  for (const r of save.requests.active) {
    const sceneOk = !r.scene || r.scene === play.scene;
    let add = 0;
    switch (r.kind) {
      case 'fix': if (sceneOk) add = result.fixes[r.type] || 0; break;
      case 'fixAny': add = result.fixes[r.type] || 0; break;
      case 'cat': add = result.cat ? 1 : 0; break;
      case 'stamps': add = sceneOk && result.stamps === 3 ? 1 : 0; break;
      case 'condition': add = play.condition === r.condition ? 1 : 0; break;
      case 'combo': add = result.maxCombo >= r.count ? r.count : 0; break;
      case 'nohint': add = result.hints === 0 && result.flashes === 0 ? 1 : 0; break;
      case 'quick': add = result.time <= r.seconds ? 1 : 0; break;
      case 'plays': add = sceneOk ? 1 : 0; break;
      case 'collect': add = result.collectible ? 1 : 0; break;
    }
    if (add) { r.progress = Math.min(r.count, r.progress + add); r.touched = true; }
  }
}

/** Claim a finished request (tap on the noticeboard). */
export function claimRequest(save, content, vid, reqId) {
  const i = save.requests.active.findIndex((r) => r.id === reqId);
  if (i < 0) return null;
  const r = save.requests.active[i];
  if (r.progress < r.count) return null;
  const out = { fund: 0, xp: 0, flashbulbs: 0, secondClass: 0, cosmetics: [], levelUps: [], events: [], requests: [r], sets: [] };
  save.requests.active.splice(i, 1);
  save.requests.done++;
  grant(save, content, { fund: r.reward.fund, xp: r.reward.xp, flashbulbs: r.reward.flashbulbs }, out);
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

function dayDiff(a, b) {
  const pa = Date.UTC(...a.split('-').map((n, i) => +n - (i === 1 ? 1 : 0)));
  const pb = Date.UTC(...b.split('-').map((n, i) => +n - (i === 1 ? 1 : 0)));
  return Math.round((pb - pa) / 86400000);
}

export function dailyInfo(save, content, vid, today = dateKey()) {
  const v = content.village(vid);
  const rng = new Rng(seedOf('daily', vid, today));
  const unlocked = unlockedScenes(save, content, vid);
  const idx = rng.int(0, v.sceneOrder.length - 1);
  const scene = unlocked.includes(v.sceneOrder[idx]) ? v.sceneOrder[idx] : unlocked[idx % unlocked.length];
  const condition = rng.pick(['golden', 'mist', 'dusk', 'storm', 'clear', 'golden']);
  const maxTier = Math.max(...unlocked.map((s) => save.villages[vid].scenes[s].tier));
  const tier = clamp(maxTier + 1, 2, 3);
  const done = !!save.daily.history[today];
  let streak = save.daily.streak;
  if (save.daily.last && !done) {
    const gap = dayDiff(save.daily.last, today);
    if (gap > 2 || (gap === 2 && !save.player.secondClass)) streak = 0;
  }
  const cardDay = (streak % 7) + (done ? 0 : 1);
  return { date: today, scene, condition, tier, seed: seedOf('daily-seed', vid, today) % 2 ** 31, done, streak,
    cardDay: done ? ((streak - 1) % 7) + 1 : cardDay, card: DAILY_CARD, unlocked: introduced(save, content, 'daily') };
}

function completeDaily(save, content, date, result, out) {
  if (save.daily.history[date]) return;
  const last = save.daily.last;
  let streak = 1;
  if (last) {
    const gap = dayDiff(last, date);
    if (gap === 1) streak = save.daily.streak + 1;
    else if (gap === 2 && save.player.secondClass > 0) { save.player.secondClass--; streak = save.daily.streak + 1; out.events.push({ kind: 'streakSaved' }); }
    else if (gap <= 0) streak = save.daily.streak;
  }
  save.daily.streak = streak;
  save.daily.best = Math.max(save.daily.best, streak);
  save.daily.last = date;
  save.daily.history[date] = { stamps: result.stamps, score: result.score };
  const day = ((streak - 1) % 7) + 1;
  const reward = DAILY_CARD[day - 1];
  grant(save, content, reward, out);
  if (reward.collectible) grantRandomCollectible(save, content, save.current, new Rng(seedOf('dailyc', date)), out);
  out.events.push({ kind: 'daily', streak, day, reward });
}

// --------------------------------------------------------------- finale ---

export function completeJudging(save, content, vid) {
  if (!judgingReady(save, content, vid)) return null;
  save.villages[vid].judged = Date.now();
  const out = { fund: 0, xp: 0, flashbulbs: 0, secondClass: 0, cosmetics: [], levelUps: [], events: [], requests: [], sets: [] };
  grant(save, content, { fund: 500, xp: 400, flashbulbs: 3, cosmetic: 'frame-gilt' }, out);
  return out;
}
