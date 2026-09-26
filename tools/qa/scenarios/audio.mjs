// Fire every sound hook, the music and ambience; report any errors.
export default async function ({ page, wait, url, logs }) {
  await page.goto(url);
  await wait(2500);
  await page.mouse.click(195, 400);
  const res = await page.evaluate(async () => {
    const a = window.__app.audio;
    a.unlock();
    const names = ['ui.tap', 'ui.open', 'ui.close', 'ui.toggle', 'page', 'fix.pop', 'fix.pluck', 'fix.swing', 'fix.thunk', 'fix.paint', 'fix.squeak', 'fix.bloom', 'fix.lamp', 'fix.sweep', 'fix.flap',
      'combo', 'callout', 'miss', 'cat', 'shutter', 'flash', 'print', 'stamp', 'coin', 'tick', 'xp', 'levelup', 'rosette', 'unlock', 'restore', 'collect', 'whistle', 'bell', 'hint', 'nudge', 'complete', 'arrive', 'whoosh'];
    const errs = [];
    for (const n of names) { try { a.play(n, { step: 3, force: true }); } catch (e) { errs.push(n + ': ' + e.message); } await new Promise((r) => setTimeout(r, 30)); }
    a.startMusic('map'); await new Promise((r) => setTimeout(r, 1500));
    a.startMusic('play'); await new Promise((r) => setTimeout(r, 1000));
    a.jingle();
    a.startAmbience(['birds', 'river', 'breeze', 'ducks', 'bees', 'crickets', 'drips', 'bells', 'pub', 'mill']);
    await new Promise((r) => setTimeout(r, 2000));
    a.stopAmbience(); a.stopMusic();
    return { state: a.ctx.state, errs, time: a.ctx.currentTime };
  });
  console.log(JSON.stringify(res));
}
