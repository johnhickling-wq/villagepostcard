// Difficulty tuner. For each tier (in order) it nudges the fault count and
// subtlety range until the simulated "average" player's median time lands
// within 6% of the tier's target, while keeping difficulty monotonic: every
// tier has at least as many faults and subtler faults than the one before.
// Then it sets the stamp thresholds from the simulated score distribution
// (3 stamps ~ top 30% of average players, 2 stamps ~ top 75%).
// Writes content/common/tiers.json and content/common/scoring.json.
//   node tools/bot/tune.mjs [--seeds 20] [--dry]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import { generateMess } from '../../src/core/mess.js';
import { simulatePlay, SKILLS } from '../../src/core/sim.js';
import { Rng } from '../../src/core/rng.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : null)).filter(Boolean));
const SEEDS = +(args.seeds || 20);
const TARGET = { 1: 40, 2: 55, 3: 70, 4: 85, 5: 100, 6: 90 };
const tiersPath = path.join(ROOT, 'content/common/tiers.json');
const scoringPath = path.join(ROOT, 'content/common/scoring.json');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const r2 = (x) => Math.round(x * 100) / 100;

async function measure(content, tierN) {
  const times = [], ratios = [];
  for (const [vid, v] of Object.entries(content.villages)) {
    for (const sid of v.sceneOrder) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const mess = generateMess(content, { village: vid, scene: sid, tier: tierN, seed: seed * 31, projectsDone: seed % 2 ? [] : v.projects.map((p) => p.id) });
        const r = simulatePlay(content, mess, SKILLS.average, new Rng(seed * 13 + tierN), { par: mess.par });
        times.push(r.time);
        ratios.push((r.breakdown.total - r.breakdown.cat - r.breakdown.collectible) / mess.ref);
      }
    }
  }
  return { time: median(times), ratios };
}

const tiers = JSON.parse(await readFile(tiersPath, 'utf8'));
const content = await loadFromDisk();
const allRatios = [];
let prev = null;
for (const tier of tiers) {
  const t = content.tier(tier.tier);
  const minLow = prev && !tier.free ? prev.subtlety[0] + 0.05 : 0;
  const minFaults = prev && !tier.free ? prev.faults[1] : 1;
  let m;
  for (let it = 0; it < 10; it++) {
    m = await measure(content, tier.tier);
    const err = m.time / TARGET[tier.tier] - 1;
    process.stdout.write(`tier ${tier.tier} it${it}: faults [${t.faults}] subtlety [${t.subtlety.map(r2)}] -> ${Math.round(m.time)}s (target ${TARGET[tier.tier]}s)\n`);
    if (Math.abs(err) < 0.06) break;
    if (err > 0) {
      // too slow: make it gentler, subtlety first, then fewer faults
      if (t.subtlety[0] - 0.04 >= minLow) t.subtlety = [r2(t.subtlety[0] - 0.04), r2(t.subtlety[1] - 0.04)];
      else if (t.faults[0] > minFaults) t.faults = [t.faults[0] - 1, t.faults[1] - 1];
      else break;
    } else {
      if (t.subtlety[1] + 0.04 <= 0.95) t.subtlety = [r2(t.subtlety[0] + 0.04), r2(t.subtlety[1] + 0.04)];
      else t.faults = [t.faults[0] + 1, t.faults[1] + 1];
    }
  }
  tier.subtlety = t.subtlety;
  tier.faults = t.faults;
  allRatios.push(...m.ratios);
  if (!tier.free) prev = tier;
}
const scoring = JSON.parse(await readFile(scoringPath, 'utf8'));
scoring.stamps = [0, +quantile(allRatios, 0.25).toFixed(3), +quantile(allRatios, 0.7).toFixed(3)];
console.log('\n' + tiers.map((t) => `t${t.tier} faults [${t.faults}] subtlety [${t.subtlety}]`).join('\n'));
console.log('stamp thresholds (x ref):', scoring.stamps);
if (!args.dry) {
  await writeFile(tiersPath, JSON.stringify(tiers, null, 1) + '\n');
  await writeFile(scoringPath, JSON.stringify(scoring, null, 1) + '\n');
  console.log('written.');
}
