#!/usr/bin/env python3
"""Generate art for a village pack with OpenRouter image models.

  python3 tools/art/generate.py plates <village>        missing clean plates
  python3 tools/art/generate.py sheets [sheet ...]      missing sprite sheets
  python3 tools/art/generate.py extra <village>         missing one-off images (map, posters)
  python3 tools/art/generate.py spend                   credit used so far

Options:
  --force      regenerate even if the file exists (the old one is kept as .prev)
  --dry        print prompts and the estimated cost, generate nothing
  --only a,b   restrict to these keys

Prompts live next to the art:
  art_src/<village>/plates.json   {"model", "common", "plates": {scene_id: prompt}}
  art_src/sheets.json             {"style", "sheetRules", "sheets": {name: {model, items, prompt}}}
  art_src/<village>/extra.json    one-off images; entries with a "prompt" can be generated

Everything is matched to one style reference (art_src/style_ref.webp) so a new
village looks like it belongs to the same game. After generating, run
`python3 tools/art/build.py` to cut, pack and publish the assets.
"""
import json, sys, pathlib, subprocess, shutil
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = ROOT / "art_src"
sys.path.insert(0, str(HERE))
from orgen import generate, spent  # noqa: E402

STYLE_REF = SRC / "style_ref.webp"
SHEET_REF = SRC / "sheet_ref.png"
EST = {"openai/gpt-5.4-image-2": 0.34, "google/gemini-3.1-flash-image": 0.07, "google/gemini-3-pro-image": 0.14}
args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
FORCE, DRY = "--force" in flags, "--dry" in flags
ONLY = set(flags["--only"].split(",")) if "--only" in flags else None


def ref_png(src, size):
    """Downscaled PNG copy of a reference image (cheaper to upload)."""
    from PIL import Image
    out = ROOT / "scratch_art" / f"_ref_{src.parent.name}_{src.stem}_{size}.png"
    out.parent.mkdir(exist_ok=True)
    if not out.exists():
        im = Image.open(src).convert("RGB")
        im.thumbnail((size, size))
        im.save(out)
    return str(out)


def run(jobs):
    """jobs: list of (key, out_path, model, prompt, refs, aspect, size)."""
    todo = [j for j in jobs if (ONLY is None or j[0] in ONLY) and (FORCE or not pathlib.Path(j[1]).exists())]
    cost = sum(EST.get(j[2], 0.2) for j in todo)
    print(f"{len(todo)} image(s) to generate, about ${cost:.2f}. Spent so far: ${spent():.2f}")
    if DRY:
        for j in todo:
            print(f"\n--- {j[0]} -> {j[1]} ({j[2]})\n{j[3][:600]}...")
        return
    def one(j):
        key, out, model, prompt, refs, aspect, size = j
        out = pathlib.Path(out)
        if out.exists():
            shutil.copy(out, out.with_suffix(out.suffix + ".prev"))
        tmp = out.with_suffix(".png")
        path, c = generate(prompt, str(tmp), model=model, aspect=aspect, size=size, refs=refs)
        if out.suffix == ".webp":
            from PIL import Image
            Image.open(tmp).convert("RGB").save(out, "WEBP", quality=95, method=6)
            tmp.unlink()
        print(f"  {key}: saved {out.relative_to(ROOT)} (${c})")
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(one, todo))
    print(f"Done. Total spent: ${spent():.2f}")


def plates(village):
    cfg = json.loads((SRC / village / "plates.json").read_text())
    model = cfg.get("model", "openai/gpt-5.4-image-2")
    jobs = []
    for sid, prompt in cfg["plates"].items():
        refs = [ref_png(STYLE_REF, 512)]
        # optional per-scene reference (e.g. an earlier crop of the same place)
        if cfg.get("refDir"):
            r = SRC / village / cfg["refDir"] / f"{sid}.webp"
            if r.exists():
                refs.append(ref_png(r, 768))
        jobs.append((sid, SRC / village / "plates" / f"{sid}.webp", model, cfg["common"] + " " + prompt, refs,
                     cfg.get("aspect", "3:2"), cfg.get("size", "2K")))
    run(jobs)


def sheets(names):
    cfg = json.loads((SRC / "sheets.json").read_text())
    jobs = []
    for name, s in cfg["sheets"].items():
        if names and name not in names:
            continue
        model = s.get("model", "google/gemini-3.1-flash-image")
        if s["prompt"].startswith("OVERRIDE:"):
            prompt = cfg["style"] + " " + s["prompt"][9:] + " The background must be one perfectly flat, solid, uniform pure magenta colour (#FF00FF) with no texture, no shadows and no gradients. No text anywhere."
        else:
            prompt = cfg["style"] + " " + cfg["sheetRules"] + " " + s["prompt"]
        refs = []
        if "gemini" in model and SHEET_REF.exists():
            refs = [ref_png(SHEET_REF, 512)]
            prompt = "Match the illustration style of the reference image exactly. " + prompt
        jobs.append((name, SRC / "sheets" / f"{name}.png", model, prompt, refs, "1:1", None))
    run(jobs)


def extra(village):
    cfg = json.loads((SRC / village / "extra.json").read_text())
    refs = [ref_png(STYLE_REF, 512)]
    jobs = []
    for key, spec in cfg.items():
        if "prompt" not in spec:
            continue
        jobs.append((key, SRC / spec["src"], spec.get("model", "openai/gpt-5.4-image-2"), spec["prompt"], refs, spec.get("aspect", "3:2"), spec.get("size", "2K")))
    run(jobs)


if __name__ == "__main__":
    if not args:
        print(__doc__)
        sys.exit(0)
    cmd = args[0]
    if cmd == "plates":
        plates(args[1])
    elif cmd == "sheets":
        sheets(args[1:])
    elif cmd == "extra":
        extra(args[1])
    elif cmd == "spend":
        print(f"${spent():.2f} spent on image generation so far")
    else:
        print(__doc__)
