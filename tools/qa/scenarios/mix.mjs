// Sound levels: renders every sound offline through the game's own engine and
// prints its loudness against a target, with the MIX gain that would hit it.
//   node tools/qa/shots.mjs mix
// Targets are the loudest 100 ms RMS in dBFS (peak for clicks). Edit MIX in
// src/engine/audio.js by the suggested factor after changing a sound.
const T = {
  'fix.pop': -27, 'fix.pluck': -27, 'fix.swing': -27, 'fix.thunk': -27, 'fix.paint': -27, 'fix.squeak': -27, 'fix.bloom': -27, 'fix.lamp': -27, 'fix.sweep': -27, 'fix.flap': -27,
  combo: -28, callout: -26, miss: -38, cat: -28, shutter: -28, flash: -28, print: -34, stamp: -28, coin: -32,
  levelup: -25, rosette: -27, unlock: -27, restore: -26, collect: -27, whistle: -32, hint: -31, nudge: -42,
  'ui.tap': -34, 'ui.open': -40, 'ui.close': -42, page: -38, complete: -24, arrive: -33, whoosh: -40,
};
const PEAK = { tick: -30 };

export default async function ({ page, wait, url }) {
  await page.goto(url);
  await wait(3000);
  const res = await page.evaluate(async (names) => {
    const E = window.__app.audio.constructor;
    const RealAC = window.AudioContext;
    const out = {};
    const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
    for (const name of names) {
      window.AudioContext = function () { return new OfflineAudioContext(2, 44100 * 3, 44100); };
      const e = new E(); e.unlock(); window.AudioContext = RealAC;
      e.play(name, { step: 3, force: true, vary: 0 });
      const d = (await e.ctx.startRendering()).getChannelData(0);
      let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
      const win = 4410; let best = 0;
      for (let s = 0; s + win < d.length; s += 1100) { let acc = 0; for (let i = s; i < s + win; i++) acc += d[i] * d[i]; best = Math.max(best, Math.sqrt(acc / win)); }
      out[name] = { rms: +db(best).toFixed(1), peak: +db(peak).toFixed(1) };
    }
    return out;
  }, [...Object.keys(T), ...Object.keys(PEAK)]);
  for (const [n, m] of Object.entries(res)) {
    const off = T[n] != null ? m.rms - T[n] : m.peak - PEAK[n];
    const flag = Math.abs(off) > 2 ? `  <- ${off > 0 ? 'loud' : 'quiet'} by ${Math.abs(off).toFixed(1)} dB (MIX x${Math.pow(10, -off / 20).toFixed(2)})` : '';
    console.log(`${n.padEnd(11)} rms ${String(m.rms).padStart(6)}  peak ${String(m.peak).padStart(6)}${flag}`);
  }
}
