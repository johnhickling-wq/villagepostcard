#!/usr/bin/env python3
"""Cut individual sprites out of a chroma-key sprite sheet.

The sheet is generated on a flat magenta (#FF00FF) background. We key the
magenta out (with soft edges and spill suppression), split the result into
connected components and save each one as a trimmed RGBA sprite, named in
reading order (rows top-to-bottom, left-to-right).

  python3 tools/art/cutout.py sheet.png outdir name1 name2 ...
"""
import sys, json, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage

KEY = np.array([255, 0, 255], dtype=np.float32)


def key_alpha(rgb):
    """Alpha from distance to magenta: magenta has high R and B but low G."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # "magenta-ness": how far min(r,b) exceeds g
    m = np.minimum(r, b) - g
    # fully keyed at m>=150, fully opaque at m<=60
    a = np.clip((150 - m) / 90.0, 0, 1)
    return a


def despill(rgb, a):
    """Remove magenta fringe: clamp r and b towards g-weighted neutral where alpha is partial."""
    out = rgb.copy()
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    lim = np.maximum(g, (r + b) / 2 * 0.0 + g)  # clamp to green level
    spill = (np.minimum(r, b) > g + 20)
    w = spill & (a < 0.999)
    out[..., 0] = np.where(w, np.minimum(r, np.maximum(g, b * 0.0) + (r - np.minimum(r, b)) + g * 0.15 + 10), r)
    out[..., 2] = np.where(w, np.minimum(b, g + (b - np.minimum(r, b)) + g * 0.15 + 10), b)
    return out


def cut(sheet_path, outdir, names, min_area=400, pad=4, merge_dist=3, attach_dist=40):
    im = Image.open(sheet_path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    a = key_alpha(rgb)
    rgb = despill(rgb, a)
    solid = a > 0.5
    # join anti-aliased fragments, then attach small detached bits (a drip,
    # a string, a flower head) to the nearest big object
    grown = ndimage.binary_dilation(solid, iterations=merge_dist)
    lab, n = ndimage.label(grown)
    areas = ndimage.sum(solid, lab, index=np.arange(1, n + 1))
    big = [i + 1 for i, ar in enumerate(areas) if ar >= min_area * 4]
    if big:
        med = float(np.median([areas[i - 1] for i in big]))
        big = [i for i in big if areas[i - 1] >= med * 0.08]
    objs = ndimage.find_objects(lab)
    def box_dist(s1, s2):
        dy = max(0, max(s1[0].start, s2[0].start) - min(s1[0].stop, s2[0].stop))
        dx = max(0, max(s1[1].start, s2[1].start) - min(s1[1].stop, s2[1].stop))
        return max(dx, dy)
    owner = {i: i for i in big}
    for i in range(1, n + 1):
        if i in owner or areas[i - 1] < 30:
            continue
        best = min(big, key=lambda b: box_dist(objs[i - 1], objs[b - 1]), default=None)
        if best is not None and box_dist(objs[i - 1], objs[best - 1]) <= attach_dist:
            owner[i] = best
    merged = np.zeros_like(lab)
    for i, o in owner.items():
        merged[lab == i] = o
    lab = merged
    comps = []
    for b in big:
        region = lab == b
        ys, xs = np.nonzero(region)
        sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        comps.append((ys.mean(), xs.mean(), b, sl))
    # reading order: cluster into rows by centroid y
    comps.sort(key=lambda c: c[0])
    rows, cur = [], []
    for c in comps:
        if cur and c[0] - np.mean([k[0] for k in cur]) > im.height * 0.12:
            rows.append(cur); cur = []
        cur.append(c)
    if cur:
        rows.append(cur)
    ordered = [c for row in rows for c in sorted(row, key=lambda c: c[1])]
    outdir = pathlib.Path(outdir); outdir.mkdir(parents=True, exist_ok=True)
    meta = {}
    for idx, (cy, cx, lid, sl) in enumerate(ordered):
        name = names[idx] if idx < len(names) else f"item{idx:02d}"
        y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, im.height)
        x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, im.width)
        region = (lab[y0:y1, x0:x1] == lid)
        alpha = np.where(region, a[y0:y1, x0:x1], 0)
        # tighten the keyed edge a touch to kill the last fringe pixels
        alpha = np.clip((alpha - 0.08) / 0.92, 0, 1)
        ys, xs = np.nonzero(alpha > 0.02)
        ty0, ty1, tx0, tx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = np.dstack([rgb[y0:y1, x0:x1], alpha * 255])[ty0:ty1, tx0:tx1]
        spr = Image.fromarray(np.clip(crop, 0, 255).astype(np.uint8), "RGBA")
        spr.save(outdir / f"{name}.png")
        opaque = crop[..., 3] > 128
        col = crop[..., :3][opaque].mean(axis=0) if opaque.any() else [128, 128, 128]
        meta[name] = {"w": spr.width, "h": spr.height,
                      "color": "#%02x%02x%02x" % tuple(int(v) for v in col)}
    print(f"{len(ordered)} sprites cut from {sheet_path} (expected {len(names)})")
    return meta


if __name__ == "__main__":
    sheet, outdir, *names = sys.argv[1:]
    m = cut(sheet, outdir, names)
    print(json.dumps(m, indent=1))
