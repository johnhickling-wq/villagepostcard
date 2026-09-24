// Mid-game save; screenshot album, scrapbook, noticeboard, travel, settings.
export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await page.evaluate(async () => {
    const app = window.__app, P = window.__progression;
    const s = app.save;
    s.flags.intro = true; s.flags.tutorial = true; s.flags.seen.mapIntro = true;
    s.player.pennies = 420; s.player.xp = 600; s.player.plays = 14;
    const vs = s.villages.honeycombe;
    for (const pid of ['open-high-street', 'halt-paint', 'halt-flowers', 'open-village-green']) vs.projects[pid] = 1;
    vs.scenes['railway-halt'].tier = 4; vs.scenes['high-street'].tier = 2;
    const E = (seed, tier, condition, stamps, projects = []) => ({ seed, tier, condition, stamps, score: 1200 + seed * 10, time: 52, date: '2026-09-20', projects });
    vs.scenes['railway-halt'].album = { clear: E(11, 1, 'clear', 3), golden: E(12, 2, 'golden', 2), mist: E(13, 3, 'mist', 2, ['halt-paint']), dusk: E(14, 4, 'dusk', 1, ['halt-paint', 'halt-flowers']) };
    vs.scenes['high-street'].album = { clear: E(21, 1, 'clear', 2, ['open-high-street']) };
    s.collect.owned = { cowslip: 1, 'dog-rose': 2, 'platform-ticket': 1, 'luggage-label': 1, 'porter-badge': 1, 'guard-whistle': 1, 'railway-lamp': 1, 'honey-jar': 1 };
    P.refillRequests(s, app.content, 'honeycombe');
    s.requests.active[0].progress = s.requests.active[0].count;
    s.requests.friendship = { colonel: 3, postmistress: 1 };
    s.daily.history = { '2026-09-22': { stamps: 2, score: 1500 }, '2026-09-23': { stamps: 3, score: 2100 } }; s.daily.streak = 2; s.daily.best = 2; s.daily.last = '2026-09-23';
    const { AlbumScreen } = await import('/src/ui/screens/album.js');
    await app.show(new AlbumScreen(app), { transition: 'none' });
  });
  await wait(4000);
  await shot('20-album');
  await page.evaluate(() => window.__app.screen.openPostcard('railway-halt', window.__app.vs.scenes['railway-halt'].album.dusk));
  await wait(3500);
  await shot('21-postcard-view');
  await page.evaluate(() => document.querySelector('.flipper').classList.add('flipped'));
  await wait(1000);
  await shot('22-postcard-back');
  await page.evaluate(() => document.querySelector('.overlay').click());
  await wait(500);
  await page.evaluate(() => window.__app.screen.switch('scrapbook'));
  await wait(800);
  await shot('23-scrapbook');
  await page.evaluate(async () => { const { NoticeboardScreen } = await import('/src/ui/screens/noticeboard.js'); await window.__app.show(new NoticeboardScreen(window.__app), { transition: 'none' }); });
  await wait(1200);
  await shot('24-noticeboard');
  await page.evaluate(async () => { const { TravelScreen } = await import('/src/ui/screens/travel.js'); await window.__app.show(new TravelScreen(window.__app), { transition: 'none' }); });
  await wait(1500);
  await shot('25-travel');
  await page.evaluate(() => document.querySelectorAll('.posters .ticket-btn')[0].click());
  await wait(900);
  await shot('26-purchase');
}
