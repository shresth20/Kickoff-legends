#!/usr/bin/env node
/**
 * The on-screen controller's button art (js/ui/TouchControls.js), from the raw sheet ui_pad.png in
 * assets/source/ (found by rawFile): six round buttons on a transparent background, top row ← → Super,
 * bottom row straight kick · long kick · jump, each with its keyboard key printed on a keycap.
 *
 *   ui_pad.png → assets/images/pad/pad.webp   one row of square cells, each button centred in its
 *                                             cell at the same radius: the six buttons, then the
 *                                             Super again with its face turned orange (ready)
 *              → assets/images/pad/pad.js     window.KL_PAD_ART: cell size, button radius, the order
 *                                             of the cells, and where the face and keycap sit
 *
 *   node tools/make-pad.mjs        (a full node tools/slice-sheet.mjs runs it too)
 *
 * On the way:
 *  - the keycaps come off: the game prints the player's own key in code (and none on a touch screen).
 *    The part of the button under a keycap is rebuilt from the art either side of it: a sector at the
 *    bottom, filled ring by ring by blending the pixels at its two edges (rim, outline and face all
 *    run round the circle, so this continues them under the keycap).
 *  - each button is scaled up to the cell's radius with Lanczos, then sharpened, so it stays crisp
 *    when the game draws it at the screen's real pixel density (KL.UIRES).
 *
 * The raw folder is git-ignored like the rest of assets/source/; the outputs are committed. A missing
 * raw sheet is skipped: the game then paints the buttons in code.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAD_DIR, rawFile } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, PAD_DIR);

const CELL = 320; // output cell, px
const R = 150; // every button's outer radius in its cell (the dark outline's outer edge)
// the sheet's buttons, by where they sit: [row][column] → name (the controller's icon names)
const LAYOUT = [
  ['left', 'right', 'super'],
  ['shoot', 'lob', 'jump'],
];

/** Same encoder as the atlases (tools/slice-sheet.mjs): q92 colour, lossless alpha. */
const encode = (img) => img.webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 });

/** Connected blobs of visible pixels (alpha > 16): their bounding boxes, biggest first. */
function blobs(data, W, H) {
  const seen = new Uint8Array(W * H);
  const out = [];
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || data[start * 4 + 3] <= 16) continue;
    const box = { x0: W, x1: 0, y0: H, y1: 0, n: 0 };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % W, y = (j - x) / W;
      box.n++;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
      for (const k of [j - 1, j + 1, j - W, j + W]) {
        if (k < 0 || k >= W * H || seen[k] || data[k * 4 + 3] <= 16) continue;
        if (Math.abs((k % W) - x) > 1) continue; // no wrapping across rows
        seen[k] = 1;
        stack.push(k);
      }
    }
    if (box.n > 500) out.push(box);
  }
  return out.sort((a, b) => b.n - a.n);
}

/**
 * Where a button's circle is. The keycap hangs below it but is narrower, so the widest row gives
 * the diameter and the top edge the centre's height.
 */
const circleOf = (b) => {
  const r = (b.x1 - b.x0 + 1) / 2;
  return { cx: b.x0 + r, cy: b.y0 + r, r };
};

const lum = (d, i) => Math.max(d[i], d[i + 1], d[i + 2]);
const chroma = (d, i) => lum(d, i) - Math.min(d[i], d[i + 1], d[i + 2]);

/** The keycap: the white, colourless pixels low in the button, near its middle (box, px). */
function keycapOf(data, W, c) {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let y = Math.round(c.cy + c.r * 0.45); y < Math.min(c.cy + c.r * 1.5, data.length / 4 / W); y++) {
    for (let x = Math.round(c.cx - c.r * 0.6); x <= c.cx + c.r * 0.6; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > 200 && lum(data, i) > 175 && chroma(data, i) < 45) {
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  return box;
}

/** Inner edge of the gold rim, straight up from the centre (px from the centre). */
function faceOf(data, W, c) {
  for (let d = Math.round(c.r * 0.5); d < c.r; d++) {
    const i = (Math.round(c.cy - d) * W + Math.round(c.cx)) * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 170 && g > 120 && b < 110 && r > b + 80) return d;
  }
  return c.r * 0.8;
}

/** Bilinear sample, premultiplied: [r·a, g·a, b·a, a] with a in 0..1. */
function sample(data, W, H, x, y) {
  x -= 0.5;
  y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const acc = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = Math.min(W - 1, Math.max(0, x0 + dx)), py = Math.min(H - 1, Math.max(0, y0 + dy));
    const i = (py * W + px) * 4, a = data[i + 3] / 255;
    acc[0] += data[i] * a * w;
    acc[1] += data[i + 1] * a * w;
    acc[2] += data[i + 2] * a * w;
    acc[3] += a * w;
  }
  return acc;
}

/**
 * Rebuild the bottom sector |φ| ≤ half (φ measured from straight down) between radii r0 and r1: each
 * pixel blends the two pixels on the sector's edges at its own radius (premultiplied, so the
 * outline's soft edge stays clean).
 */
function fillSector(src, W, H, c, half, r0, r1) {
  const out = Buffer.from(src);
  for (let y = Math.floor(c.cy + r0 * Math.cos(half)); y <= Math.ceil(c.cy + r1) && y < H; y++) {
    for (let x = Math.floor(c.cx - r1); x <= Math.ceil(c.cx + r1); x++) {
      if (x < 0 || x >= W) continue;
      const dx = x + 0.5 - c.cx, dy = y + 0.5 - c.cy;
      const rho = Math.hypot(dx, dy), phi = Math.atan2(dx, dy);
      if (rho < r0 || rho > r1 || Math.abs(phi) > half) continue;
      const t = (phi + half) / (2 * half);
      const sx = rho * Math.sin(half), sy = c.cy + rho * Math.cos(half);
      const a = sample(src, W, H, c.cx - sx, sy), b = sample(src, W, H, c.cx + sx, sy);
      const m = a.map((v, k) => v + (b[k] - v) * t);
      const i = (y * W + x) * 4;
      if (m[3] < 1e-3) {
        out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
        continue;
      }
      out[i] = Math.round(m[0] / m[3]);
      out[i + 1] = Math.round(m[1] / m[3]);
      out[i + 2] = Math.round(m[2] / m[3]);
      out[i + 3] = Math.round(m[3] * 255);
    }
  }
  return out;
}

/** RGB 0..255 → HSL (h in degrees, s and l 0..1) and back. */
function toHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function toRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/**
 * The Super once it is ready: its navy face turned a hot orange, yellower where it is lighter. Only
 * the face moves: it is flood-filled in from just inside the rim through navy pixels, so the gold
 * rim, the flames and the ball (whose navy patches sit inside its white seams and dark outline) keep
 * their colours. size: the cell's side; rFace: the face's radius in it.
 */
function hotFace(data, size, rFace) {
  const out = Buffer.from(data);
  const hsl = (j) => toHsl(data[j * 4], data[j * 4 + 1], data[j * 4 + 2]);
  // the ball: the biggest patch of white, kept out whole (its blue shading would otherwise turn too).
  // Its white panels are split by the navy patches, so the white is grown by a few px to join them.
  const white = new Uint8Array(size * size);
  for (let j = 0; j < size * size; j++) white[j] = data[j * 4 + 3] > 200 && lum(data, j * 4) > 200 && chroma(data, j * 4) < 50 ? 1 : 0;
  const G = 6, joined = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!white[y * size + x]) continue;
      for (let yy = Math.max(0, y - G); yy <= Math.min(size - 1, y + G); yy++) {
        for (let xx = Math.max(0, x - G); xx <= Math.min(size - 1, x + G); xx++) joined[(yy * size + xx) * 4 + 3] = 255;
      }
    }
  }
  const ball = blobs(joined, size, size)[0];
  // (the grown box is G px too big each side; the ball's own dark outline is never face, l < 0.17)
  const bc = ball && { x: (ball.x0 + ball.x1) / 2, y: (ball.y0 + ball.y1) / 2, r: Math.max(ball.x1 - ball.x0, ball.y1 - ball.y0) / 2 - G + 1 };
  const isFace = (j) => {
    if (data[j * 4 + 3] < 200) return false;
    if (bc && Math.hypot((j % size) - bc.x, Math.floor(j / size) - bc.y) < bc.r) return false;
    const [h, s, l] = hsl(j);
    return h >= 200 && h <= 262 && s > 0.3 && l > 0.17;
  };
  const inFace = new Uint8Array(size * size);
  const stack = [];
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2, d = rFace - 6;
    const j = Math.round(size / 2 + Math.sin(t) * d) * size + Math.round(size / 2 + Math.cos(t) * d);
    if (isFace(j)) (inFace[j] = 1), stack.push(j);
  }
  while (stack.length) {
    const j = stack.pop(), x = j % size;
    for (const k of [x > 0 ? j - 1 : -1, x < size - 1 ? j + 1 : -1, j - size, j + size]) {
      if (k < 0 || k >= size * size || inFace[k] || !isFace(k)) continue;
      inFace[k] = 1;
      stack.push(k);
    }
  }
  // grow the mask by a pixel so the face's soft edges against the rim and flames turn too
  const grown = Uint8Array.from(inFace);
  for (let j = size; j < size * (size - 1); j++) {
    if (inFace[j] || data[j * 4 + 3] < 200) continue;
    if (bc && Math.hypot((j % size) - bc.x, Math.floor(j / size) - bc.y) < bc.r) continue;
    if (inFace[j - 1] || inFace[j + 1] || inFace[j - size] || inFace[j + size]) {
      const [h, s] = hsl(j);
      if (h >= 190 && h <= 270 && s > 0.15) grown[j] = 1;
    }
  }
  for (let j = 0; j < size * size; j++) {
    if (!grown[j]) continue;
    // a red-orange (so the gold flames still stand out), turning orange-gold in the gloss
    const i = j * 4, [, s, l] = hsl(j);
    const [r, g, b] = toRgb(Math.min(36, 12 + Math.max(0, l - 0.3) * 70), Math.min(1, 0.6 + s * 0.4), Math.min(0.85, 0.15 + l * 0.98));
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

async function main() {
  const file = rawFile('ui_pad');
  if (!file) {
    console.log('make-pad: no ui_pad.png in assets/source/, skipped (the game paints the buttons)');
    return;
  }
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const found = blobs(data, W, H).slice(0, 6);
  if (found.length !== 6) throw new Error(`make-pad: expected 6 buttons on ${file}, found ${found.length}`);
  // rows by height, then columns by x
  found.sort((a, b) => a.y0 - b.y0);
  const rows = [found.slice(0, 3), found.slice(3)].map((row) => row.sort((a, b) => a.x0 - b.x0));

  const cells = {};
  const measured = [];
  let src = data;
  for (const [ri, row] of rows.entries()) {
    for (const [ci, blob] of row.entries()) {
      const name = LAYOUT[ri][ci];
      const c = circleOf(blob);
      const key = keycapOf(src, W, c);
      const face = faceOf(src, W, c);
      // the sector that holds the keycap (its outline and soft shadow too), from straight down
      const pad = 6; // the keycap's dark outline and soft shadow reach a few px past its white
      const corners = [[key.x0 - pad, key.y0 - pad], [key.x1 + 1 + pad, key.y0 - pad], [key.x0 - pad, key.y1 + 1 + pad], [key.x1 + 1 + pad, key.y1 + 1 + pad]];
      const half = Math.max(...corners.map(([x, y]) => Math.abs(Math.atan2(x - c.cx, y - c.cy)))) + (4 * Math.PI) / 180;
      const r0 = key.y0 - pad - c.cy;
      const r1 = Math.max(...corners.map(([x, y]) => Math.hypot(x - c.cx, y - c.cy))) + 2;
      src = fillSector(src, W, H, c, half, r0, r1);
      measured.push({ name, ...c, face, key });
      cells[name] = c;
      console.log(
        `${name.padEnd(6)} centre ${c.cx.toFixed(1)},${c.cy.toFixed(1)} r ${c.r.toFixed(1)} · face ${(face / c.r).toFixed(3)} · keycap ${key.x1 - key.x0 + 1}×${key.y1 - key.y0 + 1} at +${((key.y0 + key.y1) / 2 - c.cy).toFixed(1)} · sector ±${((half * 180) / Math.PI).toFixed(1)}° from r ${r0.toFixed(1)}`,
      );
    }
  }

  // each button: crop round its circle, scale to radius R in a CELL² square, sharpen
  const order = ['left', 'right', 'super', 'shoot', 'lob', 'jump'];
  // a crop may run past the sheet's edge: pad the sheet first (sharp extends after it extracts)
  const EXT = 160;
  const clean = await sharp(src, { raw: { width: W, height: H, channels: 4 } })
    .extend({ top: EXT, bottom: EXT, left: EXT, right: EXT, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const tiles = [];
  for (const name of order) {
    const c = cells[name];
    const k = R / c.r, half = CELL / 2 / k; // source px from the centre to the cell's edge
    const box = { left: Math.round(c.cx - half), top: Math.round(c.cy - half), size: Math.round(half * 2) };
    const tile = await sharp(clean)
      .extract({ left: box.left + EXT, top: box.top + EXT, width: box.size, height: box.size })
      .resize(CELL, CELL, { kernel: 'lanczos3' })
      .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 })
      .raw()
      .toBuffer();
    tiles.push({ name, data: tile });
  }
  const sup = tiles.find((t) => t.name === 'super');
  const superFace = measured.find((m) => m.name === 'super');
  tiles.push({ name: 'super_hot', data: hotFace(sup.data, CELL, (superFace.face / superFace.r) * R) });

  const sheet = sharp({ create: { width: CELL * tiles.length, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(
    tiles.map((t, i) => ({ input: t.data, raw: { width: CELL, height: CELL, channels: 4 }, left: i * CELL, top: 0 })),
  );
  mkdirSync(outDir, { recursive: true });
  await encode(sheet).toFile(join(outDir, 'pad.webp'));

  // where the face and the keycap sit, as shares of the outer radius (the five plain buttons'
  // average: the Super's keycap is drawn the same size as theirs)
  const plain = measured.filter((m) => m.name !== 'super');
  const avg = (f) => +(plain.reduce((s, m) => s + f(m), 0) / plain.length).toFixed(3);
  const art = {
    cell: CELL,
    r: R,
    frames: tiles.map((t) => t.name),
    face: avg((m) => m.face / m.r),
    keycap: {
      y: avg((m) => ((m.key.y0 + m.key.y1 + 1) / 2 - m.cy) / m.r),
      w: avg((m) => (m.key.x1 - m.key.x0 + 1) / m.r),
      h: avg((m) => (m.key.y1 - m.key.y0 + 1) / m.r),
    },
    superFace: +(measured.find((m) => m.name === 'super').face / cells.super.r).toFixed(3),
  };
  writeFileSync(
    join(outDir, 'pad.js'),
    `/* GENERATED by tools/make-pad.mjs: the controller's button art (pad.webp). Do not edit. */\nwindow.KL_PAD_ART = ${JSON.stringify(art)};\n`,
  );
  console.log(`wrote ${PAD_DIR}/pad.webp (${tiles.length} cells of ${CELL}px) + pad.js`, art);
}

await main();
