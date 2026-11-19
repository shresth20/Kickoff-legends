#!/usr/bin/env python3
"""Cuts the sheets in raw-assets/ into the data asset-viewer.html plays.

Writes assets/viewer/:
  sprites/<id>.png  one strip per animation: frames side by side in equal
                    cells, every frame's feet on the same baseline and its body
                    centred on the same x, all animations at one character scale
  rig/<part>.png    parts cut from the parts sheets for the cut-out rig preview
  manifest.js       window.ASSET_VIEWER: what the strips and parts contain

Run it again after adding or changing a sheet (and add the sheet to SHEETS):

    python3 tools/build_asset_viewer.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'raw-assets'
OUT = ROOT / 'assets' / 'viewer'

IDLE_HEIGHT = 340   # px: the idle character's height in the strips
ALPHA_MIN = 24      # pixels at or below this alpha are background
PAD = 6             # px of empty space around each cell

# rows: frames per row, top to bottom.
# anims: frames are numbered row by row, left to right, from 0.
#   action: the animation key in ART_SPEC.md / RIG_SPEC.md it covers
#   air: in-air frames are drawn higher on the sheet (viewer can keep that height)
SHEETS = [
    dict(file='Chibi Soccer Player Idle Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='idle', action='idle', label='Idle', frames=(0, 8), fps=10, loop=True)]),
    dict(file='Chibi Footballer Running Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='run', action='run', label='Run', frames=(0, 8), fps=16, loop=True)]),
    dict(file='Backpedalling Footballer Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='run_back', action='run_back', label='Backpedal', frames=(0, 8), fps=16, loop=True)]),
    dict(file='Dynamic Footballer Running Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='sprint', action='sprint', label='Sprint', frames=(0, 8), fps=20, loop=True)]),
    dict(file='Chibi Footballer Animation Sprite Sheet.png', rows=[8, 8], anims=[
        dict(id='walk', action='walk', label='Walk (top row)', frames=(0, 8), fps=12, loop=True),
        dict(id='sprint_alt', action='sprint', label='Sprint (bottom row)', frames=(8, 16), fps=20, loop=True)]),
    # The tucked and crouched frames hide part of the body, so every part of
    # the jump takes its size from the whole sequence.
    dict(file='Chibi Athlete Jump Animation Sprite Sheet.png', rows=[5, 5], anims=[
        dict(id='jump', action='jump', label='Whole jump', frames=(0, 10), fps=12, loop=False, air=True),
        dict(id='jump_start', action='jump_start', label='Crouch and push off', frames=(0, 3), fps=24, loop=False, air=True, size_from='jump'),
        dict(id='jump_up', action='jump_up', label='Rising tuck', frames=(3, 5), fps=10, loop=True, air=True, size_from='jump'),
        dict(id='jump_down', action='jump_down', label='Falling', frames=(5, 7), fps=10, loop=True, air=True, size_from='jump'),
        dict(id='land', action='land', label='Land and stand up', frames=(7, 10), fps=24, loop=False, size_from='jump')]),
    dict(file='Chibi Soccer Player Kick Animation Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='kick_low', action='kick_low', label='Ground kick', frames=(0, 8), fps=24, loop=False)]),
    dict(file='Chibi Soccer Player Volley Kick Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='kick_high', action='kick_high', label='Volley kick', frames=(0, 8), fps=24, loop=False)]),
    dict(file='Airborne Soccer Kick Sprite Sheet.png', rows=[3, 3], anims=[
        dict(id='air_kick', action='air_kick', label='Airborne kick', frames=(0, 6), fps=24, loop=False, air=True)]),
    dict(file='Five-Frame Soccer Header Sequence.png', rows=[5], anims=[
        dict(id='header', action='header', label='Header', frames=(0, 5), fps=24, loop=False)]),
    dict(file='image-gen-1(20261021-215729).png', rows=[3, 3], anims=[
        dict(id='charge_dash', action='skill', label='Charge and dash', frames=(0, 6), fps=12, loop=False)]),
    dict(file='Soccer Ball Surprise_ Four-Frame Chibi Sequence.png', rows=[4], anims=[
        dict(id='hit', action='hit', label='Hit by the ball', frames=(0, 4), fps=12, loop=False)]),
    dict(file='Dizzy Soccer Star Wobble Sequence.png', rows=[6], anims=[
        dict(id='stunned', action='stunned', label='Dizzy wobble', frames=(0, 6), fps=12, loop=True)]),
    dict(file='Chibi Soccer Victory Jump Sprite Sheet.png', rows=[4, 4], anims=[
        dict(id='celebrate', action='celebrate', label='Victory jump', frames=(0, 8), fps=12, loop=True, air=True)]),
    dict(file='Eight-Frame Chibi Athlete Celebration Sprite Sheet.png', rows=[8], anims=[
        dict(id='celebrate_alt', action='celebrate', label='Celebration', frames=(0, 8), fps=12, loop=True, air=True)]),
    dict(file='Embarrassed Footballer Pose Sequence.png', rows=[6], anims=[
        dict(id='sad', action='sad', label='Embarrassed', frames=(0, 6), fps=10, loop=True)]),
    dict(file='Chibi Footballer Win and Lose Sprite Sheet.png', rows=[8, 6], strip_badges=True, anims=[
        dict(id='win', action='win', label='Win', frames=(0, 8), fps=12, loop=True, air=True),
        # Kneeling hides part of the body, so take the size from the win frames.
        dict(id='lose', action='lose', label='Lose', frames=(8, 14), fps=10, loop=True, size_from='win')]),
]

# Sheets with no animation in them; the viewer shows them as they are.
STILLS = [
    dict(file='Chibi Football Character Parts Sheet.png', kind='parts',
         note='Rig parts: 6 heads, torso, upper arms, whole arms with hands, thigh, shin, boot.'),
    dict(file='Chibi Footballer Sprite Parts Sheet.png', kind='parts',
         note='Rig parts: 6 heads, torso (near arm drawn on), 5 upper arms, 5 forearms, shorts, shins, boots.'),
    dict(file='Six Chibi Profile Expressions.png', kind='parts',
         note='6 head expressions: neutral, wink, angry, shout, sad, dizzy.'),
    dict(file='Disassembled Cartoon Football Leg Sprite Sheet.png', kind='parts',
         note='Thigh, shin and boot at 5 angles each.'),
    dict(file='Right-Facing Football Leg Sprite Sheet.png', kind='parts',
         note='Thigh, shin and boot at 6 angles each.'),
    dict(file='Chibi Soccer Star Character Sheet.png', kind='reference',
         note='Character turnaround (side, front, back) and 4 head expressions.'),
]

# Rig preview parts: (sheet, crop box x, y, w, h). The largest shape in the box is used.
RIG_PARTS = {
    'torso':    ('Chibi Football Character Parts Sheet.png', (330, 350, 245, 335)),
    'upperArm': ('Chibi Football Character Parts Sheet.png', (92, 398, 140, 240)),
    'forearm':  ('Chibi Footballer Sprite Parts Sheet.png', (680, 444, 100, 150)),
    'thigh':    ('Chibi Football Character Parts Sheet.png', (770, 722, 190, 320)),
    'shin':     ('Chibi Football Character Parts Sheet.png', (1012, 766, 132, 270)),
    'boot':     ('Chibi Football Character Parts Sheet.png', (1200, 888, 205, 150)),
}
RIG_HEADS = ('Six Chibi Profile Expressions.png', ['neutral', 'wink', 'angry', 'shout', 'sad', 'dizzy'])

# Bone lengths in rig units, from js/rig/parts.js: each part is scaled so the
# distance between its two joints matches.
RIG_LENGTH = {'upperArm': 40, 'thigh': 56, 'shin': 56, 'torso': 90}
RIG_BELOW_PIVOT = {'forearm': 58, 'boot': 26}  # pivot to the bottom edge
RIG_HEAD_HEIGHT = 180


def load(name):
    """RGBA array; sheets on a flat magenta background get it keyed out."""
    a = np.array(Image.open(RAW / name).convert('RGBA'))
    if (a[..., 3] < 16).mean() > 0.01:
        return a
    f = a[..., :3].astype(np.float32)
    magenta = (np.minimum(f[..., 0], f[..., 2]) - f[..., 1]) / 255
    alpha = np.clip(1 - (magenta - 0.25) / 0.45, 0, 1)
    alpha[alpha < 0.08] = 0
    # Undo the magenta blended into anti-aliased edges.
    key = np.array([240, 16, 240], np.float32)
    rgb = (f - (1 - alpha[..., None]) * key) / np.maximum(alpha, 1e-3)[..., None]
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)


def strip_badges(a):
    """Clears the green/red labels and frame-number badges drawn on a sheet."""
    r, g, b = (a[..., i].astype(int) for i in range(3))
    solid = a[..., 3] > 40
    color = (((g > r + 60) & (g > b + 20)) | ((r > 170) & (r - g > 100) & (r - b > 60))) & solid
    lab, _ = ndi.label(ndi.binary_dilation(color, iterations=2))
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if (color[sl] & (lab[sl] == i)).sum() >= 900:  # mouths are smaller
            a[max(sl[0].start - 3, 0):sl[0].stop + 3, max(sl[1].start - 3, 0):sl[1].stop + 3] = 0


class Piece:
    """A set of pixels on a sheet."""

    def __init__(self, ys, xs):
        self.ys, self.xs = ys, xs
        self.area = len(ys)
        self.x0, self.x1 = int(xs.min()), int(xs.max()) + 1
        self.cx, self.cy = float(xs.mean()), float(ys.mean())

    def take(self, sel):
        return Piece(self.ys[sel], self.xs[sel])

    def split_x(self):
        """Two pieces, cut at the emptiest column near the middle."""
        cols = np.bincount(self.xs - self.x0, minlength=self.x1 - self.x0)
        w = self.x1 - self.x0
        lo, hi = int(w * 0.3), int(w * 0.7)
        cut = self.x0 + lo + int(np.argmin(cols[lo:hi]))
        return split(self, self.xs < cut, lambda q: q.xs == cut - 1, lambda q: q.xs == cut)


def join(pieces):
    return Piece(np.concatenate([p.ys for p in pieces]), np.concatenate([p.xs for p in pieces]))


def shapes(p):
    """The piece's connected shapes."""
    y0 = p.ys.min()
    m = np.zeros((p.ys.max() + 1 - y0, p.x1 - p.x0), bool)
    m[p.ys - y0, p.xs - p.x0] = True
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    ids = lab[p.ys - y0, p.xs - p.x0]
    return [p.take(ids == i) for i in range(1, n + 1)]


def split(p, in_a, at_cut_a, at_cut_b):
    """The pixels where in_a holds, and the rest. A bit the cut separates from
    its side's main shape belongs to the frame across the cut (a boot tip or
    a tuft of hair), so it moves there."""
    keep, move = [], []
    for side, at_cut in ((p.take(in_a), at_cut_a), (p.take(~in_a), at_cut_b)):
        parts = sorted(shapes(side), key=lambda q: -q.area)
        stray = [q for q in parts[1:] if at_cut(q).any()]
        keep.append([parts[0]] + [q for q in parts[1:] if not at_cut(q).any()])
        move.append(stray)
    return join(keep[0] + move[1]), join(keep[1] + move[0])


def pieces_of(mask, dilate=2, min_area=25):
    lab, _ = ndi.label(ndi.binary_dilation(mask, iterations=dilate))
    lab[~mask] = 0
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        ys, xs = np.nonzero(lab[sl] == i)
        if len(ys) >= min_area:
            out.append(Piece(ys + sl[0].start, xs + sl[1].start))
    return out


def cut_frames(a, rows):
    """Frames in reading order; each is a list of pieces, the body first."""
    mask = a[..., 3] > ALPHA_MIN
    H = mask.shape[0]
    profile = mask.sum(1)
    bounds = [0]
    for i in range(1, len(rows)):
        mid, win = H * i // len(rows), H // (3 * len(rows))
        bounds.append(mid - win + int(np.argmin(profile[mid - win:mid + win])))
    bounds.append(H)

    by_row = [[] for _ in rows]
    for p in pieces_of(mask):
        sels = [(p.ys >= bounds[r]) & (p.ys < bounds[r + 1]) for r in range(len(rows))]
        spans = [r for r, s in enumerate(sels) if s.sum() > 0.2 * p.area]
        if len(spans) > 1:  # frames from two rows touch
            r, cut = spans[0], bounds[spans[0] + 1]
            assert spans == [r, r + 1], 'a frame spans more than two rows'
            above, below = split(p, p.ys < cut, lambda q: q.ys == cut - 1, lambda q: q.ys == cut)
            by_row[r].append(above)
            by_row[r + 1].append(below)
        else:
            by_row[int(np.searchsorted(bounds, p.cy, 'right')) - 1].append(p)

    frames = []
    for pieces, n in zip(by_row, rows):
        pieces.sort(key=lambda p: -p.area)
        big = [p for p in pieces if p.area >= 0.3 * pieces[0].area]
        small = pieces[len(big):]
        row = [[p] for p in big]
        while len(row) < n:  # neighbouring frames touch
            i = max(range(len(row)), key=lambda i: row[i][0].x1 - row[i][0].x0)
            row[i:i + 1] = [[q] for q in row[i][0].split_x()]
        row.sort(key=lambda f: f[0].cx)
        while len(row) > n:
            gaps = [row[i + 1][0].x0 - row[i][0].x1 for i in range(len(row) - 1)]
            i = int(np.argmin(gaps))
            row[i] += row.pop(i + 1)
            row[i].sort(key=lambda p: -p.area)
        for s in small:  # balls, wobble lines, sweat drops
            dist = lambda f: max(f[0].x0 - s.cx, s.cx - f[0].x1, 0)
            min(row, key=dist).append(s)
        frames += row
    return frames


def frame_image(a, pieces):
    """The frame's pixels on a transparent crop, with its soft edges."""
    ys = np.concatenate([p.ys for p in pieces])
    xs = np.concatenate([p.xs for p in pieces])
    y0, y1 = max(ys.min() - 3, 0), min(ys.max() + 4, a.shape[0])
    x0, x1 = max(xs.min() - 3, 0), min(xs.max() + 4, a.shape[1])
    keep = np.zeros((y1 - y0, x1 - x0), bool)
    keep[ys - y0, xs - x0] = True
    keep = ndi.binary_dilation(keep, iterations=2)
    crop = a[y0:y1, x0:x1].copy()
    crop[~keep] = 0
    return crop, x0, y0


def resize(crop, s):
    im = Image.fromarray(crop).convert('RGBa')
    size = (max(1, round(im.width * s)), max(1, round(im.height * s)))
    return im.resize(size, Image.LANCZOS).convert('RGBA')


def build_anim(a, frames, spec, scale, sheet, rows):
    first, last = spec['frames']
    picked = frames[first:last]
    bodies = [f[0] for f in picked]
    row_of = np.repeat(np.arange(len(rows)), rows)[first:last]
    bottoms = np.array([b.ys.max() for b in bodies], float)
    ground = {r: bottoms[row_of == r].max() for r in set(row_of)}

    images, anchors, rects = [], [], []
    for f, body in zip(picked, bodies):
        crop, x0, y0 = frame_image(a, f)
        images.append(resize(crop, scale))
        anchors.append(((body.cx - x0) * scale, (body.ys.max() + 1 - y0) * scale))
        rects.append([int(x0), int(y0), int(crop.shape[1]), int(crop.shape[0])])

    left = max(ax for ax, _ in anchors)
    right = max(im.width - ax for im, (ax, _) in zip(images, anchors))
    up = max(ay for _, ay in anchors)
    down = max(im.height - ay for im, (_, ay) in zip(images, anchors))
    cell_w, cell_h = int(np.ceil(left + right)) + 2 * PAD, int(np.ceil(up + down)) + 2 * PAD
    anchor = (PAD + int(np.ceil(left)), PAD + int(np.ceil(up)))

    strip = Image.new('RGBA', (cell_w * len(images), cell_h))
    for i, (im, (ax, ay)) in enumerate(zip(images, anchors)):
        strip.alpha_composite(im, (i * cell_w + round(anchor[0] - ax), round(anchor[1] - ay)))
    strip.save(OUT / 'sprites' / f"{spec['id']}.png", optimize=True)

    return dict(
        id=spec['id'], action=spec['action'], label=spec['label'], sheet=sheet,
        src=f"assets/viewer/sprites/{spec['id']}.png",
        frames=len(images), fps=spec['fps'], loop=spec['loop'], air=spec.get('air', False),
        cell=[cell_w, cell_h], anchor=list(anchor),
        lift=[round((ground[r] - b) * scale, 1) for r, b in zip(row_of, bottoms)],
        rects=rects,
    )


def largest_piece(a, box):
    x, y, w, h = box
    sub = a[y:y + h, x:x + w]
    p = max(pieces_of(sub[..., 3] > ALPHA_MIN), key=lambda p: p.area)
    crop, x0, y0 = frame_image(sub, [p])
    return crop, crop[..., 3] > ALPHA_MIN


def mid_x(mask, y0, y1):
    xs = np.nonzero(mask[max(int(y0), 0):max(int(y1), 1)])[1]
    return float(xs.mean())


def rig_part(name, crop, mask):
    """Pivot (and child joint) of a part drawn hanging straight down, in px."""
    h, w = mask.shape
    ys = np.nonzero(mask.any(1))[0]
    top, bottom = ys.min(), ys.max() + 1
    r = 0.3 * w  # rounded joint ends are about this deep
    if name == 'boot':
        pivot = (mid_x(mask, top, top + 0.25 * h), top + 0.14 * h)
        return pivot, RIG_BELOW_PIVOT['boot'] / (bottom - pivot[1])
    if name == 'torso':
        hip, neck = top + 0.88 * h, top + 0.06 * h
        k = RIG_LENGTH['torso'] / (hip - neck)
        # The skeleton puts the neck 2 units right of the hip pivot; keep the
        # drawn neck under the head.
        return (mid_x(mask, top, neck + 0.04 * h) - 2 / k, hip), k
    pivot = (mid_x(mask, top, top + 2 * r), top + r)
    if name == 'forearm':
        return pivot, RIG_BELOW_PIVOT['forearm'] / (bottom - pivot[1])
    joint = bottom - r
    return pivot, RIG_LENGTH[name] / (joint - pivot[1])


def save_rig_part(file, crop, pivot, k):
    Image.fromarray(crop).save(OUT / 'rig' / file, optimize=True)
    h, w = crop.shape[:2]
    return dict(src=f'assets/viewer/rig/{file}', size=[w, h], pivot=[round(pivot[0], 1), round(pivot[1], 1)], k=round(k, 5))


def build_rig():
    sheets = {}
    parts = {}
    for name, (file, box) in RIG_PARTS.items():
        a = sheets.setdefault(file, load(file))
        crop, mask = largest_piece(a, box)
        pivot, k = rig_part(name, crop, mask)
        parts[name] = save_rig_part(f'{name}.png', crop, pivot, k)

    file, names = RIG_HEADS
    a = load(file)
    heads = sorted(pieces_of(a[..., 3] > ALPHA_MIN), key=lambda p: -p.area)[:len(names)]
    heads.sort(key=lambda p: (round(p.cy / 200), p.cx))
    parts['heads'] = {}
    for name, p in zip(names, heads):
        crop, _, _ = frame_image(a, [p])
        h, w = crop.shape[:2]
        # 3/4 view facing right: the neck sits under the back of the jaw.
        parts['heads'][name] = save_rig_part(f'head_{name}.png', crop, (0.44 * w, 0.93 * h), RIG_HEAD_HEIGHT / h)
    return dict(sources=sorted({f for f, _ in RIG_PARTS.values()} | {file}), parts=parts)


def main():
    (OUT / 'sprites').mkdir(parents=True, exist_ok=True)
    (OUT / 'rig').mkdir(parents=True, exist_ok=True)

    cut = []
    for sheet in SHEETS:
        a = load(sheet['file'])
        if sheet.get('strip_badges'):
            strip_badges(a)
        frames = cut_frames(a, sheet['rows'])
        assert len(frames) == sum(sheet['rows']), (sheet['file'], len(frames))
        cut.append((sheet, a, frames))

    # One character scale for every strip: the body's pixel area hardly changes
    # with the pose, so match each animation's median area to the idle's.
    def median_area(frames, spec):
        first, last = spec['frames']
        return float(np.median([f[0].area for f in frames[first:last]]))

    idle_sheet, _, idle_frames = cut[0]
    idle_spec = idle_sheet['anims'][0]
    idle_height = np.median([f[0].ys.max() - f[0].ys.min() for f in idle_frames])
    base = IDLE_HEIGHT / idle_height
    idle_area = median_area(idle_frames, idle_spec)

    anims, scales = [], {}
    for sheet, a, frames in cut:
        for spec in sheet['anims']:
            if 'size_from' in spec:
                scale = scales[spec['size_from']]
            else:
                scale = base * np.sqrt(idle_area / median_area(frames, spec))
            scales[spec['id']] = scale
            anims.append(build_anim(a, frames, spec, scale, sheet['file'], sheet['rows']))
            print(f"{spec['id']:14s} {anims[-1]['frames']} frames  cell {anims[-1]['cell']}  scale {scale:.3f}")

    manifest = dict(
        idleHeight=IDLE_HEIGHT,
        anims=anims,
        stills=[dict(s, src=f"raw-assets/{s['file']}") for s in STILLS],
        rig=build_rig(),
    )
    (OUT / 'manifest.js').write_text(
        '// Generated by tools/build_asset_viewer.py. Do not edit.\n'
        f'window.ASSET_VIEWER = {json.dumps(manifest, indent=1)};\n')
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
