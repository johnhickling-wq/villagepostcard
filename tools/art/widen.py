#!/usr/bin/env python3
"""Widen a 3:2 plate to 2:1 by painting new scenery at each side.

  python3 tools/art/widen.py <in.png> <out.png> "<what continues left>" "<what continues right>" [--reuse]

--reuse re-composites from the model's last picture (<out>_raw.png) without paying for a new one.

The plate is placed in the middle of a 21:9 canvas with flat magenta sides and
the image model paints only the sides. The original middle is then pasted back
over the model's picture (feathered at the seams), so every pixel the scene's
annotations refer to is unchanged: a scene's coordinates just shift right by
a quarter of its old width. The result is cropped to exactly 2:1.
"""
import sys, pathlib
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from orgen import generate  # noqa: E402

H = 1296                    # working height in pixels (the model paints 21:9 at 3024x1296)
OUT_AR = 2.0                # final aspect ratio
FEATHER = 0.035             # seam blend, as a share of the plate width


def _similarity(gen_band, ref_band):
    """2x3 similarity transform taking gen_band onto ref_band (ORB + RANSAC), or None."""
    import cv2
    g = cv2.cvtColor(np.asarray(gen_band), cv2.COLOR_RGB2GRAY)
    r = cv2.cvtColor(np.asarray(ref_band), cv2.COLOR_RGB2GRAY)
    orb = cv2.ORB_create(4000)
    kg, dg = orb.detectAndCompute(g, None)
    kr, dr = orb.detectAndCompute(r, None)
    if dg is None or dr is None:
        return None
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(dg, dr)
    if len(matches) < 12:
        return None
    src = np.float32([kg[m.queryIdx].pt for m in matches])
    dst = np.float32([kr[m.trainIdx].pt for m in matches])
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
    if M is None or inl.sum() < 12:
        return None
    return M


def align_sides(gen, canvas, side, pw):
    """Warp each half of the model's picture so its copy of the middle sits on
    the original, matched on a band just inside each seam."""
    import cv2
    band = round(pw * 0.3)
    cw, h = gen.size
    out = np.asarray(gen).copy()
    for which, x0 in (('left', side), ('right', side + pw - band)):
        box = (x0, 0, x0 + band, h)
        M = _similarity(gen.crop(box), canvas.crop(box))
        if M is None:
            print(f'  {which} seam: no alignment found, blending as is')
            continue
        # express in full-canvas coordinates, warp the whole picture, keep this half
        T = np.array([[1, 0, x0], [0, 1, 0], [0, 0, 1]], float)
        full = T @ np.vstack([M, [0, 0, 1]]) @ np.linalg.inv(T)
        warped = cv2.warpAffine(np.asarray(gen), full[:2], (cw, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        s = np.hypot(M[0, 0], M[1, 0])
        print(f'  {which} seam: scale {s:.3f}, shift {full[0, 2]:.1f},{full[1, 2]:.1f}px')
        if which == 'left':
            out[:, :side + pw // 2] = warped[:, :side + pw // 2]
        else:
            out[:, side + pw // 2:] = warped[:, side + pw // 2:]
    return Image.fromarray(out)


def widen(src, out, left, right, model='openai/gpt-5.4-image-2', keep_tmp=True, reuse=False):
    src, out = pathlib.Path(src), pathlib.Path(out)
    plate = Image.open(src).convert('RGB')
    pw = round(H * plate.width / plate.height)
    plate = plate.resize((pw, H), Image.LANCZOS)
    cw = round(H * 21 / 9)
    side = (cw - pw) // 2
    canvas = Image.new('RGB', (cw, H), (255, 0, 255))
    canvas.paste(plate, (side, 0))
    tmp_in = out.with_name(out.stem + '_canvas.jpg')
    canvas.save(tmp_in, quality=93)
    prompt = ("This picture is a finished illustration in the middle with flat magenta panels at the left and right. Paint over the two magenta "
              "panels so the illustration continues seamlessly out to the edges, in exactly the same style, palette, lighting and paper texture. "
              f"On the left: {left}. On the right: {right}. Keep the horizon, ground level and perspective continuous across both seams. "
              "Leave the middle illustration exactly as it is, unchanged. No magenta anywhere in the result, no people, no text, no litter, "
              "no border or frame.")
    raw = out.with_name(out.stem + '_raw.png')
    if not (reuse and raw.exists()):
        generate(prompt, str(raw), model=model, aspect='21:9', size='2K', refs=[str(tmp_in)])
    gen = Image.open(raw).convert('RGB').resize((cw, H), Image.LANCZOS)
    # the model redraws the middle slightly shifted: line its picture up with
    # the original, one side at a time, so the seams don't show double
    gen = align_sides(gen, canvas, side, pw)
    # paste the untouched middle back, feathered into the new sides
    f = max(8, round(pw * FEATHER))
    mask = Image.new('L', (cw, H), 0)
    mask.paste(255, (side + f, 0, side + pw - f, H))
    mask = mask.filter(ImageFilter.BoxBlur(f // 2))
    full = Image.new('RGB', (cw, H)); full.paste(plate, (side, 0))
    comp = Image.composite(full, gen, mask)
    # crop to 2:1 around the middle
    ow = round(H * OUT_AR)
    x0 = (cw - ow) // 2
    comp = comp.crop((x0, 0, x0 + ow, H))
    comp.save(out)
    if not keep_tmp:
        tmp_in.unlink()
    # where the old plate now sits, as a share of the new width
    return {'offset_px': side - x0, 'plate_px': pw, 'width_px': ow}


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    print(widen(a[0], a[1], a[2], a[3], reuse='--reuse' in sys.argv))
