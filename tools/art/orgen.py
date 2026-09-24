#!/usr/bin/env python3
"""OpenRouter image generation helper.

Usage (CLI):
  python3 tools/art/orgen.py --model google/gemini-3.1-flash-image \
      --aspect 2:3 --size 2K --out out.png "prompt text" [--ref ref.png ...]

The API key is read from the OPENROUTER_API_KEY environment variable.
Every call is appended to tools/art/.spend.log so we can keep track of credit.
"""
import argparse, base64, json, os, sys, time, urllib.request, pathlib

API = "https://openrouter.ai/api/v1/chat/completions"
LOG = pathlib.Path(__file__).with_name(".spend.log")


def _data_url(path):
    ext = pathlib.Path(path).suffix.lower().lstrip(".") or "png"
    mime = {"jpg": "jpeg"}.get(ext, ext)
    b = base64.b64encode(open(path, "rb").read()).decode()
    return f"data:image/{mime};base64,{b}"


def generate(prompt, out, model="google/gemini-3.1-flash-image", aspect=None, size=None,
             refs=(), retries=3, timeout=300):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set")
    content = [{"type": "text", "text": prompt}]
    for r in refs:
        content.append({"type": "image_url", "image_url": {"url": _data_url(r)}})
    body = {
        "model": model,
        "messages": [{"role": "user", "content": content if refs else prompt}],
        "modalities": ["image", "text"],
        "usage": {"include": True},
    }
    cfg = {}
    if aspect:
        cfg["aspect_ratio"] = aspect
    if size:
        cfg["image_size"] = size
    if cfg:
        body["image_config"] = cfg
    data = json.dumps(body).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API, data=data, headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/johnhickling-wq/villagepostcard",
                "X-Title": "Postcard Perfect art pipeline",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                res = json.loads(resp.read())
            msg = res["choices"][0]["message"]
            imgs = msg.get("images") or []
            if not imgs:
                last = f"no image returned: {str(msg.get('content'))[:300]}"
                time.sleep(2 * (attempt + 1))
                continue
            url = imgs[0]["image_url"]["url"]
            raw = base64.b64decode(url.split(",", 1)[1])
            pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
            open(out, "wb").write(raw)
            cost = (res.get("usage") or {}).get("cost")
            with open(LOG, "a") as f:
                f.write(json.dumps({"t": time.time(), "model": model, "out": str(out),
                                    "cost": cost}) + "\n")
            return out, cost
        except Exception as e:  # network / API error: back off and retry
            last = repr(e)
            if hasattr(e, "read"):
                try:
                    last += " " + e.read().decode()[:500]
                except Exception:
                    pass
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f"generation failed for {out}: {last}")


def spent():
    if not LOG.exists():
        return 0.0
    return sum((json.loads(l).get("cost") or 0) for l in LOG.read_text().splitlines() if l.strip())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="google/gemini-3.1-flash-image")
    ap.add_argument("--aspect")
    ap.add_argument("--size")
    ap.add_argument("--ref", action="append", default=[])
    a = ap.parse_args()
    path, cost = generate(a.prompt, a.out, a.model, a.aspect, a.size, a.ref)
    print(f"saved {path} cost={cost} total_spent={spent():.3f}")
