// Scoring rules, shared by the live game and the headless simulator so that
// par times and stamp thresholds are computed with exactly the same maths.

export function comboMultiplier(scoring, chain) {
  return Math.min(scoring.comboMax, 1 + scoring.comboStep * Math.max(0, chain - 1));
}

export function fixPoints(scoring, faultType, subtlety, chain) {
  return Math.round(faultType.points * (1 + scoring.subtletyBonus * subtlety) * comboMultiplier(scoring, chain));
}

/** Callout text for a combo chain length, if this length earns one. */
export function calloutFor(scoring, chain) {
  let text = null;
  for (const [n, t] of scoring.callouts) if (chain === n) text = t;
  return text;
}

/** Final tally. `run` is what a session/simulation accumulated. */
export function finalScore(scoring, run, par) {
  const timeBonus = Math.max(0, Math.round((par - run.time) * scoring.timeBonusPerSec));
  const noHint = run.hintsUsed === 0 ? Math.round(run.fixPoints * scoring.noHintBonus) : 0;
  const cat = run.cat ? scoring.catBonus : 0;
  const collectible = run.collectible ? scoring.collectibleBonus : 0;
  const total = Math.max(0, run.fixPoints - run.penalties) + timeBonus + noHint + cat + collectible;
  return { fixPoints: run.fixPoints, penalties: run.penalties, timeBonus, noHint, cat, collectible, total };
}

/** Stamps (1–3). Cat and collectible bonuses don't count towards stamps so a
 *  lucky find can't substitute for tidy play. */
export function stampsFor(scoring, breakdown, ref) {
  const graded = breakdown.total - breakdown.cat - breakdown.collectible;
  let stamps = 1;
  if (graded >= scoring.stamps[1] * ref) stamps = 2;
  if (graded >= scoring.stamps[2] * ref) stamps = 3;
  return stamps;
}
