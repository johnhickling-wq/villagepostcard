#!/usr/bin/env python3
"""Preview a scene's slot annotations on top of its plate.

  python3 tools/art/overlay.py <village> <scene> <out.jpg> [--clean] [--px 1000]

Draws ground zones (green), edges (yellow), regions (doors/paintables red,
windows cyan), lamps (orange), perches (magenta), cat spots (orange boxes),
chimneys (white) and composites every prop sprite at its placement, so the
"clean" scene can be judged by eye. --clean draws only the props.
"""
import sys, json, pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(zip(sys.argv[1:], sys.argv[2:]))
village, scene_id, out = args[0], args[1], args[2]
clean = '--clean' in sys.argv
restored = '--restored' in sys.argv
px = int(opts.get('--px', 1000))

scene = json.loads((ROOT / f"content/villages/{village}/scenes/{scene_id}.json").read_text())
vman = json.loads((ROOT / f"assets/villages/{village}/manifest.json").read_text())
cman = json.loads((ROOT / "assets/common/manifest.json").read_text())
plate_meta = vman["images"][scene["plate"]]
plate = Image.open(ROOT / f"assets/villages/{village}" / plate_meta["src"]).convert("RGBA")
W, H = scene["size"]
k = px / W
plate = plate.resize((px, round(H * k)), Image.LANCZOS)
atlases = {}


def sprite(key):
    for base, man in ((f"assets/villages/{village}", vman), ("assets/common", cman)):
        m = man.get("sprites", {}).get(key)
        if m:
            path = ROOT / base / m["atlas"]
            if path not in atlases:
                atlases[path] = Image.open(path).convert("RGBA")
            return atlases[path].crop((m["x"], m["y"], m["x"] + m["w"], m["y"] + m["h"]))
    raise KeyError(key)


def S(p):
    return (p[0] * k, p[1] * k)


props = list(scene.get("props", []))
if restored:
    for r in scene.get("restoration", []):
        props += r.get("props", [])
        for dc in r.get("decor", []):
            pass
for p in sorted(props, key=lambda p: p["y"]):
    im = sprite(p["sprite"])
    h = p["h"] * k
    w = p.get("w", p["h"] * im.width / im.height) * k if "w" in p else h * im.width / im.height
    im = im.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
    if p.get("flip"):
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    x = p["x"] * k - w / 2
    y = p["y"] * k if p.get("pivot") == "top" else p["y"] * k - h
    plate.alpha_composite(im, (round(x), round(y)))

layer = Image.new("RGBA", plate.size, (0, 0, 0, 0))
d = ImageDraw.Draw(layer, "RGBA")
if not clean:
    for z in scene.get("zones", []):
        d.polygon([S(p) for p in z["poly"]], fill=(0, 255, 0, 50), outline=(0, 255, 0, 220))
    for e in scene.get("edges", []):
        d.line([S(p) for p in e["line"]], fill=(255, 230, 0, 230), width=3)
    for r in scene.get("regions", []):
        col = (0, 220, 255, 230) if "window" in r.get("tags", []) else (255, 40, 40, 230)
        d.polygon([S(p) for p in r["poly"]], fill=col[:3] + (45,), outline=col)
        d.text(S(r["poly"][0]), r["id"], fill=(255, 255, 255, 255))
    for occ in scene.get("occluders", []):
        d.polygon([S(p) for p in occ["poly"]], outline=(255, 255, 255, 200))
    for l in scene.get("lamps", []):
        x, y = S((l["x"], l["y"]))
        r = l["r"] * k
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 150, 0, 255), width=3)
    for p in scene.get("perches", []):
        x, y = S((p["x"], p["y"]))
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 0, 255, 255))
    for c in scene.get("cats", []):
        x, y = S((c["x"], c["y"]))
        d.rectangle([x - 20, y - 30, x + 20, y], outline=(255, 140, 0, 255), width=2)
    for c in scene.get("chimneys", []):
        x, y = S(c)
        d.ellipse([x - 6, y - 6, x + 6, y + 6], outline=(255, 255, 255, 255), width=2)
    for p in props:
        x, y = S((p["x"], p["y"]))
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 0, 0, 255))
        d.text((x + 5, y), p["id"], fill=(255, 255, 0, 255))
plate.alpha_composite(layer)
plate.convert("RGB").save(out, quality=88)
print("wrote", out)
