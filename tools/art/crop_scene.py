#!/usr/bin/env python3
"""Bring a scene closer: crop its plate to a 2:1 window and move every
annotation of its scene file with it, so the work area fills the phone.

  python3 tools/art/crop_scene.py <village> <scene> <x0> <y0> <width> [--dry]

The window is x0..x0+width, y0..y0+width/2 in the scene's current units
(2000 x 1000). The original plate is kept in art_src/<village>/plates_wide/
(and the crop is always taken from it, so running again with other numbers
starts from the wide view). Everything in the scene file is transformed:
points and polygons are moved and scaled (polygons and polylines are clipped
to the frame), prop heights, lamp radii and explicit `s` scales grow by the
zoom, and the depth line keeps litter and the cat in proportion. Anything that
falls outside the frame is dropped; if a visit or a neglect entry needs it,
the tool stops and says so. Check the result with overlay.py, then run
`npm run validate` and `npm run bot`.

A crop only works when the plate has the resolution: at phone size (1688
device pixels across) a window 1400 units wide still has ~1800 source pixels.
"""
import json, sys, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
DRY = "--dry" in sys.argv
village, sid = args[0], args[1]
x0, y0, cw = float(args[2]), float(args[3]), float(args[4])

scene_path = ROOT / f"content/villages/{village}/scenes/{sid}.json"
wide_scene = ROOT / f"art_src/{village}/plates_wide/{sid}.json"
# a second run starts again from the wide view
scene = json.loads((wide_scene if wide_scene.exists() else scene_path).read_text())
W, H = scene["size"]
ch = cw * H / W
k = W / cw
visits = json.loads((ROOT / f"content/villages/{village}/visits.json").read_text())["visits"]
needed = {t["target"] for v in visits if v["scene"] == sid for t in v["tasks"] if t.get("target")}
needed |= {n["target"] for n in scene.get("neglect", [])}
for r in scene.get("restoration", []):
    needed |= set((r.get("labels") or {}).keys()) | set((r.get("tints") or {}).keys())
zones_needed = {z for v in visits if v["scene"] == sid for t in v["tasks"] for z in (t.get("zones") or []) + (t.get("edges") or [])}

r1 = lambda v: round(v, 1)
T = lambda p: [r1((p[0] - x0) * k), r1((p[1] - y0) * k)]
inside = lambda p: 0 <= p[0] <= W and 0 <= p[1] <= H
dropped = []


def clip_poly(pts):
    """Sutherland-Hodgman against the frame."""
    def clip(poly, keep, cross):
        out = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            if keep(cur):
                if not keep(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif keep(prev):
                out.append(cross(prev, cur))
        return out
    def at_x(x):
        return lambda a, b: [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])]
    def at_y(y):
        return lambda a, b: [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y]
    poly = pts
    for keep, cross in [(lambda p: p[0] >= 0, at_x(0)), (lambda p: p[0] <= W, at_x(W)),
                        (lambda p: p[1] >= 0, at_y(0)), (lambda p: p[1] <= H, at_y(H))]:
        if not poly:
            break
        poly = clip(poly, keep, cross)
    return [[r1(x), r1(y)] for x, y in poly]


def area(poly):
    return abs(sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly))) / 2


def clip_line(line):
    """Longest run of the polyline inside the frame (sampled finely)."""
    pts = []
    for a, b in zip(line, line[1:]):
        n = max(2, int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / 10))
        for i in range(n):
            t = i / n
            pts.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    pts.append(line[-1])
    runs, cur = [], []
    for p in pts:
        if inside(p):
            cur.append(p)
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    if not runs:
        return None
    run = max(runs, key=len)
    if len(run) < 2:
        return None
    # keep the original vertices that fall inside, plus the run's ends
    keep = [run[0]] + [p for p in line if inside(p) and run[0][0] <= p[0] <= run[-1][0] or inside(p) and run[-1][0] <= p[0] <= run[0][0]] + [run[-1]]
    out = []
    for p in keep:
        if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) > 1:
            out.append([r1(p[0]), r1(p[1])])
    return out if len(out) >= 2 else None


def polys(items, key, what, min_area=400):
    out = []
    for it in items:
        poly = clip_poly([T(p) for p in it[key]])
        if len(poly) < 3 or area(poly) < min_area:
            dropped.append(f"{what} {it.get('id', '')}".strip())
            continue
        out.append({**it, key: poly})
    return out


s = scene
d = s["depth"]
s["depth"] = {**d, "farY": r1((d["farY"] - y0) * k), "nearY": r1((d["nearY"] - y0) * k),
              "farScale": round(d["farScale"] * k, 3), "nearScale": round(d["nearScale"] * k, 3)}
s["zones"] = polys(s.get("zones", []), "poly", "zone", 2000)
s["occluders"] = polys(s.get("occluders", []), "poly", "occluder")
s["regions"] = polys(s.get("regions", []), "poly", "region", 60)
s["erase"] = [clip_poly([T(p) for p in poly]) for poly in s.get("erase", [])]
s["erase"] = [p for p in s["erase"] if len(p) >= 3]
if not s["erase"]:
    s.pop("erase")
water = []
for poly in s.get("water", []):
    c = clip_poly([T(p) for p in poly])
    if len(c) >= 3 and area(c) > 400:
        water.append(c)
s["water"] = water
edges = []
for e in s.get("edges", []):
    line = clip_line([T(p) for p in e["line"]])
    if line:
        edges.append({**e, "line": line})
    else:
        dropped.append(f"edge {e['id']}")
s["edges"] = edges


def place(items, what, scale_keys=("h",)):
    out = []
    for it in items:
        x, y = T([it["x"], it["y"]])
        if not inside([x, y]):
            dropped.append(f"{what} {it.get('id', it.get('pose', ''))}")
            continue
        n = {**it, "x": x, "y": y}
        for key in scale_keys:
            if key in it:
                n[key] = r1(it[key] * k) if key != "s" else round(it[key] * k, 3)
        out.append(n)
    return out


s["lamps"] = place(s.get("lamps", []), "lamp", ("r",))
s["props"] = place(s.get("props", []), "prop", ("h", "w"))
s["perches"] = place(s.get("perches", []), "perch", ("s",))
s["cats"] = place(s.get("cats", []), "cat", ("s",))
s["chimneys"] = [T(c) for c in s.get("chimneys", []) if inside(T(c))]
for r in s.get("restoration", []):
    if "props" in r:
        r["props"] = place(r["props"], f"{r['effect']} prop", ("h", "w"))
    for dec in r.get("decor", []):
        dec["points"] = [T(p) for p in dec["points"]]
        if "sag" in dec:
            dec["sag"] = r1(dec["sag"] * k)

ids = {r["id"] for r in s["regions"]} | {p["id"] for p in s["props"]} | {l["id"] for l in s["lamps"]}
ids |= {p["id"] for r in s.get("restoration", []) for p in r.get("props", [])}
missing = sorted(needed - ids)
lost_zones = sorted(zones_needed - {z["id"] for z in s["zones"]} - {e["id"] for e in s["edges"]})
print(f"{sid}: window x {x0}..{x0 + cw}, y {y0}..{y0 + ch}, zoom {k:.2f}")
print("dropped:", ", ".join(dropped) or "nothing")
if missing or lost_zones:
    sys.exit(f"STOP: needed by a visit or neglect but outside the frame: {missing + lost_zones}")
if DRY:
    sys.exit(0)

wide_dir = ROOT / f"art_src/{village}/plates_wide"
wide_dir.mkdir(exist_ok=True)
src = ROOT / f"art_src/{village}/plates/{sid}.webp"
wide = wide_dir / f"{sid}.webp"
if not wide.exists():
    wide.write_bytes(src.read_bytes())
    wide_scene.write_text(scene_path.read_text())
else:
    # always crop from the wide plate and its own scene file
    print("(cropping from the kept wide plate and scene)")
im = Image.open(wide).convert("RGB")
u = im.width / W
box = (round(x0 * u), round(y0 * u), round((x0 + cw) * u), round((y0 + ch) * u))
im.crop(box).resize(im.size, Image.LANCZOS).save(src, "WEBP", quality=95, method=6)
scene_path.write_text(json.dumps(s, indent=1, ensure_ascii=False) + "\n")
print(f"wrote {src.relative_to(ROOT)} and {scene_path.relative_to(ROOT)}")
