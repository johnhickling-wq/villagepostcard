// Start again, through the real interface and the browser's lifecycle:
//  1. Cancel keeps the village;
//  2. Start again with a debounced write still pending and a pagehide /
//     visibilitychange during the reload lands on a fresh opening, and stays
//     fresh after another reload;
//  3. Settings is reachable (and resets) from the map, journal, noticeboard
//     and travel office.
import { seedStory, tapAll } from './lib.mjs';

const state = (page) => page.evaluate(() => {
  const a = window.__app, vs = a.save.villages.honeycombe;
  return {
    screen: a.screen?.constructor.name,
    intro: a.save.flags.intro, visits: Object.keys(vs.visits).length, journal: Object.keys(vs.journal).length,
    effects: Object.keys(vs.effects).length, active: a.save.active, xp: a.save.player.xp,
    stored: (() => { try { const s = JSON.parse(localStorage.getItem('postcard-perfect/save')); return s ? Object.keys(s.villages.honeycombe.visits).length : null; } catch { return 'bad'; } })(),
    title: document.querySelector('.title-tap')?.textContent || null,
  };
});

let failures = 0;
const check = (ok, msg) => { console.log(ok ? 'OK  ' : 'FAIL', msg); if (!ok) failures++; };

async function openSettingsFrom(page, where, wait) {
  if (where !== 'map') {
    await page.evaluate(async (w) => {
      const a = window.__app;
      if (w === 'album') { const { AlbumScreen } = await import('/src/ui/screens/album.js'); await a.show(new AlbumScreen(a), { instant: true }); }
      if (w === 'noticeboard') { const { NoticeboardScreen } = await import('/src/ui/screens/noticeboard.js'); await a.show(new NoticeboardScreen(a), { instant: true }); }
      if (w === 'travel') { const { TravelScreen } = await import('/src/ui/screens/travel.js'); await a.show(new TravelScreen(a), { instant: true }); }
    }, where);
    await wait(700);
  }
  await page.locator('.screen:last-child .topbar [aria-label="Settings"]').click();
  await wait(600);
}

async function startAgain(page, wait, { pending = false, lifecycle = false } = {}) {
  await page.locator('.settings [data-act="start-again"]').click();
  await wait(500);
  if (pending) {
    // a debounced write of the old village is in flight when the player says yes
    await page.evaluate(() => { const a = window.__app; a.save.player.xp += 1; a.persist(); });
  }
  if (lifecycle) {
    // the old run tries to save itself as the page goes away
    await page.evaluate(() => {
      window.addEventListener('beforeunload', () => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
        window.__app.persist(true);
      });
    });
  }
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.locator('.modal [data-act="confirm-reset"]').click()]);
  await wait(2600);
}

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);

  // --- Cancel keeps everything -------------------------------------------
  await seedStory(page, 9);
  const seeded = await state(page);
  console.log('seeded', JSON.stringify(seeded));
  await openSettingsFrom(page, 'map', wait);
  await shot('reset1-settings');
  await page.locator('.settings [data-act="start-again"]').click();
  await wait(500);
  await shot('reset2-confirm');
  await page.locator('.modal [data-act="cancel-reset"]').click();
  await wait(600);
  let s = await state(page);
  check(s.visits === 9 && s.stored === 9, `Cancel keeps the village (${s.visits} visits, ${s.stored} stored)`);

  // --- Start again with a pending write and lifecycle saves ---------------
  await startAgain(page, wait, { pending: true, lifecycle: true });
  s = await state(page);
  console.log('after reset', JSON.stringify(s));
  await shot('reset3-title-after');
  check(s.title === 'Tap to begin', `title offers a fresh start (“${s.title}”)`);
  check(s.visits === 0 && s.journal === 0 && s.effects === 0 && !s.active && s.xp === 0 && !s.intro, 'no old postcards, restoration, active visit or intro flag');
  check(s.stored === 0 || s.stored === null, `nothing old was written back (${s.stored})`);
  await page.reload();
  await wait(2600);
  s = await state(page);
  check(s.visits === 0 && s.title === 'Tap to begin', 'still fresh after another reload');
  // the fresh opening and the first tutorial
  await page.mouse.click(420, 200);
  await wait(1200);
  await shot('reset4-opening');
  check(await page.locator('.opening').count() === 1, 'the opening card appears');
  await page.locator('.opening .btn').click();
  await wait(3000);
  s = await state(page);
  check(s.screen === 'PlayScreen', `the first visit starts (${s.screen})`);
  await shot('reset5-first-visit');

  // --- mid-visit reset: an active visit is discarded too ---------------------
  // (Settings isn't in the play screen; leave the visit half-done and reset from the map.)
  await page.locator('.brief .btn').click({ force: true }).catch(() => {});
  await wait(600);
  await page.evaluate(() => window.__flows.goMap(window.__app, { transition: 'none' }));
  await wait(1000);

  // --- every place Settings is reachable ------------------------------------
  for (const where of ['map', 'album', 'noticeboard', 'travel']) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await wait(2500);
    await seedStory(page, 4);
    // leave an unfinished visit behind, as if the player had walked away mid-visit
    await page.evaluate(() => {
      const a = window.__app, P = window.__progression;
      const next = P.nextVisit(a.save, a.content, 'honeycombe');
      const plan = P.planVisit(a.save, a.content, 'honeycombe', next.id);
      const p = P.beginPlay(a.save, plan); p.done = ['litter#0']; a.persist(true);
    });
    await openSettingsFrom(page, where, wait);
    if (where === 'travel') await shot('reset6-settings-travel');
    await startAgain(page, wait, { pending: where === 'album', lifecycle: where !== 'map' });
    s = await state(page);
    check(s.visits === 0 && !s.active && s.title === 'Tap to begin', `Start again from the ${where}: fresh (${JSON.stringify(s)})`);
  }
  console.log(failures ? `RESET: ${failures} FAILURE(S)` : 'RESET: ALL OK');
}
