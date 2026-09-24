// A simple model of a human player, used to (a) compute par time and the
// reference score for every generated mess, and (b) drive the headless bot.
//
// Each fault gets a "notice time" drawn from an exponential distribution whose
// rate is proportional to its salience: obvious faults are spotted quickly,
// subtle ones slowly. The player then taps in notice order, limited by a
// reaction time, occasionally mis-taps, and reaches for the loupe when stuck.

import { Rng } from './rng.js';
import { fixPoints, finalScore } from './scoring.js';

export const SKILLS = {
  // k: noticing rate per unit salience per second
  novice:  { k: 0.050, react: 0.75, missRate: 0.10, loupeAfter: 9 },
  average: { k: 0.075, react: 0.60, missRate: 0.06, loupeAfter: 12 },
  skilled: { k: 0.105, react: 0.48, missRate: 0.03, loupeAfter: 16 },
};

/**
 * Simulate one play of a generated mess.
 * @returns {{time, score, breakdown, taps, misses, hints, maxChain}}
 */
export function simulatePlay(content, mess, skill, rng, opts = {}) {
  const scoring = content.scoring;
  const tier = content.tier(mess.tier);
  const loupeCooldown = opts.loupeCooldown ?? tier.loupe;
  const faults = mess.faults.map((f) => ({
    f,
    notice: -Math.log(1 - rng.next()) / Math.max(0.01, skill.k * f.salience),
  }));
  faults.sort((a, b) => a.notice - b.notice);

  let t = 0, lastFix = -Infinity, chain = 0, fixPts = 0, penalties = 0;
  let misses = 0, hints = 0, maxChain = 0, loupeReadyAt = loupeCooldown;
  const remaining = faults.slice();
  while (remaining.length) {
    let next = remaining[0];
    let tapAt = Math.max(next.notice, t + skill.react);
    // stuck? use the loupe (it points straight at a fault)
    if (tapAt - t > skill.loupeAfter && Math.max(loupeReadyAt, t + skill.loupeAfter) < tapAt) {
      const useAt = Math.max(loupeReadyAt, t + skill.loupeAfter);
      hints++;
      loupeReadyAt = useAt + loupeCooldown;
      tapAt = useAt + 1.1;
      next = remaining.reduce((a, b) => (a.f.salience < b.f.salience ? a : b));
    }
    // small or subtle targets are mis-tapped more often
    const smallness = Math.max(0, 1 - next.f.size / 90);
    if (rng.next() < skill.missRate * (1 + smallness * 2)) {
      misses++;
      penalties += scoring.missPenalty;
      chain = 0;
      tapAt += 0.4;
    }
    const window = tier.combo;
    chain = tapAt - lastFix <= window ? chain + 1 : 1;
    maxChain = Math.max(maxChain, chain);
    fixPts += fixPoints(scoring, content.faults[next.f.type], next.f.subtlety, chain);
    lastFix = tapAt;
    t = tapAt;
    remaining.splice(remaining.indexOf(next), 1);
  }
  const time = t + 0.3;
  const run = { time, fixPoints: fixPts, penalties, hintsUsed: hints, cat: false, collectible: false };
  const breakdown = finalScore(scoring, run, opts.par ?? mess.par ?? time);
  return { time, score: breakdown.total, breakdown, misses, hints, maxChain };
}

/** Par time and reference score for a mess, from repeated skilled simulations. */
export function calibrate(content, mess, seed, runs = 31) {
  const rng = new Rng(seed);
  const times = [], scores = [];
  for (let i = 0; i < runs; i++) times.push(simulatePlay(content, mess, SKILLS.skilled, rng.fork('t' + i)).time);
  times.sort((a, b) => a - b);
  const par = Math.round(times[Math.floor(runs / 2)] * 1.1);
  for (let i = 0; i < runs; i++) scores.push(simulatePlay(content, mess, SKILLS.skilled, rng.fork('s' + i), { par }).breakdown.total);
  scores.sort((a, b) => a - b);
  const ref = scores[Math.floor(runs * 0.5)];
  return { par, ref };
}
