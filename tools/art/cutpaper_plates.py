#!/usr/bin/env python3
"""Rebuild a village's plates in the cut-paper style at 2:1, keeping the scene data.

  python3 tools/art/cutpaper_plates.py <village> [scene ...] [--widen-only] [--reuse]

For each scene in art_src/<village>/cutpaper.json:
  1. restyle: redraw the current (painted, 3:2) plate as cut-paper collage with
     the same composition, matched to the style reference;
  2. widen: paint new scenery at each side (tools/art/widen.py) and crop to 2:1.

Results go to scratch_art/cutpaper/<village>/<scene>.png for review. Once a
plate is accepted, tools/art/widen_scene.py shifts its scene file to match.
"""
import sys, json, pathlib
from concurrent.futures import ThreadPoolExecutor
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from orgen import generate, spent  # noqa: E402
from widen import widen  # noqa: E402

MODEL = 'openai/gpt-5.4-image-2'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
village, only = args[0], set(args[1:])
cfg = json.loads((ROOT / 'art_src' / village / 'cutpaper.json').read_text())
OUT = ROOT / 'scratch_art' / 'cutpaper' / village
OUT.mkdir(parents=True, exist_ok=True)


def one(sid):
    spec = cfg['scenes'][sid]
    src = ROOT / 'assets' / 'villages' / village / 'plates' / f'{sid}.webp'   # built (inpainted) plate
    flat = OUT / f'{sid}_32.png'
    if '--widen-only' not in sys.argv and not ('--reuse' in sys.argv and flat.exists()):
        refs = [str(src)] + [str(ROOT / r) for r in cfg.get('styleRefs', [])]
        _, c = generate(cfg['restyle'] + ' ' + spec.get('keep', ''), str(flat), model=MODEL, aspect='3:2', size='2K', refs=refs)
        print(f'{sid}: restyled (${c:.2f})', flush=True)
    info = widen(flat, OUT / f'{sid}.png', spec['left'], spec['right'], model=MODEL, reuse='--reuse' in sys.argv)
    print(f'{sid}: widened {info}', flush=True)


scenes = [s for s in cfg['scenes'] if not only or s in only]
print(f'{len(scenes)} scene(s); spent so far ${spent():.2f}', flush=True)
with ThreadPoolExecutor(4) as ex:
    for f in [ex.submit(one, s) for s in scenes]:
        try:
            f.result()
        except Exception as e:  # keep going; report at the end
            print('FAILED', e, flush=True)
print(f'done; spent ${spent():.2f}')
