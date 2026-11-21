#!/usr/bin/env python3
"""
Character frames: raw ChatGPT strips -> clean, steady frames for the characters atlas.

tools/slice-sheet.mjs runs this once for all the character strips it builds (a JSON job on stdin,
see main()) and packs the frames it writes: they come out at their final size, each with its
place in the CHAR_CELL cell. Three fixes over cutting a strip at its empty columns and centring
every frame on its own box:

  1. key     the magenta is taken back out of every edge pixel (a pixel there is
             a*colour + (1-a)*magenta), so the ink outline round a white or yellow shirt has no
             pink rim. Solid art is never touched: a bright shirt stays exactly as drawn.
  2. cut     a frame is its figure (one connected drawing) plus the loose bits nearest to it
             (kick swooshes, hurt stars, super sparks). A neighbour's boot or ponytail reaching
             under this frame's columns stays with its own figure; specks are dropped.
  3. steady  every frame is placed by the body, not by its box (tools/sprite_stabilizer.py):
               planted sheets (idle, land, kicks, header, super, hurt, celebrate, lose): the
                 foot on the ground stays put - both feet, or a kick's support foot
               run: the head runs on a smooth path, the legs swing under it
               jump: the torso stays over one point, each frame on its own feet (physics
                 supplies the arc)
             Size pops are scaled back; in the idle and the run the head's frame-to-frame zig-zag
             is smoothed too, with a small shear / squash about the feet (STATES). The first frame
             of every sheet stands with its torso on the cell's centre line, so switching
             animations doesn't jump. Each frame is resampled once from the full-size drawing,
             its anchor landing exactly on the cell's centre line and feet line (no rounding
             jitter).

Every character keeps one size across its sheets (CHAR_STAND_PX, sizeRef as in the manifest),
so changing animation never pops the size. A frame running a little past the side of the cell
(a flying kick's speed lines) keeps its place and fades out before the edge; one running far
past it is moved in just enough to fit. The build log says which.

Results are cached in tools/.char-frames/ (git-ignored), keyed by the raw files, the job and
this code. Needs Python 3 with numpy, scipy and Pillow.
"""
import hashlib
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import sprite_stabilizer as S  # noqa: E402

CACHE = HERE / ".char-frames"
VERSION = hashlib.sha1(b"".join((HERE / f).read_bytes() for f in ("char-frames.py", "sprite_stabilizer.py"))).hexdigest()[:12]

# key
BG_DIST = 48        # colour distance to the sheet's magenta below which a pixel is background
CORE_R = 2.5        # px from the background from which a pixel is solid art (kept as drawn)
NEAR_CORE = 4.0     # an edge pixel takes its true colour from solid art this close
# cut
MIN_PX = 40         # loose bits smaller than this (source px) are specks

# How each state is steadied. mode: "plant" (the foot on the ground stays put), "body" (the head
# leads: in-place runs), "torso" (the torso stays over one point, every frame on its own feet).
# smooth: the head path is smoothed too (shear / squash about the feet). Only the loops that
# should be calm get it: in a kick, a header, a hit or a cheer the head's big fast moves are the
# animation, and smoothing them dulls the strike - those keep the planted anchor and the size fix.
# feet (plant): "both" - both feet stay down all through (the anchor is the two boots);
# "support" - the drawing lifts a foot (a kick, a recoil, a knee-up): the foot left standing is
# the anchor. Said here, not guessed: two feet close together read as one in a frame.
# snap: lifts under this fraction of the standing height are drawing noise (the frame stands).
STATES = {
    "idle": dict(mode="plant", feet="both", loop=True, smooth=True),
    "run": dict(mode="body", loop=True, smooth=True, snap=0.015),
    "jump": dict(mode="torso"),
    "land": dict(mode="plant", feet="both"),
    "kick_low": dict(mode="plant", feet="support"),
    "kick_high": dict(mode="plant", feet="support"),
    "header": dict(mode="plant", feet="both"),
    "super": dict(mode="plant", feet="support"),
    "hurt": dict(mode="plant", feet="support"),
    "celebrate": dict(mode="plant", feet="support", loop=True),
    "lose": dict(mode="plant", feet="both"),
}
# A frame running up to this far past the side of the cell (a flying kick's speed lines) keeps
# its place and fades out over FADE px before the edge; further than that, it is moved in.
FADE, FADE_MAX = 32, 64


# --------------------------------------------------------------------------- #
# 1. key
# --------------------------------------------------------------------------- #
def sheet_magenta(P):
    """The sheet's background colour: its border, where that is near magenta (the generated
    backgrounds are a noisy ~(248, 7, 248), not exactly #FF00FF)."""
    b = np.concatenate([P[:8].reshape(-1, 3), P[-8:].reshape(-1, 3), P[:, :8].reshape(-1, 3), P[:, -8:].reshape(-1, 3)])
    pure = np.array([255, 0, 255], np.float32)
    near = b[np.linalg.norm(b - pure, axis=1) < 90]
    return np.median(near, 0).astype(np.float32) if len(near) > 200 else pure


def key(rgb):
    """RGB sheet -> RGBA with the magenta un-mixed out of the edges.

    Background: within BG_DIST of the sheet's magenta M. Solid art: more than CORE_R px from it,
    kept exactly as drawn. In between (the anti-aliased rim) a pixel is a*C + (1-a)*M: C is taken
    from the nearest solid pixel (the ink outline, almost everywhere) and a is the projection onto
    C - M. Where no solid art is near (a thin swoosh or spark), a is the least coverage that
    explains the pixel: darker than M in red or blue, or greener than M (red / blue brighter than
    M is only noise). The colour is then recovered by taking (1-a)*M back out, so it carries no
    magenta. The plain distance key left these rim pixels nearly opaque and pink, because a
    50/50 blend of dark ink and magenta is far from magenta itself."""
    P = rgb.astype(np.float32)
    M = sheet_magenta(P)
    bg = np.linalg.norm(P - M, axis=2) < BG_DIST
    a_min = np.clip(np.maximum.reduce([
        (M[0] - P[..., 0]) / M[0],
        (M[2] - P[..., 2]) / M[2],
        (P[..., 1] - M[1]) / (255 - M[1]),
    ]), 0, 1)
    core = ndimage.distance_transform_edt(~bg) > CORE_R
    dc, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    CM = P[iy, ix] - M
    cm2 = (CM * CM).sum(2)
    a_proj = ((P - M) * CM).sum(2) / np.maximum(cm2, 1)
    use = (dc <= NEAR_CORE) & (cm2 > 60 ** 2)
    a = np.clip(np.maximum(np.where(use, a_proj, a_min), a_min), 0, 1)
    a[core] = 1
    a[bg] = 0
    a[a < 0.06] = 0
    rgb_out = (P - (1 - a)[..., None] * M) / np.maximum(a, 1e-3)[..., None]
    rgb_out[core] = P[core]
    out = np.dstack([np.clip(rgb_out, 0, 255), a * 255]).round().astype(np.uint8)
    out[a == 0] = 0
    return out


# --------------------------------------------------------------------------- #
# 2. cut
# --------------------------------------------------------------------------- #
def col_bands(mask, n):
    """n column bands of a strip, as bands() in slice-sheet.mjs: content runs split by empty
    columns, the smallest run folded into its nearest neighbour until n are left; with fewer runs
    than n (frames touch), cut near each equal step at the emptiest column. [(x0, x1)]"""
    proj = mask.sum(0)
    xs = np.nonzero(proj)[0]
    off = int(xs[0])
    proj = proj[off:int(xs[-1]) + 1]
    L = len(proj)
    min_gap = max(3, round(L * 0.006))
    runs, start, gap, on = [], 0, 0, False
    for i, v in enumerate(proj):
        if v > 0:
            if not on:
                on, start = True, i
            gap = 0
        elif on:
            gap += 1
            if gap >= min_gap:
                runs.append([start, i - gap])
                on = False
    if on:
        runs.append([start, L - 1])
    while len(runs) > n:
        i = min(range(len(runs)), key=lambda k: runs[k][1] - runs[k][0])
        left = runs[i][0] - runs[i - 1][1] if i > 0 else np.inf
        right = runs[i + 1][0] - runs[i][1] if i < len(runs) - 1 else np.inf
        j = i - 1 if left <= right else i + 1
        runs[j] = [min(runs[j][0], runs[i][0]), max(runs[j][1], runs[i][1])]
        runs.pop(i)
    if len(runs) != n:
        step = L / n
        sm = np.convolve(proj, np.ones(7) / 7, mode="same")
        cuts = [0]
        for k in range(1, n):
            e = k * step
            lo, hi = max(cuts[-1] + 1, round(e - 0.3 * step)), min(L - 1, round(e + 0.3 * step))
            cuts.append(min(range(lo, hi + 1), key=lambda i: sm[i] + abs(i - e) * 0.02))
        cuts.append(L)
        runs = [[cuts[k], cuts[k + 1] - 1] for k in range(n)]
    return [(off + a, off + b + 1) for a, b in runs]


def cut_frames(rgba, n):
    """One frame per figure: [(RGBA crop, x0, y0)] left to right, plus the number of specks
    dropped. Each column band's figure is the connected drawing with the most pixels in it; a
    drawing that is the figure of two bands (frames touching) is split between them at the gap.
    Every other piece goes to the figure it is nearest to - a neighbour's boot reaching under
    this frame's columns is part of the neighbour's drawing, so it stays there."""
    a = rgba[..., 3]
    H, W = a.shape
    lab, k = ndimage.label(a > 0, structure=np.ones((3, 3)))
    sizes = np.bincount(lab.ravel(), minlength=k + 1)
    bands = col_bands(a > 24, n)
    mains = []
    for x0, x1 in bands:
        h = np.bincount(lab[:, x0:x1].ravel(), minlength=k + 1)
        h[0] = 0
        mains.append(int(np.argmax(h)))
    cuts = [0] + [(bands[i][1] + bands[i + 1][0]) // 2 for i in range(n - 1)] + [W]
    owner = np.full((H, W), -1, np.int16)
    for b, c in enumerate(mains):
        sel = lab == c
        if mains.count(c) > 1:
            cols = np.zeros(W, bool)
            cols[cuts[b]:cuts[b + 1]] = True
            sel &= cols[None, :]
        owner[sel] = b
    d, (iy, ix) = ndimage.distance_transform_edt(owner < 0, return_indices=True)
    specks = 0
    for c, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None or c in mains:
            continue
        if sizes[c] < MIN_PX:
            specks += 1
            continue
        sub = lab[sl] == c
        y, x = np.unravel_index(int(np.argmin(np.where(sub, d[sl], np.inf))), sub.shape)
        y, x = y + sl[0].start, x + sl[1].start
        owner[sl][sub] = owner[iy[y, x], ix[y, x]]
    out = []
    for b in range(n):
        ys, xs = np.nonzero(owner == b)
        y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
        x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
        crop = np.where((owner[y0:y1, x0:x1] == b)[..., None], rgba[y0:y1, x0:x1], 0).astype(np.uint8)
        out.append((crop, int(x0), int(y0)))
    return out, specks


def box(fig, thr=24):
    ys, xs = np.nonzero(fig[..., 3] > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


# --------------------------------------------------------------------------- #
# 3. steady
# --------------------------------------------------------------------------- #
def torso_x(fig, stand):
    """The torso's centre: the middle of the longest solid run along each row of the chest band
    (arms held out are cut off from it by the background), the median over the band."""
    m = S.main_body(S.solid(fig))
    t = int(S.top_y(fig))
    mids = []
    for y in range(t + int(0.30 * stand), min(m.shape[0], t + int(0.55 * stand))):
        row = np.r_[False, m[y], False]
        e = np.flatnonzero(np.diff(row.astype(np.int8)))
        if len(e) < 2:
            continue
        s, f = e[0::2], e[1::2]
        j = int(np.argmax(f - s))
        mids.append((s[j] + f[j]) / 2)
    return float(np.median(mids)) if mids else fig.shape[1] / 2


def contacts(fig, stand):
    """Where the figure touches the ground: [(x0, x1, centre)] column runs of the main body in
    the bottom 3.5 % of the standing height. centre = the mass centre of the boot standing
    there (the bottom 7 %, those columns)."""
    m = S.main_body(S.solid(fig))
    g = int(S.ground_y(fig))
    band = m[max(0, g - max(3, round(0.035 * stand))):g]
    cols = np.r_[False, band.any(0), False]
    e = np.flatnonzero(np.diff(cols.astype(np.int8)))
    runs = [[s, f] for s, f in zip(e[0::2], e[1::2])]
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] <= 0.02 * stand:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    boot = m[max(0, g - max(4, round(0.07 * stand))):g].astype(np.float64)
    out = []
    for s, f in merged:
        if f - s < 0.03 * stand:
            continue
        w = boot[:, s:f].sum(0)
        out.append((s, f, float((np.arange(s, f) + 0.5) @ w / max(w.sum(), 1))))
    return out


def plant_anchor(figs, tr, stand, air, feet):
    """Anchor x of a planted sheet, per frame. feet "both": the boots (the stabilizer's two-boot
    match, or the bottom band's centre if any frame matches it poorly - one measure for the whole
    sheet, so it never switches between them). feet "support" (a kick's wind-up, strike and
    follow-through stand on one foot): the foot the one-footed frames stand on, followed through
    the two-footed frames by its place under the head. Returns (anchor x, how)."""
    n = len(figs)
    g = [i for i in range(n) if not air[i]]
    C = [contacts(f, stand) if not air[i] else [] for i, f in enumerate(figs)]
    single = [i for i in g if len(C[i]) == 1]
    if feet != "support" or not single:
        good = all(tr[i]["bscore"] >= 0.7 for i in g)
        return np.array([m["bx"] if good else m["fx"] for m in tr]), "boots" if good else "feet"
    hx = np.array([m["hx"] for m in tr])
    rel = {i: C[i][0][2] - hx[i] for i in single}
    ax = np.array([m["fx"] for m in tr])
    for i in g:
        if len(C[i]) == 1:
            ax[i] = C[i][0][2]
        elif C[i]:
            j = min(single, key=lambda s: abs(s - i))
            ax[i] = min((c[2] for c in C[i]), key=lambda x: abs(x - hx[i] - rel[j]))
    return ax, "support foot"


def steady(figs, stand, state, lifts):
    """Plan one sheet: per-frame anchor (figs px) and correction (None = none)."""
    cfg = STATES.get(state, dict(mode="plant"))
    n = len(figs)
    tx = np.array([torso_x(f, stand) for f in figs])
    if cfg["mode"] == "torso" or n < 3:
        ax = S.smooth_once(tx, 0.7) if n >= 3 else tx
        return [(float(ax[i]), S.ground_y(figs[i])) for i in range(n)], [None] * n, f"{cfg['mode']}"
    tr = S.track(figs, stand)
    air = lifts > 0
    first = next((i for i in range(n) if not air[i]), 0)
    smooth = cfg.get("smooth", False)
    # no smoothing: sigma 0 leaves the head path as drawn (only the anchor and the size fix)
    opts = dict(loop=smooth and cfg.get("loop", False), sigma=0.7 if smooth else 0.0, lift=lifts, tr=tr, render=False)
    if cfg["mode"] == "body":
        _, anchors, info = S.stabilize(figs, stand, mode="body", torso_x=tx, **opts)
        how = "head"
    else:
        foot, how = plant_anchor(figs, tr, stand, air, cfg.get("feet", "both"))
        _, anchors, info = S.stabilize(figs, stand, mode="plant", anchor_x=foot, x_offset=tx[first] - foot[first], **opts)
    if smooth:
        how += f", head zig-zag x {info['before']['x']:.1f}->{info['after']['x']:.1f} y {info['before']['h']:.1f}->{info['after']['h']:.1f}"
    sizes = [p["c"] for p in info["corr"]]
    if max(abs(c - 1) for c in sizes) > 1e-3:
        how += f", size pops {min(sizes):.2f}..{max(sizes):.2f}"
    return anchors, info["corr"], how


def trivial(p):
    return p is None or (abs(p["c"] - 1) < 1e-3 and abs(p.get("k", 1) - 1) < 2e-3 and abs(p.get("kx", 0)) < 2e-3
                         and abs(p.get("du", 0)) < 0.5 and abs(p.get("dh", 0)) < 0.5)


def render(src, ss, anchor, p):
    """One frame at its final size from the full-size drawing `src` (scale ss): the correction p
    (in final px) applied about the anchor (src px), then one premultiplied Lanczos pass whose
    source box puts the anchor exactly on a pixel corner. Returns (RGBA, (AX, AY) ints)."""
    ax, ay = anchor
    if not trivial(p):
        q = dict(p)
        q["hn"] = p.get("hn", 1e9) / ss
        q["du"], q["dh"] = p.get("du", 0) / ss, p.get("dh", 0) / ss
        src, (ax, ay) = S.apply_warp(src, (ax, ay), **q)
    h, w = src.shape[:2]
    AX, AY = int(np.floor(ax * ss)) + 3, int(np.floor(ay * ss)) + 3
    OW, OH = int(np.ceil(w * ss)) + 6, int(np.ceil(h * ss)) + 6
    x0, y0 = ax - AX / ss, ay - AY / ss
    x1, y1 = x0 + OW / ss, y0 + OH / ss
    pad = int(np.ceil(max(0, -x0, -y0, x1 - w, y1 - h))) + 4
    al = np.pad(src[..., 3].astype(np.float32) / 255, pad)
    pm = np.pad(src[..., :3].astype(np.float32), ((pad, pad), (pad, pad), (0, 0))) * al[..., None]
    bx = (x0 + pad, y0 + pad, x1 + pad, y1 + pad)

    def rs(ch):
        return np.array(Image.fromarray(np.ascontiguousarray(ch)).resize((OW, OH), Image.LANCZOS, box=bx))

    a2 = np.clip(rs(al), 0, 1)
    rgb = np.stack([rs(pm[..., i]) for i in range(3)], 2) / np.maximum(a2[..., None], 1e-3)
    out = np.dstack([np.clip(rgb, 0, 255), a2 * 255]).round().astype(np.uint8)
    out[out[..., 3] == 0] = 0
    ys, xs = np.nonzero(out[..., 3])
    ty, tx = ys.min(), xs.min()
    return out[ty:ys.max() + 1, tx:xs.max() + 1].copy(), (AX - tx, AY - ty)


# --------------------------------------------------------------------------- #
# per character / per sheet
# --------------------------------------------------------------------------- #
def load(path):
    return np.array(Image.open(path).convert("RGB"))


def calibrate(idle_file, idle_cols):
    """A character's standing height and sqrt(area) / height ratio, from its idle sheet (as
    charCalib() in slice-sheet.mjs: area-sized sheets are scaled by it)."""
    frames, _ = cut_frames(key(load(idle_file)), idle_cols)
    boxes = [box(f) for f, _, _ in frames]
    stand_h = max(b[3] - b[1] for b in boxes)
    area = min(int((f[..., 3] > 128).sum()) for f, _, _ in frames)
    return {"standH": float(stand_h), "k": float(np.sqrt(area) / stand_h)}


def process(job, cal, cfg):
    cell_w, cell_h, feet_y, stand_px = cfg["cellW"], cfg["cellH"], cfg["feetY"], cfg["stand"]
    frames, specks = cut_frames(key(load(job["file"])), job["cols"])
    boxes = [box(f) for f, _, _ in frames]
    tallest = max(b[3] - b[1] for b in boxes)
    if job.get("sizeRef") == "area":
        equiv = np.sqrt(min(int((f[..., 3] > 128).sum()) for f, _, _ in frames)) / cal["k"]
    else:
        equiv = tallest
    ss = stand_px / equiv
    figs = [S.resize(f, ss) for f, _, _ in frames]
    sx = [g.shape[1] / f.shape[1] for g, (f, _, _) in zip(figs, frames)]
    sy = [g.shape[0] / f.shape[0] for g, (f, _, _) in zip(figs, frames)]
    stand = float(np.median([S.ground_y(f) - S.top_y(f) for f in figs]))
    cfg_s = STATES.get(job["state"], {})
    if cfg_s.get("mode") == "torso" or job.get("pivot") == "feet-each":
        lifts = np.zeros(len(figs))
    else:
        # height of each frame's ground line above the strip's floor (the lowest feet)
        grounds = [S.ground_y(f) + y0 * ss for f, (_, _, y0) in zip(figs, frames)]
        lifts = S.grid_lift(grounds, len(figs), stand, snap=cfg_s.get("snap", 0.04))
    anchors, corr, how = steady(figs, stand, job["state"], lifts)
    out_dir = CACHE / job["name"]
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    metas, shifted, faded, clipped = [], [], [], []
    for i, ((src, _, _), (ax, ay), p) in enumerate(zip(frames, anchors, corr)):
        img, (AX, AY) = render(src, ss, (ax / sx[i], ay / sy[i]), p)
        ox, oy = cell_w // 2 - AX, feet_y - AY
        over = max(-ox, ox + img.shape[1] - cell_w)
        if 0 < over <= FADE_MAX:
            # a little past the side (a flying kick's speed lines): keep the frame where it stands
            # (moving it would jerk the planted foot) and fade the overhang out before the edge
            img = img.copy()
            x = np.arange(img.shape[1]) + ox + 0.5  # cell x of each column's centre
            ramp = np.ones(img.shape[1])
            if ox < 0:
                ramp = np.minimum(ramp, np.clip(x / FADE, 0, 1))
            if ox + img.shape[1] > cell_w:
                ramp = np.minimum(ramp, np.clip((cell_w - x) / FADE, 0, 1))
            img[..., 3] = (img[..., 3] * ramp[None, :]).round().astype(np.uint8)
            faded.append(f"{i:02d}:{over}px")
        elif over > 0 and img.shape[1] <= cell_w:
            # far past it: moved in just enough to fit
            nx = min(max(ox, 0), cell_w - img.shape[1])
            shifted.append(f"{i:02d}:{nx - ox:+d}px")
            ox = nx
        # what still doesn't fit is clipped
        cx0, cy0 = max(0, -ox), max(0, -oy)
        cx1, cy1 = min(img.shape[1], cell_w - ox), min(img.shape[0], cell_h - oy)
        lost = int((img[..., 3] > 128).sum()) - int((img[cy0:cy1, cx0:cx1, 3] > 128).sum())
        if lost > 0:
            clipped.append(f"{i:02d}:{lost}px")
        img = img[cy0:cy1, cx0:cx1]
        ys, xs = np.nonzero(img[..., 3])
        if len(ys) and (ys.min() > 0 or xs.min() > 0 or ys.max() < img.shape[0] - 1 or xs.max() < img.shape[1] - 1):
            # trim what the fade emptied
            ty, tx = ys.min(), xs.min()
            img = img[ty:ys.max() + 1, tx:xs.max() + 1]
            cx0, cy0 = cx0 + tx, cy0 + ty
        name = f"{i:02d}.png"
        Image.fromarray(img).save(out_dir / name, compress_level=1)
        metas.append({"file": name, "w": int(img.shape[1]), "h": int(img.shape[0]), "offX": int(ox + cx0), "offY": int(oy + cy0)})
    log = (f"{how}" + (f", {specks} specks dropped" if specks else "")
           + (f", faded out at the cell edge {' '.join(faded)}" if faded else "")
           + (f", moved in to fit the cell {' '.join(shifted)}" if shifted else "")
           + (f", clipped at the cell edge {' '.join(clipped)}" if clipped else ""))
    return {"frames": metas, "log": log, "scale": round(float(ss), 4)}


def job_key(job, cfg):
    st = [os.stat(job["file"])] + ([os.stat(job["idle"]["file"])] if job.get("sizeRef") == "area" else [])
    raw = json.dumps([VERSION, job, cfg, [(s.st_size, s.st_mtime_ns) for s in st]], sort_keys=True)
    return hashlib.sha1(raw.encode()).hexdigest()


def run_sheet(args):
    job, cal, cfg, k = args
    try:
        res = process(job, cal, cfg)
        res["key"] = k
        (CACHE / job["name"] / "meta.json").write_text(json.dumps(res, indent=1))
        return job["name"], res, None
    except Exception as e:  # report and carry on: the slicer falls back for this sheet
        import traceback
        return job["name"], None, f"{e.__class__.__name__}: {e}\n{traceback.format_exc()}"


def run_calib(args):
    char_id, f, cols = args
    return char_id, calibrate(f, cols)


def main():
    """stdin: {"cellW", "cellH", "feetY", "stand", "jobs": [{"name", "file", "state", "cols",
    "charId", "sizeRef", "pivot", "idle": {"file", "cols"}}]}
    stdout: {"version", "sheets": {name: {"dir", "frames": [{file, w, h, offX, offY}], "log",
    "cached"}}, "errors": {name: message}}"""
    req = json.load(sys.stdin)
    cfg = {k: req[k] for k in ("cellW", "cellH", "feetY", "stand")}
    CACHE.mkdir(exist_ok=True)
    sheets, todo = {}, []
    for job in req["jobs"]:
        k = job_key(job, cfg)
        meta = CACHE / job["name"] / "meta.json"
        if meta.exists():
            res = json.loads(meta.read_text())
            if res.get("key") == k and all((CACHE / job["name"] / f["file"]).exists() for f in res["frames"]):
                sheets[job["name"]] = {**res, "dir": str(CACHE / job["name"]), "cached": True}
                continue
        todo.append((job, k))
    errors = {}
    if todo:
        chars = {j["charId"]: (j["idle"]["file"], j["idle"]["cols"]) for j, _ in todo}
        workers = max(1, min(len(todo), os.cpu_count() or 1))
        with ProcessPoolExecutor(workers) as ex:
            cals = dict(ex.map(run_calib, [(c, f, n) for c, (f, n) in chars.items()]))
            for name, res, err in ex.map(run_sheet, [(j, cals[j["charId"]], cfg, k) for j, k in todo]):
                if err:
                    errors[name] = err
                else:
                    sheets[name] = {**res, "dir": str(CACHE / name), "cached": False}
    json.dump({"version": VERSION, "sheets": sheets, "errors": errors}, sys.stdout)


if __name__ == "__main__":
    main()
