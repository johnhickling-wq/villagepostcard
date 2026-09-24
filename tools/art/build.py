#!/usr/bin/env python3
"""Art build: turns source art (art_src/) into runtime assets (assets/).

  python3 tools/art/build.py            # build everything that changed
  python3 tools/art/build.py --force    # rebuild everything

Inputs
  art_src/sheets.json            sprite sheets -> item names (reading order)
  art_src/atlases.json           which sheet items go into which runtime atlas
  art_src/<village>/plates/*.png clean plates (scene backgrounds)
  art_src/<village>/extra.json   one-off images (map, posters...)

Outputs
  assets/<group>/<atlas>.webp + assets/<group>/manifest.json
  assets/villages/<village>/plates/<scene>.webp (+ .thumb.webp)

Each manifest maps asset keys to either an atlas frame or an image file, plus
metadata the game (and the headless bot) use: pixel size, dominant colour, and
for plates a coarse colour grid used to judge how well litter blends in.

This is the swap-in interface for final art: replace a source PNG, rerun the
build, and the game picks it up — keys and scene data stay the same.
"""
import json, sys, pathlib, base64, hashlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "art_src"
OUT = ROOT / "assets"
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from cutout import cut  # noqa: E402

FORCE = "--force" in sys.argv
GRID = 20  # plate colour grid cell size, in scene units (scene is 1000 wide)


def newer(src, dst):
    return FORCE or not dst.exists() or src.stat().st_mtime > dst.stat().st_mtime


def cut_sheets():
    cfg = json.loads((SRC / "sheets.json").read_text())
    names = {k: v["items"] for k, v in cfg["sheets"].items()}
    names.update(cfg.get("manual", {}))
    meta = {}
    for sheet, items in names.items():
        src = SRC / "sheets" / f"{sheet}.png"
        if not src.exists():
            print(f"  (missing sheet {sheet}, skipped)")
            continue
        outdir = SRC / "cut" / sheet
        stamp = outdir / ".stamp"
        if newer(src, stamp):
            for f in outdir.glob("*.png"):
                f.unlink()
            m = cut(src, outdir, items)
            (outdir / "meta.json").write_text(json.dumps(m, indent=1))
            stamp.write_text("ok")
        meta[sheet] = json.loads((outdir / "meta.json").read_text())
    return meta


def pack(images, max_w=2048, pad=3):
    """Simple shelf packer. images: list of (key, PIL.Image). Returns atlas, frames."""
    images = sorted(images, key=lambda kv: -kv[1].height)
    x = y = shelf_h = 0
    frames = {}
    placements = []
    width = max_w
    for key, im in images:
        if x + im.width + pad > width:
            x = 0
            y += shelf_h + pad
            shelf_h = 0
        placements.append((key, im, x, y))
        frames[key] = [x, y, im.width, im.height]
        x += im.width + pad
        shelf_h = max(shelf_h, im.height)
    height = y + shelf_h
    used_w = max(f[0] + f[2] for f in frames.values())
    atlas = Image.new("RGBA", (used_w, height), (0, 0, 0, 0))
    for key, im, px, py in placements:
        atlas.paste(im, (px, py))
    return atlas, frames


def dominant(im):
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    m = a[..., 3] > 128
    if not m.any():
        return "#808080"
    c = a[..., :3][m].mean(axis=0)
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def build_atlases():
    cfg = json.loads((SRC / "atlases.json").read_text())
    for group, atlases in cfg.items():
        gdir = OUT / group
        gdir.mkdir(parents=True, exist_ok=True)
        manifest_path = gdir / "manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest.setdefault("sprites", {})
        for atlas_name, spec in atlases.items():
            max_side = spec.get("maxSide", 256)
            items = []
            for entry in spec["items"]:
                sheet, name = entry.split("/", 1)
                key_name = spec.get("rename", {}).get(entry, name)
                p = SRC / "cut" / sheet / f"{name}.png"
                if not p.exists():
                    print(f"  missing sprite {entry}")
                    continue
                im = Image.open(p).convert("RGBA")
                s = min(1.0, max_side / max(im.size))
                if s < 1:
                    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
                items.append((key_name, im))
            atlas, frames = pack(items, max_w=spec.get("width", 1024))
            file = f"{atlas_name}.webp"
            atlas.save(gdir / file, "WEBP", quality=spec.get("quality", 88), method=6)
            for key, (x, y, w, h) in frames.items():
                im = dict(items)[key]
                manifest["sprites"][f"{atlas_name}/{key}"] = {
                    "atlas": file, "x": x, "y": y, "w": w, "h": h, "color": dominant(im)}
            print(f"  atlas {group}/{file}: {atlas.size[0]}x{atlas.size[1]}, {len(frames)} sprites")
        manifest_path.write_text(json.dumps(manifest, indent=1))


def inpaint(im, polys, scene_w=1000):
    """Remove baked-in objects that the game replaces with interactive props
    (e.g. a painted shop sign replaced by a sign that can hang crooked)."""
    import cv2
    from PIL import ImageDraw
    k = im.width / scene_w
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    for poly in polys:
        d.polygon([(x * k, y * k) for x, y in poly], fill=255)
    m = np.asarray(mask)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    arr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(arr, m, 7, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def color_grid(im, scene_w=1000):
    """Average colour per GRID x GRID scene-unit cell, as a base64 RGB string."""
    scale = im.width / scene_w
    gw = scene_w // GRID
    gh = round(im.height / scale) // GRID
    small = im.convert("RGB").resize((gw, gh), Image.BOX)
    return {"cell": GRID, "w": gw, "h": gh,
            "rgb": base64.b64encode(np.asarray(small).astype(np.uint8).tobytes()).decode()}


def build_images():
    for vdir in sorted((SRC).glob("*/plates")):
        village = vdir.parent.name
        odir = OUT / "villages" / village
        (odir / "plates").mkdir(parents=True, exist_ok=True)
        manifest_path = odir / "manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest.setdefault("images", {})
        manifest.setdefault("sprites", {})
        for png in sorted([*vdir.glob("*.png"), *vdir.glob("*.webp")]):
            sid = png.stem
            dst = odir / "plates" / f"{sid}.webp"
            key = f"plate/{sid}"
            scene_json = ROOT / "content" / "villages" / village / "scenes" / f"{sid}.json"
            erase = json.loads(scene_json.read_text()).get("erase", []) if scene_json.exists() else []
            src_newer = newer(png, dst) or (scene_json.exists() and newer(scene_json, dst))
            if src_newer or key not in manifest["images"]:
                im = Image.open(png).convert("RGB")
                if erase:
                    im = inpaint(im, erase)
                im.save(dst, "WEBP", quality=80, method=6)
                th = im.resize((480, round(480 * im.height / im.width)), Image.LANCZOS)
                th.save(odir / "plates" / f"{sid}.thumb.webp", "WEBP", quality=78, method=6)
                manifest["images"][key] = {"src": f"plates/{sid}.webp", "thumb": f"plates/{sid}.thumb.webp",
                                           "w": im.width, "h": im.height, "grid": color_grid(im)}
                print(f"  plate {village}/{sid} {im.size}")
        extra = SRC / village / "extra.json"
        if extra.exists():
            for key, spec in json.loads(extra.read_text()).items():
                src = SRC / spec["src"]
                dst = odir / spec["out"]
                if not src.exists():
                    continue
                if newer(src, dst) or key not in manifest["images"]:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    im = Image.open(src).convert("RGB")
                    if spec.get("width"):
                        im = im.resize((spec["width"], round(spec["width"] * im.height / im.width)), Image.LANCZOS)
                    im.save(dst, "WEBP", quality=spec.get("quality", 80), method=6)
                    manifest["images"][key] = {"src": spec["out"], "w": im.width, "h": im.height}
                    print(f"  image {village}/{key} {im.size}")
        manifest_path.write_text(json.dumps(manifest, indent=1))


def build_common_images():
    spec_path = SRC / "common" / "extra.json"
    if not spec_path.exists():
        return
    odir = OUT / "common"
    odir.mkdir(parents=True, exist_ok=True)
    manifest_path = odir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.setdefault("images", {})
    for key, spec in json.loads(spec_path.read_text()).items():
        src = SRC / spec["src"]
        dst = odir / spec["out"]
        if not src.exists():
            continue
        if newer(src, dst) or key not in manifest["images"]:
            dst.parent.mkdir(parents=True, exist_ok=True)
            im = Image.open(src)
            im = im.convert("RGBA" if spec.get("alpha") else "RGB")
            if spec.get("width"):
                im = im.resize((spec["width"], round(spec["width"] * im.height / im.width)), Image.LANCZOS)
            im.save(dst, "WEBP", quality=spec.get("quality", 80), method=6)
            manifest["images"][key] = {"src": spec["out"], "w": im.width, "h": im.height}
            print(f"  image common/{key} {im.size}")
    manifest_path.write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    print("cutting sheets…")
    cut_sheets()
    print("packing atlases…")
    build_atlases()
    print("plates and images…")
    build_images()
    build_common_images()
    print("done")
