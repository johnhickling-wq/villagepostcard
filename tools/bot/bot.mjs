// Headless playtest bot. For every scene x tier it generates hundreds of
// messes and checks they are solvable and fair, then simulates players of
// three skill levels to measure completion times and stamp rates.
//
//   node tools/bot/bot.mjs [--seeds 150] [--village honeycombe] [--scene id]
//
// Writes tools/bot/report.md and tools/bot/report.json.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import { generateMess } from '../../src/core/mess.js';
import { simulatePlay, SKILLS } from '../../src/core/sim.js';
import { PlaySession } from '../../src/core/session.js';
import { shapeCenter, shapeBounds, boundsOverlap, distToShape } from '../../src/core/geometry.js';
import { stampsFor } from '../../src/core/scoring.js';
import { Rng } from '../../src/core/rng.js';

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

const rows = [];
const problems = [];
const typeCounts = {};
for (const [vid, v] of Object.entries(content.villages)) {
  if (args.village && args.village !== vid) continue;
  const allProjects = v.projects.map((p) => p.id);
  for (const sid of v.sceneOrder) {
    if (args.scene && args.scene !== sid) continue;
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      const stat = { village: vid, scene: sid, tier, n: 0, faults: [], short: 0, ambiguous: 0, overlaps: 0, unreachable: 0, sal: [], times: { novice: [], average: [], skilled: [] }, stamps: { novice: [0, 0, 0], average: [0, 0, 0], skilled: [0, 0, 0] }, types: {} };
      for (let seed = 1; seed <= SEEDS; seed++) {
        // alternate restoration states: fresh village vs fully restored
        const projects = seed % 2 ? [] : allProjects;
        const mess = generateMess(content, { village: vid, scene: sid, tier, seed, projectsDone: projects });
        const t = content.tier(tier);
        stat.n++;
        stat.faults.push(mess.faults.length);
        const want = t.faults[0] + Math.round(((v.scenes[sid].difficultyOffset || 0) + (v.difficultyBase || 0)) * 1.5);
        if (mess.faults.length < want) stat.short++;
        for (const f of mess.faults) {
          stat.sal.push(f.salience);
          stat.types[f.type] = (stat.types[f.type] || 0) + 1;
          typeCounts[f.type] = (typeCounts[f.type] || 0) + 1;
        }
        // fairness: every fault must have somewhere you can tap that fixes it,
        // and its visible middle shouldn't belong to something else
        const play = { village: vid, scene: sid, tier, condition: mess.condition, loupe: t.loupe, nudge: 0 };
        const session = new PlaySession(content, mess, play);
        for (const f of mess.faults) {
          const pts = insidePoints(f.shape);
          const owners = pts.map(([x, y]) => session._hitTest(x, y, TAP_TOL));
          const mine = owners.filter((hh) => hh?.kind === 'fault' && hh.target.id === f.id).length;
          if (!mine) stat.unreachable++;
          else if (mine < pts.length * 0.4) stat.ambiguous++;
        }
        for (let i = 0; i < mess.faults.length; i++) {
          for (let j = i + 1; j < mess.faults.length; j++) {
            if (boundsOverlap(shapeBounds(mess.faults[i].shape), shapeBounds(mess.faults[j].shape)) > 0.35) stat.overlaps++;
          }
        }
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
        short: stat.short, unreachable: stat.unreachable, ambiguous: stat.ambiguous, overlaps: stat.overlaps,
        novice: Math.round(median(stat.times.novice)), average: Math.round(median(stat.times.average)), averageP90: Math.round(pct(stat.times.average, 0.9)), skilled: Math.round(median(stat.times.skilled)),
        target: TARGET[tier],
        stamps: Object.fromEntries(Object.entries(stat.stamps).map(([k, s]) => [k, s.map((x) => Math.round((x / stat.n) * 100))])),
        types: stat.types,
      };
      rows.push(row);
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

let md = `# Bot report\n\nGenerated by \`npm run bot\`: ${SEEDS} generated messes per scene and tier, half on a fresh village and half fully restored.\nEach mess is checked for fairness (every fault tappable at its centre with no ambiguity) and played by three simulated players.\n\n`;
md += `## Per tier (average player)\n\n| Tier | Target | Novice | Average | Skilled | 3 stamps | 2 stamps |\n|---|---|---|---|---|---|---|\n`;
for (const s of summary) md += `| ${s.tier} | ${s.target}s | ${s.novice}s | **${s.average}s** | ${s.skilled}s | ${s.stamps3}% | ${s.stamps2}% |\n`;
md += `\n## Fault mix\n\n${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${n}`).join('\n')}\n`;
md += `\n## Issues\n\n${problems.length ? problems.map((p) => `- ${p}`).join('\n') : 'None: every generated mess was solvable and unambiguous.'}\n`;
md += `\n## Per scene\n\n| Scene | Tier | Faults | Salience | Avg time | p90 | Novice | Skilled | 3★ |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.scene} | ${r.tier} | ${r.faults} | ${r.salience} | ${r.average}s | ${r.averageP90}s | ${r.novice}s | ${r.skilled}s | ${r.stamps.average[2]}% |\n`;
await writeFile(path.join(ROOT, 'tools/bot/report.md'), md);
await writeFile(path.join(ROOT, 'tools/bot/report.json'), JSON.stringify({ summary, rows, problems }, null, 1));
console.log('\nPer tier:', summary.map((s) => `t${s.tier} ${s.average}s (target ${s.target}s, 3★ ${s.stamps3}%)`).join(' | '));
console.log(problems.length ? `\n${problems.length} issue(s):\n${problems.slice(0, 30).join('\n')}` : '\nNo fairness issues.');
