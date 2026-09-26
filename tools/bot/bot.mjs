// Headless playtest bot. Two parts:
//
//   visits      every story visit, generated in route order (so the state of
//               the village is the one the player really has), over many seeds:
//               fairness, target size at the default phone view, overlays, and
//               simulated players' times
//   photo walks every scene x tier, on a fresh, a half-restored and a fully
//               restored village, with the same protection the game applies
//               (nothing restored for good is ever spoilt, no paint after a storm)
//
//   node tools/bot/bot.mjs [--seeds 150] [--village honeycombe] [--scene id]
//
// Writes tools/bot/report.md and tools/bot/report.json.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import { generateMess, generateVisit, keepOutBoxes } from '../../src/core/mess.js';
import { simulatePlay, SKILLS } from '../../src/core/sim.js';
import { PlaySession } from '../../src/core/session.js';
import { shapeCenter, shapeBounds, boundsOverlap, distToShape } from '../../src/core/geometry.js';
import { stampsFor } from '../../src/core/scoring.js';
import { Rng } from '../../src/core/rng.js';
import { walkStates } from './states.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
const SEEDS = +(args.seeds || 150);
const content = await loadFromDisk();
const TARGET = { 1: 40, 2: 55, 3: 70, 4: 85, 5: 100, 6: 90 };
const TAP_TOL = 22; // scene units (~8px on a phone at default zoom)

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/** A grid of sample points inside a hit shape. */
function insidePoints(shape) {
  const b = shapeBounds(shape);
  const pts = [];
  for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
    const x = b.x + (b.w * i) / 6, y = b.y + (b.h * j) / 6;
    if (distToShape(x, y, shape) === 0) pts.push([x, y]);
  }
  if (!pts.length) pts.push(shapeCenter(shape));
  return pts;
}

/** Fairness of one generated mess: counts problems into stat. */
function checkFairness(stat, content, mess, play, keepOut) {
  const session = new PlaySession(content, mess, play);
  session.minTarget = MIN_TARGET_PX / PHONE_SCALE;
  for (const f of mess.faults) {
    const pts = insidePoints(f.shape);
    const owners = pts.map(([x, y]) => session._hitTest(x, y, TAP_TOL));
    const mine = owners.filter((hh) => hh?.kind === 'fault' && hh.target.id === f.id).length;
    if (!mine) stat.unreachable++;
    else if (mine < pts.length * 0.4) stat.ambiguous++;
  }
  const hidden = [...mess.faults, mess.cat, mess.collectible].filter(Boolean);
  for (const f of hidden) if (keepOut.some((k) => boundsOverlap(shapeBounds(f.shape), k) > 0)) stat.underHud++;
  for (let i = 0; i < mess.faults.length; i++) {
    for (let j = i + 1; j < mess.faults.length; j++) {
      if (boundsOverlap(shapeBounds(mess.faults[i].shape), shapeBounds(mess.faults[j].shape)) > 0.35) stat.overlaps++;
    }
  }
}

const rows = [];
const visitRows = [];
const problems = [];
const typeCounts = {};
const PHONE_SCALE = 844 / 2000; // scene units -> CSS px on a typical phone, whole scene in view
const MIN_TARGET_PX = content.story.assist.minTargetPx;

// ------------------------------------------------------------------ visits
for (const [vid, v] of Object.entries(content.villages)) {
  if (args.village && args.village !== vid) continue;
  const effects = new Set(), fixed = {};
  for (const visit of v.visits) {
    const sid = visit.scene;
    const stat = { n: 0, faults: [], unreachable: 0, ambiguous: 0, overlaps: 0, underHud: 0, small: 0, tiny: 0, spoils: 0, sal: [], times: { novice: [], average: [], skilled: [] } };
    const keepOut = keepOutBoxes(content, v.scenes[sid], 'story');
    const incident = visit.incident ? content.story.incidents[visit.incident] : null;
    if (!args.scene || args.scene === sid) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const mess = generateVisit(content, { village: vid, visit, seed, effectsDone: effects, fixed: fixed[sid] || [], cat: seed % 3 !== 0, collectible: seed % 4 === 0 ? { id: 'x', sprite: 'collectibles/cowslip' } : null });
        stat.n++;
        stat.faults.push(mess.faults.length);
        if (mess.problems.length) problems.push(`visit ${visit.id} seed ${seed}: ${mess.problems.join('; ')}`);
        for (const f of mess.faults) {
          stat.sal.push(f.salience);
          const px = f.size * PHONE_SCALE;
          if (px < 30) stat.small++;
          if (px < 22) stat.tiny++;
          if (incident && !incident.ops.includes(f.type)) stat.spoils++;
        }
        checkFairness(stat, content, mess, { mode: 'visit', village: vid, scene: sid, loupe: content.story.hints.cooldown, nudge: 0 }, keepOut);
        const rng = new Rng(seed * 7919 + visit.id.length);
        for (const [name, skill] of Object.entries(SKILLS)) {
          stat.times[name].push(simulatePlay(content, mess, skill, rng.fork(name), { par: mess.par, loupeCooldown: content.story.hints.cooldown }).time);
        }
      }
      const row = {
        visit: visit.id, scene: sid, kind: visit.kind, n: stat.n, tasks: +mean(stat.faults).toFixed(1), salience: +mean(stat.sal).toFixed(2),
        unreachable: stat.unreachable, ambiguous: stat.ambiguous, underHud: stat.underHud, small: stat.small, tiny: stat.tiny, spoils: stat.spoils,
        novice: Math.round(median(stat.times.novice)), average: Math.round(median(stat.times.average)), averageP90: Math.round(pct(stat.times.average, 0.9)), skilled: Math.round(median(stat.times.skilled)),
      };
      visitRows.push(row);
      if (row.unreachable) problems.push(`visit ${visit.id}: ${row.unreachable} tasks completely covered by others`);
      if (row.ambiguous > stat.n * 0.1) problems.push(`visit ${visit.id}: ${row.ambiguous} tasks mostly covered by others`);
      if (row.underHud) problems.push(`visit ${visit.id}: ${row.underHud} tasks, cats or keepsakes under the play-screen overlays`);
      if (row.spoils) problems.push(`visit ${visit.id}: ${row.spoils} tasks outside the ${visit.incident} allowlist`);
      process.stdout.write(`visit ${visit.id.padEnd(15)} tasks ${String(row.tasks).padEnd(4)} avg ${String(row.average).padStart(3)}s (p90 ${row.averageP90}s)  novice ${row.novice}s  small ${row.small}  issues ${row.unreachable + row.ambiguous + row.underHud + row.spoils}\n`);
    }
    for (const e of visit.effects) effects.add(e);
    for (const t of visit.tasks) if (t.target && ['faded', 'grimy', 'wilted'].includes(t.op)) (fixed[sid] ||= []).push(t.target);
  }
}

// ------------------------------------------------------------ photo walks
for (const [vid, v] of Object.entries(content.villages)) {
  if (args.village && args.village !== vid) continue;
  const states = walkStates(v);
  for (const sid of v.sceneOrder) {
    if (args.scene && args.scene !== sid) continue;
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const stat = { village: vid, scene: sid, tier, n: 0, faults: [], short: 0, ambiguous: 0, overlaps: 0, unreachable: 0, underHud: 0, spoils: 0, sal: [], times: { novice: [], average: [], skilled: [] }, stamps: { novice: [0, 0, 0], average: [0, 0, 0], skilled: [0, 0, 0] }, types: {} };
      for (let seed = 1; seed <= SEEDS; seed++) {
        const st = states[seed % 3];
        const w = st.walk(sid);
        const protect = w.protect;
        const mess = generateMess(content, { village: vid, scene: sid, tier, seed, ...w });
        const spoilt = mess.faults.filter((f) => ['faded', 'grimy', 'wilted'].includes(f.type) && protect.includes(f.region || f.prop));
        const stormPaint = mess.faults.filter((f) => mess.condition === 'storm' && f.type === 'faded');
        stat.spoils += spoilt.length + stormPaint.length;
        const t = content.tier(tier);
        stat.n++;
        stat.faults.push(mess.faults.length);
        const want = t.faults[0] + Math.round(((v.scenes[sid].difficultyOffset || 0) + (v.difficultyBase || 0)) * 1.5);
        // a restored village has less left that could be tired, so fewer faults there is expected, not a fault
        if (mess.faults.length < want - (st.n ? 2 : 0)) stat.short++;
        for (const f of mess.faults) {
          stat.sal.push(f.salience);
          stat.types[f.type] = (stat.types[f.type] || 0) + 1;
          typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;
        }
        // fairness: every fault must have somewhere you can tap that fixes it,
        // its visible middle shouldn't belong to something else, and nothing
        // to find may sit under the play screen's overlays
        checkFairness(stat, content, mess, { mode: 'walk', village: vid, scene: sid, tier, condition: mess.condition, loupe: t.loupe, nudge: 0 }, keepOutBoxes(content, v.scenes[sid]));
        // simulated players
        const rng = new Rng(seed * 7919 + tier);
        for (const [name, skill] of Object.entries(SKILLS)) {
          const r = simulatePlay(content, mess, skill, rng.fork(name), { par: mess.par });
          stat.times[name].push(r.time);
          stat.stamps[name][stampsFor(content.scoring, r.breakdown, mess.ref) - 1]++;
        }
      }
      const row = {
        village: vid, scene: sid, tier, n: stat.n,
        faults: +mean(stat.faults).toFixed(1), salience: +mean(stat.sal).toFixed(2),
        short: stat.short, unreachable: stat.unreachable, ambiguous: stat.ambiguous, overlaps: stat.overlaps, underHud: stat.underHud, spoils: stat.spoils,
        novice: Math.round(median(stat.times.novice)), average: Math.round(median(stat.times.average)), averageP90: Math.round(pct(stat.times.average, 0.9)), skilled: Math.round(median(stat.times.skilled)),
        target: TARGET[tier],
        stamps: Object.fromEntries(Object.entries(stat.stamps).map(([k, s]) => [k, s.map((x) => Math.round((x / stat.n) * 100))])),
        types: stat.types,
      };
      rows.push(row);
      if (row.underHud) problems.push(`${sid} t${tier}: ${row.underHud} faults, cats or keepsakes under the play-screen overlays`);
      if (row.spoils) problems.push(`${sid} t${tier}: ${row.spoils} faults undo restored work or strip paint after a storm`);
      if (row.unreachable) problems.push(`${sid} t${tier}: ${row.unreachable} faults completely covered by others`);
      if (row.ambiguous > stat.n * 0.1) problems.push(`${sid} t${tier}: ${row.ambiguous} faults mostly covered by others`);
      if (row.short > stat.n * 0.05) problems.push(`${sid} t${tier}: ${row.short}/${stat.n} messes had too few faults`);
      if (Math.abs(row.average - row.target) / row.target > 0.3) problems.push(`${sid} t${tier}: average player ${row.average}s vs target ${row.target}s`);
      process.stdout.write(`${sid.padEnd(16)} t${tier}  faults ${String(row.faults).padEnd(4)} sal ${row.salience}  avg ${String(row.average).padStart(3)}s (p90 ${row.averageP90}s, target ${row.target})  novice ${row.novice}s  skilled ${row.skilled}s  3★ avg ${row.stamps.average[2]}%  issues ${row.unreachable + row.ambiguous}\n`);
    }
  }
}

// per-tier summary
const byTier = {};
for (const r of rows) (byTier[r.tier] ||= []).push(r);
const summary = Object.entries(byTier).map(([tier, rs]) => ({
  tier: +tier, target: TARGET[tier], average: Math.round(mean(rs.map((r) => r.average))), novice: Math.round(mean(rs.map((r) => r.novice))), skilled: Math.round(mean(rs.map((r) => r.skilled))),
  stamps3: Math.round(mean(rs.map((r) => r.stamps.average[2]))), stamps2: Math.round(mean(rs.map((r) => r.stamps.average[1]))),
}));

const vt = (k) => visitRows.reduce((s, r) => s + r[k], 0);
let md = `# Bot report\n\nGenerated by \`npm run bot\` with ${SEEDS} seeds per case. Every generated job is checked for fairness: tappable at its centre with no ambiguity (with the game's own tap tolerance and small-target assistance), nothing under the play-screen overlays, nothing restored for good ever spoilt, and incidents keep to their allowed jobs. Simulated players (novice, average, skilled) give the times. These are models, not measurements of real people: the timings are starting points for human playtests.\n\n`;
md += `## Story visits\n\nEach visit is generated in route order, in the state of the village a player really has at that point. "Small" counts jobs under 30 CSS px across at the default view of an 844 px wide phone (still tappable over ${MIN_TARGET_PX} px thanks to target assistance; zoom helps to see them).\n\n`;
md += `| Visit | Place | Kind | Jobs | Novice | Average | p90 | Skilled | Small | Issues |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of visitRows) md += `| ${r.visit} | ${r.scene} | ${r.kind} | ${r.tasks} | ${r.novice}s | **${r.average}s** | ${r.averageP90}s | ${r.skilled}s | ${(r.small / r.n).toFixed(1)} | ${r.unreachable + r.ambiguous + r.underHud + r.spoils} |\n`;
md += `\nAll visits: ${visitRows.length}, ${vt('unreachable')} unreachable, ${vt('ambiguous')} ambiguous, ${vt('underHud')} under overlays, ${vt('spoils')} outside an incident's allowed jobs.\n\n`;
md += `## Photo walks (optional), per tier (average player)\n\nA third each on a fresh, a half-restored and a fully restored village.\n\n| Tier | Target | Novice | Average | Skilled | 3 stamps | 2 stamps |\n|---|---|---|---|---|---|---|\n`;
for (const s of summary) md += `| ${s.tier} | ${s.target}s | ${s.novice}s | **${s.average}s** | ${s.skilled}s | ${s.stamps3}% | ${s.stamps2}% |\n`;
md += `\n## Fault mix\n\n${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${n}`).join('\n')}\n`;
md += `\n## Issues\n\n${problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'None: every generated mess was solvable and unambiguous.'}\n`;
md += `\n## Photo walks per scene\n\n| Scene | Tier | Faults | Salience | Avg time | p90 | Novice | Skilled | 3★ |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.scene} | ${r.tier} | ${r.faults} | ${r.salience} | ${r.average}s | ${r.averageP90}s | ${r.novice}s | ${r.skilled}s | ${r.stamps.average[2]}% |\n`;
await writeFile(path.join(ROOT, 'tools/bot/report.md'), md);
await writeFile(path.join(ROOT, 'tools/bot/report.json'), JSON.stringify({ visits: visitRows, summary, rows, problems }, null, 1));
console.log('\nPer tier:', summary.map((s) => `t${s.tier} ${s.average}s (target ${s.target}s, 3★ ${s.stamps3}%)`).join(' | '));
console.log(problems.length ? `\n${problems.length} issue(s):\n${problems.slice(0, 30).join('\n')}` : '\nNo fairness issues.');
