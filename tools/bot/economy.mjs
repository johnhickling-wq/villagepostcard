// Economy simulator: plays a whole village as an "average" player using the
// real progression rules, and reports how long it takes to reach the Best-Kept
// Village judging, where the walls are, and what the income looks like.
//   node tools/bot/economy.mjs [--village honeycombe] [--skill average] [--runs 5]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import {
  newSave, planPlay, applyResult, buyProject, projectStatus, nextGoal, judgingReady, rosettes, bloom,
  unlockedScenes, claimRequest, refillRequests, dailyInfo, levelInfo,
} from '../../src/core/progression.js';
import { generateMess } from '../../src/core/mess.js';
import { simulatePlay, SKILLS } from '../../src/core/sim.js';
import { stampsFor } from '../../src/core/scoring.js';
import { Rng } from '../../src/core/rng.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const content = await loadFromDisk();
const vid = args.village || 'honeycombe';
const skill = SKILLS[args.skill || 'average'];
const RUNS = +(args.runs || 5);
const META_SECONDS = 25; // map, results and menus per play
const PLAYS_PER_DAY = 6;

function runOnce(runSeed) {
  const save = newSave(content, 1_700_000_000_000 + runSeed);
  save.player.pennies = 40;
  const rng = new Rng(runSeed);
  const log = [];
  let seconds = 0, sinceBuy = 0, maxWall = 0, wallAt = '';
  let day = 0;
  const t0 = new Date('2026-01-01T09:00:00');
  for (let play = 0; play < 400; play++) {
    // spend: buy every affordable project in storyline order
    let bought = true;
    while (bought) {
      bought = false;
      for (const p of content.village(vid).projects) {
        if (projectStatus(save, content, vid, p.id).canBuy) {
          buyProject(save, content, vid, p.id);
          log.push({ play, project: p.id, pennies: save.player.pennies });
          if (sinceBuy > maxWall) { maxWall = sinceBuy; wallAt = p.id; }
          sinceBuy = 0;
          bought = true;
        }
      }
    }
    if (judgingReady(save, content, vid)) return { plays: play, seconds, maxWall, wallAt, log, save };
    // claim finished requests
    for (const r of [...save.requests.active]) if (r.progress >= r.count) claimRequest(save, content, vid, r.id);
    // choose what to play: daily first each "day", else the unlocked scene with the lowest tier
    const date = new Date(t0.getTime() + Math.floor(play / PLAYS_PER_DAY) * 86400000);
    const dateKey = date.toISOString().slice(0, 10);
    const daily = dailyInfo(save, content, vid, dateKey);
    let opts = {};
    let sid;
    if (daily.unlocked && !daily.done && play % PLAYS_PER_DAY === 0) {
      sid = daily.scene;
      opts = { daily: dateKey, tier: daily.tier, condition: daily.condition, seed: daily.seed };
    } else {
      const scenes = unlockedScenes(save, content, vid);
      sid = scenes.reduce((a, b) => (save.villages[vid].scenes[b].tier < save.villages[vid].scenes[a].tier ? b : a));
    }
    const plan = planPlay(save, content, vid, sid, opts);
    const mess = generateMess(content, { village: vid, scene: sid, tier: plan.tier, condition: plan.condition, seed: plan.seed, projectsDone: plan.projects, collectible: plan.collectible, script: plan.script });
    const sim = simulatePlay(content, mess, skill, rng.fork('p' + play), { par: mess.par });
    const stamps = stampsFor(content.scoring, sim.breakdown, mess.ref);
    const fixes = {};
    for (const f of mess.faults) fixes[f.type] = (fixes[f.type] || 0) + 1;
    const found = { cat: rng.chance(0.55), collectible: !!plan.collectible && rng.chance(0.8) };
    applyResult(save, content, plan, {
      score: sim.score, stamps, time: sim.time, fixes, cat: found.cat, collectible: found.collectible,
      maxCombo: sim.maxChain, hints: sim.hints, flashes: 0, misses: sim.misses, faultCount: mess.faults.length,
    }, date);
    seconds += sim.time + META_SECONDS;
    sinceBuy++;
  }
  return { plays: 400, seconds, maxWall, wallAt, log, save, stuck: true };
}

const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(runOnce(1000 + i));
const avg = (f) => runs.reduce((s, r) => s + f(r), 0) / runs.length;
const r0 = runs[0];
const lines = [];
lines.push(`# Economy report: ${content.village(vid).name}`);
lines.push('');
lines.push(`Simulated ${RUNS} playthroughs by an **${args.skill || 'average'}** player (${META_SECONDS}s of menus per play, ${PLAYS_PER_DAY} plays a day, Daily Postcard each day).`);
lines.push('');
lines.push(`- Plays to Best-Kept Village judging: **${Math.round(avg((r) => r.plays))}**`);
lines.push(`- Time to judging: **${(avg((r) => r.seconds) / 3600).toFixed(1)} hours**`);
lines.push(`- Longest wait between restoration projects: **${Math.round(avg((r) => r.maxWall))} plays** (worst: ${runs.map((r) => `${r.maxWall} before ${r.wallAt}`).join(', ')})`);
lines.push(`- Photographer level at judging: ${Math.round(avg((r) => levelInfo(content, r.save.player.xp).level))}`);
lines.push(`- Keepsakes found: ${Math.round(avg((r) => Object.keys(r.save.collect.owned).length))} of 30`);
lines.push(`- Rosettes at judging: ${Math.round(avg((r) => rosettes(r.save, vid)))}`);
lines.push('');
lines.push('## Run 1 purchase timeline');
lines.push('');
lines.push('| Play | Project | Pennies left |');
lines.push('|---|---|---|');
for (const e of r0.log) lines.push(`| ${e.play} | ${e.project} | ${e.pennies} |`);
const md = lines.join('\n') + '\n';
await writeFile(path.join(ROOT, 'tools/bot/economy.md'), md);
console.log(md);
if (runs.some((r) => r.stuck)) { console.log('A run never reached judging!'); process.exit(1); }
