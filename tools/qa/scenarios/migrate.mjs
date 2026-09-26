// A save from version 2 (the Village Fund era), part-restored with album
// postcards, loads into the new game: places stay open, bought work stays done,
// the album is intact, and the old save is kept as a backup.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await wait(1500);
  await page.evaluate(() => {
    const scenes = {};
    for (const sid of ['railway-halt', 'high-street', 'village-green', 'weavers-row', 'old-mill', 'bee-and-bramble', 'st-aldhelms', 'rose-cottage']) scenes[sid] = { tier: 0, plays: 0, best: 0, bestStamps: 0, album: {} };
    Object.assign(scenes['railway-halt'], { tier: 3, plays: 5, album: {
      clear: { seed: 11, tier: 1, condition: 'clear', stamps: 3, score: 1500, time: 40, date: '2026-09-01', projects: [], script: ['litter', 'crooked', 'litter', 'crooked', 'litter'], types: ['litter', 'crooked'], cat: false },
      golden: { seed: 12, tier: 2, condition: 'golden', stamps: 2, score: 1700, time: 60, date: '2026-09-02', projects: ['open-high-street'], script: null, types: null, cat: true },
      mist: { seed: 13, tier: 3, condition: 'mist', stamps: 2, score: 1800, time: 70, date: '2026-09-03', projects: ['open-high-street', 'halt-paint'], script: null, types: null, cat: true } } });
    Object.assign(scenes['high-street'], { tier: 1, plays: 2, album: { clear: { seed: 21, tier: 1, condition: 'clear', stamps: 2, score: 1400, time: 45, date: '2026-09-04', projects: ['open-high-street', 'halt-paint'], script: null, types: null, cat: true } } });
    const v2 = { v: 2, created: 1690000000000, settings: { sfx: true, music: true, haptics: true, reducedMotion: false },
      player: { xp: 700, fund: 260, flashbulbs: 2, secondClass: 1, plays: 9 },
      cosmetics: { owned: ['frame-classic', 'film-natural', 'postmark-wold', 'film-sepia'], equipped: { frames: 'frame-classic', films: 'film-natural', postmarks: 'postmark-wold' } },
      stats: { fixes: { litter: 30 }, cats: 3, bestCombo: 5, hints: 2, collectibles: 2, perfect: 1, score: 14000 },
      flags: { intro: true, tutorial: true, seen: { 'job:litter': true, 'job:crooked': true, 'job:faded': true, 'job:grimy': true, mapIntro: true } },
      current: 'honeycombe', villages: { honeycombe: { scenes, projects: { 'open-high-street': 1, 'halt-paint': 1, 'open-village-green': 1 }, judged: false, letters: {} } },
      requests: { active: [], seq: 0, friendship: {}, done: 0, letters: {} }, collect: { owned: { cowslip: 1, 'platform-ticket': 1 }, sets: {}, pity: 0 },
      daily: { last: null, streak: 0, best: 0, history: {} }, purchases: {} };
    window.__app.holdSaves = true; // don't let the running game save over it on reload
    localStorage.setItem('postcard-perfect/save', JSON.stringify(v2));
  });
  await page.reload();
  await wait(3000);
  const st = await page.evaluate(() => {
    const s = window.__app.save, P = window.__progression, c = window.__app.content;
    return { v: s.v, legacyFund: s.legacy?.fund, backup: !!localStorage.getItem('postcard-perfect/save/backup'), visits: Object.keys(s.villages.honeycombe.visits), effects: Object.keys(s.villages.honeycombe.effects),
      open: P.openScenes(s, c, 'honeycombe'), next: P.nextStep(s, c, 'honeycombe').label, album: Object.keys(s.villages.honeycombe.scenes['railway-halt'].album) };
  });
  console.log(JSON.stringify(st, null, 1));
  await page.mouse.click(420, 200);
  await wait(2800);
  await shot('m1-map');
  const c = page.locator('.intro-card .btn'); if (await c.count()) { await c.click({ force: true }); await wait(500); }
  await shot('m1b-map');
  await page.evaluate(async () => { const { AlbumScreen } = await import('/src/ui/screens/album.js'); await window.__app.show(new AlbumScreen(window.__app, 'weather'), { transition: 'none' }); });
  await wait(3500);
  await shot('m2-old-album');
}
