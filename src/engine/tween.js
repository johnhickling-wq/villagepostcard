// Easing curves and a tiny tween manager. Time is in seconds.

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inBack: (t, s = 1.70158) => t * t * ((s + 1) * t - s),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Damped spring from 1 to 0: how much of an initial offset remains at time t. */
export function springDecay(t, freq = 14, damping = 5.5) {
  return Math.exp(-damping * t) * Math.cos(freq * t);
}

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a, b, t) => a + (b - a) * t;

export class Tweens {
  constructor() { this.list = []; }
  /** {dur, delay?, ease?, update(k, t), done?} -> handle with .cancel() */
  add(spec) {
    const tw = { t: -(spec.delay || 0), dur: spec.dur || 0.001, ease: spec.ease || Ease.linear, update: spec.update, done: spec.done, dead: false };
    tw.cancel = () => { tw.dead = true; };
    this.list.push(tw);
    return tw;
  }
  wait(dur) { return new Promise((res) => this.add({ dur, update() {}, done: res })); }
  /** Promise-returning tween */
  to(spec) { return new Promise((res) => this.add({ ...spec, done: () => { spec.done?.(); res(); } })); }
  update(dt) {
    for (const tw of this.list) {
      if (tw.dead) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = clamp01(tw.t / tw.dur);
      tw.update?.(tw.ease(k), k);
      if (k >= 1) { tw.dead = true; tw.done?.(); }
    }
    this.list = this.list.filter((t) => !t.dead);
  }
  clear() { this.list = []; }
}
