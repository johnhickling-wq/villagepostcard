// The handwritten note on the back of each postcard, generated from
// templates in content/common/notes.json and seeded by the postcard.
import { Rng, seedOf } from './rng.js';

export function postcardNote(content, vid, sceneId, entry, collectedItemName = null) {
  const n = content.notes;
  const v = content.village(vid);
  const scene = v.scenes[sceneId];
  const r = new Rng(seedOf('note', sceneId, entry.seed, entry.condition));
  const villager = v.villagers[scene.villager]?.short || 'Mrs Pemberton';
  const fill = (t) => t.replace('{scene}', scene.name).replace('{villager}', villager).replace('{collectible}', collectedItemName || 'pressed flower');
  const opener = fill(r.pick(n.openers[entry.condition] || n.openers.clear));
  const middles = n.middles.filter((m) => collectedItemName || !m.includes('{collectible}'));
  return {
    to: r.pick(n.recipients),
    lines: [opener, fill(r.pick(middles)), r.pick(n.closers)],
    signature: n.signature,
  };
}
