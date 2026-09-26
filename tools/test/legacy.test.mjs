// Album postcards from save version 2 are stored as seeds and re-drawn by the
// generator, so its output for their parameters must never change. The
// fixture holds digests taken before the restoration update.
//   node --test tools/test/        (npm test)
//   node tools/test/legacy.test.mjs --update   rewrites the fixture (only after a deliberate change)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadFromDisk, ROOT } from '../lib/node-content.mjs';
import { generateMess } from '../../src/core/mess.js';
import { hash } from '../../src/core/rng.js';

const FIXTURE = path.join(ROOT, 'tools/test/fixtures/legacy-mess.json');
const r1 = (n) => Math.round(n * 10) / 10;
const digest = (m) => hash(JSON.stringify({ f: m.faults.map((f) => [f.id, f.type, f.item || f.prop || f.region || f.lamp || '', r1(f.cx), r1(f.cy), r1(f.angle || 0), r1(f.amount || 0), f.pattern || 0, f.corner || '']), cat: m.cat && [m.cat.pose, r1(m.cat.cx)], col: m.collectible && [m.collectible.id, r1(m.collectible.cx)], par: m.par, ref: m.ref, cond: m.condition }));

export async function legacyDigests(c, half, all) {
  const out = {};
  const v = c.village('honeycombe');
  const gen = (o) => digest(generateMess(c, { village: 'honeycombe', legacy: true, ...o }));
  for (const sid of v.sceneOrder) for (const tier of [1, 2, 3, 4, 5, 6]) for (const seed of [1, 7, 19, 1957, 123456]) for (const [pn, projects] of [['none', []], ['half', half], ['all', all]]) {
    out[`${sid}|${tier}|${seed}|${pn}`] = gen({ scene: sid, tier, seed, projectsDone: projects, cat: seed % 2 === 1 });
  }
  out.tutorial = gen({ scene: 'railway-halt', tier: 1, condition: 'clear', seed: 1957, projectsDone: [], script: ['litter', 'crooked', 'litter', 'crooked', 'litter'], types: ['litter', 'crooked'], cat: false });
  out.types = gen({ scene: 'high-street', tier: 2, condition: 'golden', seed: 99, projectsDone: ['open-high-street'], types: ['litter', 'crooked', 'faded'], cat: false });
  out.collect = gen({ scene: 'old-mill', tier: 3, seed: 5, projectsDone: half, collectible: { id: 'cowslip', sprite: 'collectibles/cowslip' } });
  return out;
}

test('legacy album postcards regenerate exactly as before', async () => {
  const c = await loadFromDisk();
  const fx = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const now = await legacyDigests(c, fx.half, fx.all);
  const changed = Object.keys(fx.digests).filter((k) => fx.digests[k] !== now[k]);
  assert.deepEqual(changed, [], `${changed.length} legacy postcards would change, e.g. ${changed.slice(0, 5).join(', ')}`);
});

if (process.argv.includes('--update')) {
  const c = await loadFromDisk();
  const fx = JSON.parse(await readFile(FIXTURE, 'utf8'));
  fx.digests = await legacyDigests(c, fx.half, fx.all);
  await writeFile(FIXTURE, JSON.stringify(fx, null, 1) + '\n');
  console.log('fixture updated');
}
