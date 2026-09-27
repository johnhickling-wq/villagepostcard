#!/usr/bin/env python3
"""The shared colour direction for every plate and sprite ("fresh spring day").

The generated cut-paper art came out with a yellow-olive cast: grass, foliage,
stone and paper all sat in the same muddy midtones. This pass is hue-selective,
not a blanket saturation boost, and it never moves a pixel, so every scene
annotation stays exactly where it was:

  - olive and yellow-green paper (grass, leaves) turns towards fresh leaf green;
  - turquoise sky turns towards clear blue, water towards clean blue;
  - honey stone and warm paths keep their hue and gain a little warmth;
  - near-neutral cream (clouds, paper, whitewash) loses its yellow cast;
  - a gentle contrast curve separates the materials again.

It is applied by build.py to plates, atlases and the map, and new art is
generated against references that have already been through it (see
art_src/ART_DIRECTION.md). Tune it here, once, for the whole game.

  python3 tools/art/freshen.py in.webp out.jpg [amount]    # preview one image
"""
import sys
import numpy as np
from PIL import Image
import cv2

# hue (degrees, HSV) -> shift, as piecewise-linear control points
HUE_SHIFT = [(0, 0), (34, 0), (45, -4), (52, 0), (62, 16), (78, 26), (96, 16), (118, 4), (140, 0),
             (165, 0), (178, 9), (192, 12), (210, 6), (230, 0), (360, 0)]
# hue -> saturation gain
SAT_GAIN = [(0, 1.06), (25, 1.08), (42, 1.06), (55, 1.14), (80, 1.24), (120, 1.16), (150, 1.08),
            (175, 1.12), (200, 1.14), (230, 1.05), (300, 1.06), (360, 1.06)]


def _interp(h, pts):
    xs, ys = zip(*pts)
    return np.interp(h, xs, ys)


def freshen_rgb(rgb, amount=1.0):
    """rgb: float32 array HxWx3 in 0..1. amount 0..1 scales the whole pass
    (new art that already has fresher colour needs less). Returns the freshened array."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)  # H 0..360, S, V 0..1
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # the stronger the colour, the more it moves; greys and near-whites barely shift hue
    w = np.clip((s - 0.08) / 0.25, 0, 1) * amount
    h2 = (h + _interp(h, HUE_SHIFT) * w) % 360
    s2 = np.clip(s * (1 + (_interp(h, SAT_GAIN) - 1) * w), 0, 1)
    # a touch of lift in the greens so the fresh leaf isn't dark
    greens = np.clip(1 - np.abs(h2 - 100) / 40, 0, 1) * w
    v2 = np.clip(v * (1 + 0.05 * greens), 0, 1)
    out = cv2.cvtColor(np.dstack([h2, s2, v2]).astype(np.float32), cv2.COLOR_HSV2RGB)
    # cream without the yellow cast: pull b* (yellow) of light, low-chroma pixels towards neutral-warm
    lab = cv2.cvtColor(out, cv2.COLOR_RGB2LAB)  # L 0..100, a/b ~ -127..127
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    chroma = np.sqrt(a * a + b * b)
    cream = np.clip((L - 62) / 22, 0, 1) * np.clip(1 - (chroma - 8) / 22, 0, 1)
    b = b - cream * np.clip(b - 6, 0, None) * 0.55 * amount
    # gentle S-curve on lightness, pivoting at the midtones
    Ln = L / 100
    Ln = Ln + 0.10 * amount * (Ln - 0.5) * (1 - np.abs(2 * Ln - 1))
    lab = np.dstack([np.clip(Ln, 0, 1) * 100, a, b]).astype(np.float32)
    return np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1)


def freshen(im, amount=1.0):
    """PIL image (RGB or RGBA) -> freshened PIL image of the same mode."""
    if amount <= 0:
        return im
    mode = im.mode
    rgba = im.convert("RGBA")
    arr = np.asarray(rgba).astype(np.float32) / 255
    rgb = freshen_rgb(np.ascontiguousarray(arr[..., :3]), amount)
    out = np.dstack([rgb, arr[..., 3:4]])
    res = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    return res if mode == "RGBA" else res.convert("RGB")


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    freshen(Image.open(src), float(sys.argv[3]) if len(sys.argv) > 3 else 1.0).save(dst, quality=88)
