// Deterministic random numbers. Every generated mess, daily postcard and
// request is reproducible from a seed, so saves store seeds instead of images.

/** 32-bit FNV-1a hash of a string (or anything stringifiable). */
export function hash(str) {
  str = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix several values into one 32-bit seed. */
export function seedOf(...parts) {
  return hash(parts.join('|'));
}

/** Small, fast, well-distributed PRNG (mulberry32) with helpers. */
export class Rng {
  constructor(seed = 1) {
    this.s = (typeof seed === 'number' ? seed : hash(seed)) >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Pick a key from {key: weight}. Zero/negative weights are skipped. */
  weighted(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    let total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      if ((r -= w) <= 0) return k;
    }
    return entries.length ? entries[entries.length - 1][0] : undefined;
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** A child generator, so adding a new random call in one system never
   *  shifts the sequence of another. */
  fork(label) { return new Rng(seedOf(this.s, label)); }
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Interpolate [easy, hard] ranges (or plain numbers) by subtlety 0..1. */
export const bySubtlety = (range, s) => (Array.isArray(range) ? lerp(range[0], range[1], s) : range);
