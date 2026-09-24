#!/usr/bin/env python3
"""Render a plate with a scene-coordinate grid (landscape scenes are 1500 x 1000
units, portrait 1000 x 1500) so
slots can be annotated by eye.

  python3 tools/art/grid.py <plate.png> <out.jpg> [x0 y0 x1 y1] [--step 50] [--px 1000]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opts = dict(zip(sys.argv[1:], sys.argv[2:]))
step = int(opts.get('--step', 50))
outpx = int(opts.get('--px', 1000))
src, out = args[0], args[1]
im = Image.open(src).convert('RGB')
# scene units: 1500 x 1000 for landscape plates, 1000 x 1500 for portrait
SW = float(opts.get('--sw', 1500 if im.width > im.height else 1000))
S = im.width / SW
H = im.height / S
x0, y0, x1, y1 = (map(float, args[2:6]) if len(args) >= 6 else (0, 0, SW, H))
crop = im.crop((int(x0 * S), int(y0 * S), int(x1 * S), int(y1 * S)))
scale = outpx / crop.width
crop = crop.resize((outpx, int(crop.height * scale)), Image.LANCZOS)
d = ImageDraw.Draw(crop, 'RGBA')
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
except Exception:
    font = ImageFont.load_default()
k = crop.width / (x1 - x0)
gx = (int(x0) // step) * step
while gx <= x1:
    X = (gx - x0) * k
    major = gx % (step * 2) == 0
    d.line([(X, 0), (X, crop.height)], fill=(255, 0, 80, 150 if major else 70), width=1)
    if major:
        for yy in range(0, crop.height, 180):
            d.text((X + 2, yy + 2), str(gx), fill=(255, 255, 0, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    gx += step
gy = (int(y0) // step) * step
while gy <= y1:
    Y = (gy - y0) * k
    major = gy % (step * 2) == 0
    d.line([(0, Y), (crop.width, Y)], fill=(0, 200, 255, 150 if major else 70), width=1)
    if major:
        for xx in range(0, crop.width, 200):
            d.text((xx + 2, Y + 2), str(gy), fill=(0, 255, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0))
    gy += step
crop.save(out, quality=88)
print(crop.size)
