#!/usr/bin/env python3
"""
Sprite-sheet smoothness check for the character animations in the characters atlas.

For every animation (char_XX/state) it rebuilds each frame's cell from the atlas - the game draws
a character frame from its cell's bottom centre, the feet on the slicer's feet line - and
measures, frame by frame, against that anchor:

  head noise   RMS zig-zag of the head path once its smooth, intended motion is removed
               (periodic fit for loops, gaussian for one-shots) - this is what reads as "jiggle"
  feet slide   how far the planted foot wanders over the grounded frames: the boot that stays
               on the ground the longest (both feet in an idle, the support foot in a kick)
  ground       spread of the lowest solid row over the grounded frames
  size         spread of the head's matched scale (size pops)
  seam         loops only: head jump last->first vs the median step

Values are logical screen px at the match size (cell px x PLAYER_SPRITE_SIZE x player scale /
cell: js/entities/Player.js, js/data/tuning.js); size in %.

Run:   python3 tools/sprite-qa.py                     all character animations
       python3 tools/sprite-qa.py char_01 char_02/run  animations whose key starts so
       python3 tools/sprite-qa.py --strict             exit 1 if any animation fails
       python3 tools/sprite-qa.py --atlas=DIR          check the atlas in another folder
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

import sprite_stabilizer as S

ROOT = Path(__file__).resolve().parent.parent
ATLAS = next((Path(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--atlas=")), ROOT / "assets" / "images" / "atlases")

FEET = 0.94                    # feet line, fraction of the cell (slice-sheet.mjs: 0.5 + FILL / 2)
SCREEN = 240 * 0.73            # logical px a cell is drawn at in a match (PLAYER_SPRITE_SIZE x scale)
# pass limits (screen px; size in %)
LIMIT = {"noise": 1.0, "slide": 0.75, "ground": 0.75, "size": 3.0, "seam": 1.5}
LOOPS = ("/idle", "/run", "/celebrate")
# sheets whose planted foot should not move (the run, the jump and the airborne frames of a
# celebration don't plant; the landing steps from a wide crouch to standing feet together)
PLANTED = ("/idle", "/kick_low", "/kick_high", "/header", "/hurt", "/lose", "/super")
# Head noise is graded where the head should move little and smoothly: the idle and the run.
# Strikes, the super, hit recoils, the jump, the landing, the cheer and the slump are large, fast,
# intended motion that no smoother separates from jitter: reported, not graded.
FAST = ("/kick_low", "/kick_high", "/header", "/super", "/hurt", "/jump", "/land", "/celebrate", "/lose")


def load_atlas():
    txt = (ATLAS / "atlases.js").read_text()
    d = json.loads(re.search(r"window\.KL_ATLASES\s*=\s*(\{.*\});?\s*$", txt, re.S).group(1))
    pages = d["characters"] if isinstance(d["characters"], list) else [d["characters"]]
    anims = defaultdict(list)
    for p in pages:
        for name, fr in p["frames"].items():
            anims[name.rsplit("/", 1)[0]].append((name, p["meta"]["image"], fr))
    return {k: sorted(v) for k, v in anims.items()}


_pages = {}


def cells_of(frames):
    out = []
    for _, image, fr in frames:
        if image not in _pages:
            _pages[image] = np.array(Image.open(ATLAS / image).convert("RGBA"))
        f, o, src = fr["frame"], fr["spriteSourceSize"], fr["sourceSize"]
        cell = np.zeros((src["h"], src["w"], 4), np.uint8)
        cell[o["y"]:o["y"] + f["h"], o["x"]:o["x"] + f["w"]] = _pages[image][f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
        out.append(cell)
    return out


def contacts(fig, stand):
    """Boots on the ground: the x of each column run touching the lowest 3.5 % of the figure."""
    m = S.main_body(S.solid(fig))
    g = int(S.ground_y(fig))
    band = m[max(0, g - max(3, round(0.035 * stand))):g]
    cols = np.r_[False, band.any(0), False]
    e = np.flatnonzero(np.diff(cols.astype(np.int8)))
    boot = m[max(0, g - max(4, round(0.07 * stand))):g].astype(np.float64)
    out = []
    for s, f in zip(e[0::2], e[1::2]):
        if f - s >= 0.03 * stand:
            w = boot[:, s:f].sum(0)
            out.append(float((np.arange(s, f) + 0.5) @ w / max(w.sum(), 1)))
    return out


def planted_slide(figs, grounded, stand):
    """Spread of the boot that stays put: every boot of the first grounded frame is followed to
    the nearest boot of each next grounded frame; the steadiest of those tracks."""
    idx = [i for i in range(len(figs)) if grounded[i]]
    C = [contacts(figs[i], stand) for i in idx]
    best = None
    for x0 in C[0]:
        track, x = [x0], x0
        for cs in C[1:]:
            if cs:
                x = min(cs, key=lambda c: abs(c - x))
                track.append(x)
        s = float(np.std(track))
        best = s if best is None else min(best, s)
    return best


def check(key, frames):
    figs = cells_of(frames)
    n = len(figs)
    if n < 3:
        return None
    k = SCREEN / figs[0].shape[0]
    ax, ay = figs[0].shape[1] / 2, figs[0].shape[0] * FEET
    loop = key.endswith(LOOPS)
    stand = float(np.median([S.ground_y(f) - S.top_y(f) for f in figs]))
    tr = S.track(figs, stand)
    g = np.array([m["ground"] for m in tr])
    grounded = g >= g.max() - 0.04 * stand
    res = {"frames": n, "loop": loop}
    rx = np.array([m["hx"] - ax for m in tr])
    rh = np.array([ay - m["hy"] for m in tr])
    sm = (lambda v: S.smooth_loop(v, 2)) if loop else (lambda v: S.smooth_once(v, 1.0))
    res["noise"] = k * float(np.sqrt(((rx - sm(rx)) ** 2 + (rh - sm(rh)) ** 2).mean()))
    good = np.array([m["hscore"] >= 0.75 for m in tr])
    if good.sum() >= 3:
        hs = np.array([m["scale"] for m in tr])[good]
        res["size"] = 100 * float(np.std(hs / np.median(hs)))
    if loop:
        steps = np.hypot(np.diff(np.r_[rx, rx[0]]), np.diff(np.r_[rh, rh[0]]))
        res["seam"] = k * float(max(0.0, steps[-1] - np.median(steps[:-1])))
    if key.endswith(PLANTED) and grounded.sum() >= 3:
        s = planted_slide(figs, grounded, stand)
        if s is not None:
            res["slide"] = k * s
    if grounded.sum() >= 3:
        res["ground"] = k * float(np.std(g[grounded]))
    graded = dict(LIMIT)
    if key.endswith(FAST):
        graded.pop("noise")
        graded.pop("size")  # a strike turns the head and pushes it at the camera
    res["fail"] = [m for m, lim in graded.items() if res.get(m, 0) > lim]
    return res


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    strict = "--strict" in sys.argv
    anims = load_atlas()
    keys = [k for k in sorted(anims) if not args or any(k.startswith(a) for a in args)]
    print(f"{'animation':22s} {'n':>3s} {'head noise':>10s} {'feet slide':>10s} {'ground':>7s} {'size %':>7s} {'seam':>6s}")
    fails = 0
    totals = defaultdict(list)
    for key in keys:
        r = check(key, anims[key])
        if r is None:
            continue
        for m in ("noise", "slide", "ground", "size", "seam"):
            if m in r:
                totals[m].append(r[m])
        cell = lambda m, w: (f"{r[m]:{w}.2f}" + ("!" if m in r["fail"] else " ")) if m in r else " " * w + " "
        print(f"{key:22s} {r['frames']:3d} {cell('noise', 9)} {cell('slide', 9)} {cell('ground', 6)} {cell('size', 6)} {cell('seam', 5)}")
        fails += bool(r["fail"])
    print(f"{'mean':22s} {'':3s} " + " ".join(f"{np.mean(totals[m]):{w}.2f} " if totals[m] else " " * (w + 1)
                                           for m, w in (("noise", 9), ("slide", 9), ("ground", 6), ("size", 6), ("seam", 5))))
    print(f"\n{len(keys)} animations, {fails} over the limits {LIMIT} (! marks the value; screen px at match size;"
          f" head noise and size are not graded on strikes, hits and jumps)")
    if strict and fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
