// States of a village along its restoration route, for the bot and the tuner:
// what a photo walk there would be generated with (the same protection the
// game applies: nothing restored for good is spoilt).

const PERSISTENT = ['faded', 'grimy', 'wilted'];

/** After the first n visits of the route. */
export function routeState(v, n) {
  const done = v.visits.slice(0, n);
  const effects = done.flatMap((x) => x.effects);
  const fixed = {}, protect = {};
  for (const x of done) {
    for (const t of x.tasks) {
      if (!t.target || ![...PERSISTENT, 'plant'].includes(t.op)) continue;
      (protect[x.scene] ||= []).push(t.target);
      if (t.op !== 'plant') (fixed[x.scene] ||= []).push(t.target);
    }
  }
  return {
    n, effects,
    walk(sid) {
      const scene = v.scenes[sid];
      const prot = [...(protect[sid] || []), ...(scene.neglect || []).filter((q) => effects.includes(q.effect)).map((q) => q.target)];
      return { projectsDone: effects, fixed: fixed[sid] || [], protect: prot, policy: true };
    },
  };
}

/** Fresh, half-way and fully restored. */
export const walkStates = (v) => [0, Math.floor(v.visits.length / 2), v.visits.length].map((n) => routeState(v, n));
