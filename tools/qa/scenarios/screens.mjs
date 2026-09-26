// Mid-story save: journal (and a postcard, front and back), weather postcards,
// scrapbook, letters, the noticeboard with a committee request, the travel office.
import { seedStory } from './lib.mjs';

export default async function ({ page, shot, wait, url }) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await wait(2500);
  await seedStory(page, 7, { plays: 12 });
  await page.evaluate(() => {
    const app = window.__app, P = window.__progression, s = app.save;
    s.collect.owned = { cowslip: 1, 'dog-rose': 2, 'platform-ticket': 1, 'luggage-label': 1, 'porter-badge': 1, 'guard-whistle': 1, 'railway-lamp': 1, 'honey-jar': 1 };
    s.villages.honeycombe.scenes['railway-halt'].album = { golden: { seed: 12, tier: 2, condition: 'golden', stamps: 2, score: 1700, time: 60, date: '2026-09-02', projects: [], cat: true } };
    P.refillRequests(s, app.content, 'honeycombe');
    s.requests.active[0].progress = s.requests.active[0].count;
    s.requests.friendship = { colonel: 3, postmistress: 2 }; s.requests.letters = { 'colonel:1': true, 'postmistress:1': true };
  });
  await page.evaluate(async () => { const { AlbumScreen } = await import('/src/ui/screens/album.js'); await window.__app.show(new AlbumScreen(window.__app), { transition: 'none' }); });
  await wait(4000);
  await shot('20-journal');
  await page.evaluate(() => window.__app.screen.openPostcard('high-street', window.__app.vs.journal['hs-refresh'], { title: 'Brighten the High Street', improved: 'Post Office red on the kiosk and pillar box' }));
  await wait(3500);
  await page.evaluate(() => { const b = document.querySelector('.ba-before'); if (b) b.style.clipPath = 'inset(0 50% 0 0)'; const hnd = document.querySelector('.ba-handle'); if (hnd) hnd.style.left = '50%'; });
  await wait(300);
  await shot('21-postcard-view');
  await page.evaluate(() => document.querySelector('.flipper').classList.add('flipped'));
  await wait(1000);
  await shot('22-postcard-back');
  await page.evaluate(() => document.querySelector('.overlay').click());
  await wait(500);
  for (const [t, n] of [['weather', '23-weather'], ['scrapbook', '24-scrapbook'], ['letters', '25-letters']]) {
    await page.evaluate((t) => window.__app.screen.switch(t), t);
    await wait(1500);
    await shot(n);
  }
  await page.evaluate(async () => { const { NoticeboardScreen } = await import('/src/ui/screens/noticeboard.js'); await window.__app.show(new NoticeboardScreen(window.__app), { transition: 'none' }); });
  await wait(2000);
  await shot('26-noticeboard');
  await page.evaluate(async () => { const { TravelScreen } = await import('/src/ui/screens/travel.js'); await window.__app.show(new TravelScreen(window.__app), { transition: 'none' }); });
  await wait(1500);
  await shot('27-travel');
}
