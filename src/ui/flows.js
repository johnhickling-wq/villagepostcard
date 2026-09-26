// Game flows that cross screens: starting the game, playing a scene,
// finishing a play, restoring a project, the finale.

import { planPlay, applyResult, buyProject, dailyInfo, completeJudging } from '../core/progression.js';
import { generateMess } from '../core/mess.js';
import { showLetter } from './components/letter.js';

export async function startGame(app) {
  const s = app.save;
  const v = app.v;
  if (!s.flags.intro) {
    await showLetter(app, { from: 'editor', ...v.letters.intro, button: 'Off to Honeycombe!' });
    app.sfx('whistle');
    await showLetter(app, { from: 'colonel', ...v.letters.welcome, button: 'Right-ho!', reward: '40 in the Village Fund from the Committee, to get you started' });
    s.flags.intro = true;
    app.persist(true);
  }
  if (!s.flags.tutorial) return playScene(app, v.start, { tutorial: true });
  return goMap(app);
}

export async function goMap(app, opts = {}) {
  const { MapScreen } = await import('./screens/map.js');
  app.audio.startMusic('map');
  return app.show(new MapScreen(app, opts), { transition: opts.transition || 'fade' });
}

export async function playScene(app, sceneId, opts = {}) {
  const { PlayScreen } = await import('./screens/play.js');
  const play = planPlay(app.save, app.content, app.village, sceneId, opts);
  const mess = generateMess(app.content, {
    village: play.village, scene: play.scene, tier: play.tier, condition: play.condition, seed: play.seed,
    projectsDone: play.projects, collectible: play.collectible, script: play.script, types: play.types, cat: play.cat,
  });
  await app.assets.image(app.content.scene(play.village, play.scene).plate, play.village);
  return app.show(new PlayScreen(app, play, mess), { transition: 'iris' });
}

export async function playDaily(app) {
  const d = dailyInfo(app.save, app.content, app.village);
  return playScene(app, d.scene, { daily: d.date, tier: d.tier, condition: d.condition, seed: d.seed });
}

export async function finishPlay(app, play, mess, result, stills) {
  const out = applyResult(app.save, app.content, play, result);
  app.persist(true);
  const { ResultsScreen } = await import('./screens/results.js');
  return app.show(new ResultsScreen(app, { play, mess, result, out, stills }), { transition: 'none', instant: false });
}

export async function leavePlay(app) {
  return goMap(app, { transition: 'iris' });
}

/** Buy a project, then stage its restoration inside the scene. */
export async function restoreProject(app, projectId) {
  const events = buyProject(app.save, app.content, app.village, projectId);
  if (!events) return null;
  app.persist(true);
  const { RestoreScreen } = await import('./screens/restore.js');
  await app.show(new RestoreScreen(app, projectId, events), { transition: 'iris' });
  return events;
}

export async function judging(app) {
  const { JudgingScreen } = await import('./screens/judging.js');
  const out = completeJudging(app.save, app.content, app.village);
  app.persist(true);
  return app.show(new JudgingScreen(app, out), { transition: 'iris' });
}
