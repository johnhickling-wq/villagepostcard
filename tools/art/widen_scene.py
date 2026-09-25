#!/usr/bin/env python3
"""Move a scene's annotations onto its widened plate.

  python3 tools/art/widen_scene.py <village> <scene> [--dx 250] [--width 2000] [--keep-erase]

tools/art/widen.py keeps the old plate untouched in the middle of the new one,
so every point in the scene file simply moves right by the width added on the
left. This rewrites content/villages/<village>/scenes/<scene>.json in place:
x coordinates of zones, edges, regions, lamps, props, perches, cat spots,
chimneys, water, occluders and restoration props and decor move by dx, and the
scene size becomes [width, height]. The "erase" list (objects inpainted out of
the old painted plate) is dropped, because the new plate was drawn from the
already-cleaned one; pass --keep-erase to shift it instead.
"""
import sys, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(zip(sys.argv[1:], sys.argv[2:]))
village, sid = args[0], args[1]
dx = float(opts.get('--dx', 250))
width = int(opts.get('--width', 2000))
path = ROOT / 'content' / 'villages' / village / 'scenes' / f'{sid}.json'
s = json.loads(path.read_text())


def num(v):
    v = round(v, 1)
    return int(v) if v == int(v) else v


def pts(lst):
    return [[num(x + dx), y] for x, y in lst]


def objs(lst):
    for o in lst or []:
        if 'x' in o:
            o['x'] = num(o['x'] + dx)
    return lst


for z in s.get('zones', []):
    z['poly'] = pts(z['poly'])
for e in s.get('edges', []):
    e['line'] = pts(e['line'])
for r in s.get('regions', []):
    r['poly'] = pts(r['poly'])
for o in s.get('occluders', []):
    o['poly'] = pts(o['poly'])
s['water'] = [pts(p) for p in s.get('water', [])] if 'water' in s else s.get('water')
if 'water' in s and s['water'] is None:
    del s['water']
if 'chimneys' in s:
    s['chimneys'] = pts(s['chimneys'])
for key in ('lamps', 'props', 'perches', 'cats'):
    objs(s.get(key))
for r in s.get('restoration', []):
    objs(r.get('props'))
    for d in r.get('decor', []):
        d['points'] = pts(d['points'])
if 'erase' in s:
    if '--keep-erase' in sys.argv:
        s['erase'] = [pts(p) for p in s['erase']]
    else:
        del s['erase']
old = s['size']
s['size'] = [width, old[1]]
path.write_text(json.dumps(s, indent=1, ensure_ascii=False))  # the scene files have no final newline
print(f'{village}/{sid}: {old} -> {s["size"]}, x += {dx}')
