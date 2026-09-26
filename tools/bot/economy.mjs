// Route simulator: plays a whole village's restoration story with simulated
// players, using the real progression rules (the save, visits, completion,
// the introduction schedule), and reports the story and the optional
// activities separately:
//   - time to the first action, the first postcard, the third place, the finale
//   - every visit's play time, and the longest stretch between new places
//   - what optional content (photo walks, the daily, favours, keepsakes) exists
//     and how long a completionist would spend on it
// It also checks the story never waits on anything optional: the finale is
// reached with no photo walks, no dailies and no favours at all.
//
// These are simulated players: the times are starting hypotheses for human
// playtests, not measurements.
//   node tools/bot/economy.mjs [--village honeycombe] [--runs 5]     (npm run economy)
// Writes tools/bot/economy.md.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import * as P from '../../src/core/progression.js';
import { generateMess, generateVisit } from '../../src/core/mess.js';
import { simulatePlay, SKILLS } from '../../src/core/sim.js';
import { stampsFor } from '../../src/core/scoring.js';
import { Rng } from '../../src/core/rng.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const content = await loadFromDisk();
const vid = args.village || 'honeycombe';
const RUNS = +(args.runs || 5);
const v = content.village(vid);

// seconds spent around a visit that aren't tapping: assumed, not measured
const OPENING = 6;        // the one-line opening card
const BRIEF = 8;          // reading the resident's request
const NEW_JOB_CARD = 5;   // a job's first-time card
const REVEAL = 11;        // the full-scene reveal and the postcard forming
const RAIL = 6;           // reading the reaction, tapping Next
const MAP = 7;            // a stop at the map (new places, feature cards)
const WALK_META = 20;     // a photo walk's arrival, its reveal and the map

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function playStory(skillName, runSeed) {
  const skill = SKILLS[skillName];
  const save = P.newSave(content, 1_700_000_000_000 + runSeed);
  const rng = new Rng(runSeed);
  const log = [];
  let t = OPENING;
  let firstAction = null, firstPostcard = null, thirdPlace = null;
  const seen = new Set();
  for (let guard = 0; guard < 60; guard++) {
    const step = P.nextStep(save, content, vid);
    if (step.kind !== 'visit') break;
    const visit = step.visit;
    const plan = P.planVisit(save, content, vid, visit.id);
    P.beginPlay(save, plan);
    const mess = generateVisit(content, { village: vid, visit: visit.id, seed: plan.seed, effectsDone: plan.effects, fixed: plan.fixed, collectible: plan.collectible, cat: plan.cat });
    const sim = simulatePlay(content, mess, skill, rng.fork(visit.id), { par: mess.par, loupeCooldown: content.story.hints.cooldown });
    const fresh = new Set(mess.faults.map((f) => f.type).filter((ty) => !seen.has(ty)));
    for (const ty of fresh) seen.add(ty);
    const before = t;
    t += BRIEF + (visit.tutorial ? 0 : fresh.size * NEW_JOB_CARD);
    if (firstAction == null) firstAction = t + Math.min(...mess.faults.map(() => skill.react)) + 3;
    t += sim.time;
    const fixes = {};
    for (const f of mess.faults) fixes[f.type] = (fixes[f.type] || 0) + 1;
    const receipt = P.completeVisit(save, content, plan, { time: sim.time, fixes, cat: false, collectible: !!plan.collectible, maxCombo: sim.maxChain, hints: sim.hints, faultCount: mess.faults.length });
    t += REVEAL + RAIL;
    if (firstPostcard == null) firstPostcard = t - RAIL;
    const opened = (receipt.events || []).filter((e) => e.kind === 'placeOpened').map((e) => e.scene);
    if (opened.length || P.introCardsDue(save, content).length) t += MAP;
    for (const k of P.introCardsDue(save, content)) save.flags.seen[`intro:${k}`] = true;
    if (thirdPlace == null && P.openScenes(save, content, vid).length >= 3) thirdPlace = t;
    log.push({ visit: visit.id, scene: visit.scene, kind: visit.kind, jobs: mess.faults.length, play: sim.time, hints: sim.hints, at: t, span: t - before, opened, restored: receipt.restored });
  }
  const complete = P.storyComplete(save, content, vid) && P.judgingReady(save, content, vid);
  return { log, total: t, firstAction, firstPostcard, thirdPlace, complete, save };
}

/** The optional side: every weather postcard of every place, as an average player. */
function optionalTime(save, runSeed) {
  const rng = new Rng(runSeed + 99);
  let t = 0, walks = 0;
  const s = JSON.parse(JSON.stringify(save));
  for (const sid of v.sceneOrder) {
    for (let k = 0; k < 5; k++) {
      const plan = P.planWalk(s, content, vid, sid);
      const mess = generateMess(content, { village: vid, scene: sid, tier: plan.tier, condition: plan.condition, seed: plan.seed, projectsDone: plan.effects, fixed: plan.fixed, protect: plan.protect, policy: true, types: null, cat: plan.cat });
      const sim = simulatePlay(content, mess, SKILLS.average, rng.fork(`${sid}${k}`), { par: mess.par });
      P.completeWalk(s, content, plan, { score: sim.score, stamps: stampsFor(content.scoring, sim.breakdown, mess.ref), time: sim.time, fixes: {}, cat: false, collectible: false, maxCombo: sim.maxChain, hints: sim.hints, flashes: 0, misses: sim.misses, faultCount: mess.faults.length });
      t += sim.time + WALK_META;
      walks++;
    }
  }
  return { t, walks, postcards: P.postcards(s, vid) };
}

const bySkill = {};
for (const skill of ['novice', 'average', 'skilled']) {
  bySkill[skill] = Array.from({ length: RUNS }, (_, i) => playStory(skill, 1000 + i));
}
const avg = (runs, f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
const avgRuns = bySkill.average;
const r0 = avgRuns[0];
const problems = [];
for (const [skill, runs] of Object.entries(bySkill)) if (runs.some((r) => !r.complete)) problems.push(`${skill}: a run did not reach the judging`);
if (r0.log.length !== v.visits.length) problems.push(`the route played ${r0.log.length} of ${v.visits.length} visits`);
const opt = optionalTime(r0.save, 1000);
const keepsakes = v.collectibles.sets.reduce((a, s) => a + s.items.length, 0);

const L = [];
L.push(`# Route report: ${v.name}`);
L.push('');
L.push(`Generated by \`npm run economy\`. ${RUNS} simulated playthroughs per skill of the restoration route, using the real progression rules, a perfect record of the route order and no optional activity at all (the story never waits on photo walks, the daily, favours or keepsakes). Time around each visit that isn't tapping is assumed: ${BRIEF}s for the resident's request, ${NEW_JOB_CARD}s per new-job card, ${REVEAL + RAIL}s for the reveal and the next step, ${MAP}s at the map when something new is there.`);
L.push('');
L.push('**These are models, not measurements.** Real first-time players read, look and explore more slowly than the simulated ones; treat every figure as a hypothesis to test with people.');
L.push('');
L.push('## The story');
L.push('');
L.push('| Moment | Target (handover) | Novice | Average | Skilled |');
L.push('|---|---|---|---|---|');
const row = (label, target, f) => L.push(`| ${label} | ${target} | ${['novice', 'average', 'skilled'].map((k) => fmt(avg(bySkill[k], f))).join(' | ')} |`);
row('First meaningful action', '20–30 s', (r) => r.firstAction);
row('First postcard', '1:30–2:30', (r) => r.firstPostcard);
row('Third place open', '8–12 min or sooner', (r) => r.thirdPlace);
row('Whole story, to the judging', '25–40 min', (r) => r.total);
L.push('');
L.push(`Visits: ${v.visits.length} (${v.visits.filter((x) => x.kind === 'restoration').length} restoration, ${v.visits.filter((x) => x.kind === 'committee').length} committee requests, ${v.visits.filter((x) => x.kind === 'incident').length} storm). Places restored at the end: ${r0.log.at(-1)?.restored ?? 0} of ${v.sceneOrder.length}.`);
L.push('');
L.push('## Visit by visit (average player, run 1)');
L.push('');
L.push('| # | Visit | Place | Kind | Jobs | Tapping | Visit in all | Story clock | Opens |');
L.push('|---|---|---|---|---|---|---|---|---|');
r0.log.forEach((e, i) => L.push(`| ${i + 1} | ${e.visit} | ${v.scenes[e.scene].name} | ${e.kind} | ${e.jobs} | ${Math.round(e.play)}s | ${fmt(e.span)} | ${fmt(e.at)} | ${e.opened.map((sid) => v.scenes[sid].name).join(', ')} |`));
L.push('');
L.push('## Optional, after (or alongside) the story');
L.push('');
L.push(`- Weather postcards: 5 per place, ${v.sceneOrder.length * 5} in all. Taking every one is about **${fmt(opt.t)}** (${opt.walks} photo walks by an average player, ${WALK_META}s of menus each).`);
L.push(`- Keepsakes: ${keepsakes} in ${v.collectibles.sets.length} sets, found by chance on visits and walks.`);
L.push(`- Favours: ${content.requests.slots} at a time from the neighbours, from the noticeboard.`);
L.push('- The Daily Postcard: one photo walk a day; a missed day costs nothing.');
L.push('');
L.push(`Story plus every weather postcard: about ${fmt(avg(avgRuns, (r) => r.total) + opt.t)} for an average player.`);
L.push('');
L.push(`## Checks\n\n${problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'Every run by every skill reached the judging, with no optional activity.'}`);
const md = L.join('\n') + '\n';
await writeFile(path.join(ROOT, 'tools/bot/economy.md'), md);
console.log(md);
if (problems.length) process.exit(1);
