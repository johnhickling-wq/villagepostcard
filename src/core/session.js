// A single play of a scene: hit-testing taps against the generated faults,
// combos, hints and the final tally. DOM-free so the bot can drive exactly
// the same rules the player experiences.
//
// Exploring is never a failure. A story visit has no penalties at all; a
// photo walk's score loses a little for a mis-tap, but never for tapping
// something already fixed, and nothing ever locks the player out.

import { distToShape, shapeBounds } from './geometry.js';
import { fixPoints, calloutFor, finalScore, stampsFor, comboMultiplier } from './scoring.js';

export class PlaySession {
  constructor(content, mess, play, opts = {}) {
    this.content = content;
    this.mess = mess;
    this.play = play;
    this.scoring = content.scoring;
    this.tier = content.tier(play.tier);
    this.t = 0;
    this.remaining = new Set(mess.faults.map((f) => f.id));
    this.fixed = [];
    this.fixPoints = 0;
    this.penalties = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.lastFix = -Infinity;
    this.lastProgress = 0;
    this.misses = 0;
    this.hints = 0;
    this.flashes = 0;
    this.story = play.mode === 'visit';
    this.minTarget = 0; // scene units: small things are tappable over at least this size (set from the view)
    this.flashbulbs = opts.flashbulbs ?? 0;
    this.loupeCooldown = play.loupe ?? this.tier.loupe;
    this.loupeReadyAt = this.story ? 0 : Math.min(8, this.loupeCooldown);
    this.nudgeEvery = play.nudge ?? this.tier.nudge;
    this.nextNudge = this.nudgeEvery || Infinity;
    this.catFound = false;
    this.collectibleFound = false;
    this.fixes = {};
    this.done = false;
    this.byId = new Map(mess.faults.map((f) => [f.id, f]));
    // carrying on after a reload: what was already done stays done
    const r = opts.resume;
    if (r) {
      for (const id of r.done || []) {
        const f = this.byId.get(id);
        if (!f || !this.remaining.has(id)) continue;
        this.remaining.delete(id);
        this.fixed.push(id);
        this.fixes[f.type] = (this.fixes[f.type] || 0) + 1;
        this.fixPoints += fixPoints(this.scoring, this.content.faults[f.type], f.subtlety, 1);
      }
      this.catFound = !!r.cat && !!mess.cat;
      this.collectibleFound = !!r.collectible && !!mess.collectible;
      this.hints = r.hints || 0;
      this.t = r.t || 0;
      this.lastProgress = this.t;
    }
  }

  /** Seconds since the last thing was fixed (for offering a hint). */
  get stall() { return this.t - this.lastProgress; }

  get total() { return this.mess.faults.length; }
  get left() { return this.remaining.size; }
  get comboWindow() { return this.tier.combo; }
  get multiplier() { return comboMultiplier(this.scoring, this.chain); }
  get loupeReady() { return this.t >= this.loupeReadyAt; }
  get loupeProgress() { return Math.min(1, 1 - (this.loupeReadyAt - this.t) / this.loupeCooldown); }
  get score() { return Math.max(0, this.fixPoints - this.penalties); }

  remainingByType() {
    const m = {};
    for (const f of this.mess.faults) {
      m[f.type] ||= { total: 0, left: 0 };
      m[f.type].total++;
      if (this.remaining.has(f.id)) m[f.type].left++;
    }
    return m;
  }

  update(dt) {
    if (this.done) return [];
    this.t += dt;
    const events = [];
    if (this.t >= this.nextNudge && this.left) {
      const f = this._hardestRemaining(false);
      if (f) events.push({ kind: 'nudge', fault: f });
      this.nextNudge = this.t + this.nudgeEvery;
    }
    if (this.chain > 0 && this.t - this.lastFix > this.comboWindow) {
      events.push({ kind: 'comboEnd', chain: this.chain });
      this.chain = 0;
    }
    return events;
  }

  /** @param tol hit tolerance in scene units */
  tap(x, y, tol = 20) {
    if (this.done) return { kind: 'done' };
    const hit = this._hitTest(x, y, tol);
    if (hit) this.lastMiss = null;
    if (hit?.kind === 'fault') return this._fix(hit.target, x, y);
    if (hit?.kind === 'cat') {
      this.catFound = true;
      return { kind: 'cat', cat: this.mess.cat, points: this.scoring.catBonus };
    }
    if (hit?.kind === 'collectible') {
      this.collectibleFound = true;
      return { kind: 'collectible', collectible: this.mess.collectible, points: this.scoring.collectibleBonus };
    }
    return this._miss(x, y);
  }

  _hitTest(x, y, tol) {
    let best = null;
    const consider = (kind, target, shape, z) => {
      const d = distToShape(x, y, shape);
      const b = shapeBounds(shape);
      // a small thing is tappable over at least minTarget; the nearest thing
      // still wins, so this never steals a tap that lands on something else
      const reach = Math.max(tol, (this.minTarget - Math.min(b.w, b.h)) / 2);
      if (d > reach) return;
      const key = d * 1000 + Math.sqrt(b.w * b.h) - (z || 0) * 1e-6;
      if (!best || key < best.key) best = { kind, target, key };
    };
    for (const id of this.remaining) {
      const f = this.byId.get(id);
      consider('fault', f, f.shape, f.z);
    }
    if (this.mess.cat && !this.catFound) consider('cat', this.mess.cat, this.mess.cat.shape, 0);
    if (this.mess.collectible && !this.collectibleFound) consider('collectible', this.mess.collectible, this.mess.collectible.shape, 0);
    return best;
  }

  _fix(f, x, y) {
    this.remaining.delete(f.id);
    this.fixed.push(f.id);
    this.fixes[f.type] = (this.fixes[f.type] || 0) + 1;
    const inWindow = this.t - this.lastFix <= this.comboWindow;
    this.chain = inWindow ? this.chain + 1 : 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.lastFix = this.t;
    this.lastProgress = this.t;
    this.nextNudge = this.nudgeEvery ? this.t + this.nudgeEvery : Infinity;
    const points = fixPoints(this.scoring, this.content.faults[f.type], f.subtlety, this.chain);
    this.fixPoints += points;
    const ev = {
      kind: 'fix', fault: f, points, chain: this.chain, multiplier: this.multiplier,
      callout: calloutFor(this.scoring, this.chain), left: this.left, x, y,
      typeLeft: this.remainingByType()[f.type].left,
    };
    if (!this.left) {
      this.done = true;
      ev.complete = this.results();
    }
    return ev;
  }

  _miss(x, y) {
    // tapping something already put right is never a mistake
    const tol = Math.max(this.minTarget / 2, 12);
    const again = this.fixed.map((id) => this.byId.get(id)).find((f) => distToShape(x, y, f.shape) <= tol);
    if (again) return { kind: 'already', fault: again, x, y };
    this.misses++;
    const brokeChain = this.chain;
    if (!this.story) {
      this.penalties += this.scoring.missPenalty;
      this.chain = 0;
    }
    this.lastMiss = { chain: brokeChain, penalty: !this.story };
    return { kind: 'miss', x, y, brokeChain: this.story ? 0 : brokeChain, gentle: this.story };
  }

  /** What a tap here would hit, without counting the tap. */
  peek(x, y, tol = 20) { return this.done ? null : this._hitTest(x, y, tol); }

  /** Take back the last mis-tap (it turned out to be the first half of a double-tap zoom). */
  forgiveLastMiss() {
    if (!this.lastMiss) return false;
    this.misses--;
    if (this.lastMiss.penalty) this.penalties -= this.scoring.missPenalty;
    this.chain = this.lastMiss.chain;
    this.lastMiss = null;
    return true;
  }

  /** A snapshot of progress for the save (a checkpoint after every fix). */
  progress() {
    return { done: [...this.fixed], cat: this.catFound, collectible: this.collectibleFound, hints: this.hints, t: Math.round(this.t * 10) / 10 };
  }

  _hardestRemaining(hardest = true) {
    let pick = null;
    for (const id of this.remaining) {
      const f = this.byId.get(id);
      if (!pick || (hardest ? f.salience < pick.salience : f.salience > pick.salience)) pick = f;
    }
    return pick;
  }

  /** Point at the hardest thing left, or the hardest of one type (tapping an action in the bar). */
  useLoupe(type = null) {
    if (!this.loupeReady || !this.left || this.done) return null;
    let fault = this._hardestRemaining(true);
    if (type) {
      const ofType = [...this.remaining].map((id) => this.byId.get(id)).filter((f) => f.type === type);
      if (!ofType.length) return null;
      fault = ofType.reduce((a, b) => (b.salience < a.salience ? b : a));
    }
    this.hints++;
    this.loupeReadyAt = this.t + this.loupeCooldown;
    return { kind: 'loupe', fault };
  }

  useFlash() {
    if (this.flashbulbs <= 0 || !this.left || this.done) return null;
    this.flashbulbs--;
    this.flashes++;
    return { kind: 'flash', faults: [...this.remaining].map((id) => this.byId.get(id)), duration: 2.5 };
  }

  results() {
    const run = {
      time: this.t, fixPoints: this.fixPoints, penalties: this.penalties,
      hintsUsed: this.hints + this.flashes, cat: this.catFound, collectible: this.collectibleFound,
    };
    const breakdown = finalScore(this.scoring, run, this.mess.par);
    return {
      score: breakdown.total, breakdown, stamps: stampsFor(this.scoring, breakdown, this.mess.ref),
      time: this.t, fixes: { ...this.fixes }, cat: this.catFound, collectible: this.collectibleFound,
      maxCombo: this.maxChain, hints: this.hints, flashes: this.flashes, misses: this.misses,
      faultCount: this.total, par: this.mess.par, ref: this.mess.ref,
    };
  }
}
