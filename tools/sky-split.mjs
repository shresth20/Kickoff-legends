#!/usr/bin/env node
/**
 * Living sky, art side: splits each painted sky into a clear sky plus the things that move in it,
 * so js/ui/SkyLife.js can animate them.
 *
 *   node tools/sky-split.mjs            (also runs at the end of `npm run assets:build`)
 *
 * Input: the raw <sky>.png in assets/source/ when present (full quality, found by rawFile), else the
 * strip slice-sheet.mjs wrote to assets/images/backgrounds/<sky>.webp.
 *
 * The painted skies are flat horizontal bands — every row of sky is one colour — so anything that
 * differs from its row's colour is an object painted on the sky. Objects are found as connected blobs:
 *   - big blobs → clouds. Cut out with alpha, their colour un-mixed from the row colour (so a cloud
 *     drifting sideways composites back exactly), and packed into sky_clouds_<day|night>.webp.
 *   - small blobs → the painted birds / stars. Erased; the game draws live ones (star spots are kept).
 *   - the moon (round, bright) and everything joined to the bottom edge (mountains) stay painted.
 * Writes <sky>_clear.webp, sky_clouds_<id>.webp and sky.js (window.KL_SKY, file:// safe like atlases.js).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BG_DIR, rawFile } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bgDir = resolve(root, BG_DIR);
const encode = (img) => img.webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 });

const SKIES = [
  { key: 'bg_sky', id: 'day' },
  { key: 'bg_sky_night', id: 'night' },
];
const OBJECT_DIFF = 10; // a pixel this far (per channel) from its row's colour belongs to an object
const CLOUD_MIN_W = 80; // narrower blobs are birds / stars
const CLOUD_MIN_AREA = 1200;
const GROW = { cloud: 3, small: 2 }; // px grown around a blob so its anti-aliased rim goes with it
const ALPHA_RAMP = [4, 24]; // colour distance from the row colour → cloud rim alpha 0..1
const STAR_MIN_RISE = 60; // a star is at least this much brighter than its row; fainter specks are noise / glow
const SHEET_W = 2048;
const GAP = 2;

/** Each row's sky colour: the most common colour (bucketed), refined to the mean of the pixels near it. */
function rowColours({ data, width: W, height: H }) {
  const bg = new Float32Array(H * 3);
  const counts = new Map();
  for (let y = 0; y < H; y++) {
    counts.clear();
    let best = 0, bk = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const c = (counts.get(k) || 0) + 1;
      counts.set(k, c);
      if (c > best) (best = c), (bk = k);
    }
    const mr = ((bk >> 10) << 3) + 4, mg = (((bk >> 5) & 31) << 3) + 4, mb = ((bk & 31) << 3) + 4;
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(data[i] - mr) < 8 && Math.abs(data[i + 1] - mg) < 8 && Math.abs(data[i + 2] - mb) < 8) (r += data[i]), (g += data[i + 1]), (b += data[i + 2]), n++;
    }
    bg[y * 3] = r / n;
    bg[y * 3 + 1] = g / n;
    bg[y * 3 + 2] = b / n;
  }
  return bg;
}

/** 8-connected blobs of object pixels. */
function blobs(img, bg) {
  const { data, width: W, height: H } = img;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.max(Math.abs(data[i] - bg[y * 3]), Math.abs(data[i + 1] - bg[y * 3 + 1]), Math.abs(data[i + 2] - bg[y * 3 + 2]));
      if (d > OBJECT_DIFF) mask[y * W + x] = 1;
    }
  }
  const label = new Int32Array(W * H).fill(-1);
  const out = [];
  const stack = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || label[p] >= 0) continue;
    const id = out.length;
    const b = { id, x0: W, y0: H, x1: -1, y1: -1, area: 0, bright: 0, peak: 0, px: [] };
    let sp = 0;
    stack[sp++] = p;
    label[p] = id;
    while (sp) {
      const q = stack[--sp];
      const x = q % W, y = (q / W) | 0;
      b.px.push(q);
      b.area++;
      const lum = (data[q * 4] + data[q * 4 + 1] + data[q * 4 + 2]) / 3;
      const rise = lum - (bg[y * 3] + bg[y * 3 + 1] + bg[y * 3 + 2]) / 3;
      if (lum > 200) b.bright++;
      if (rise > b.peak) b.peak = rise;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (mask[n] && label[n] < 0) (label[n] = id), (stack[sp++] = n);
        }
      }
    }
    b.bright /= b.area;
    b.w = b.x1 - b.x0 + 1;
    b.h = b.y1 - b.y0 + 1;
    out.push(b);
  }
  return out;
}

/**
 * Mountains are whatever touches the bottom edge or spans half the picture; the highest of their
 * peaks is the horizon, and anything reaching below it is left painted (mountain snow, glow).
 */
function classify(found, W, H) {
  const isGround = (b) => b.y1 >= H - 1 || b.w > W / 2;
  const horizon = Math.min(H, ...found.filter(isGround).map((b) => b.y0));
  for (const b of found) {
    const aspect = b.w / b.h;
    if (isGround(b) || b.y1 >= horizon - 2) b.kind = 'ground';
    else if (b.w > 60 && aspect > 0.75 && aspect < 1.33 && b.bright > 0.3) b.kind = 'moon'; // round and bright
    else if (b.w >= CLOUD_MIN_W && b.area >= CLOUD_MIN_AREA) b.kind = 'cloud';
    else b.kind = 'small';
  }
  // faint specks of the moon's soft glow are part of the moon (bright ones are stars beside it)
  for (const m of found.filter((b) => b.kind === 'moon')) {
    const pad = m.w * 0.25;
    for (const b of found) if (b.kind === 'small' && b.peak <= STAR_MIN_RISE && b.x1 > m.x0 - pad && b.x0 < m.x1 + pad && b.y1 > m.y0 - pad && b.y0 < m.y1 + pad) b.kind = 'moon';
  }
  return horizon;
}

/**
 * Inside of a cloud, in its local box: the blob plus any sky it encloses, shrunk by `inset` px.
 * Those pixels are fully opaque — a pale shadow close to the sky colour must not turn see-through.
 */
function solidCore(b, x0, y0, w, h, W, inset) {
  const m = new Uint8Array(w * h);
  for (const q of b.px) m[(((q / W) | 0) - y0) * w + (q % W) - x0] = 1;
  // flood the sky in from the box edge; whatever it can't reach is inside the cloud
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (x >= 0 && y >= 0 && x < w && y < h && !m[i] && !outside[i]) (outside[i] = 1), stack.push(i);
  };
  for (let x = 0; x < w; x++) push(x, 0), push(x, h - 1);
  for (let y = 0; y < h; y++) push(0, y), push(w - 1, y);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1);
  }
  const core = new Uint8Array(w * h);
  for (let y = inset; y < h - inset; y++) {
    for (let x = inset; x < w - inset; x++) {
      let ok = 1;
      for (let dy = -inset; dy <= inset && ok; dy++) for (let dx = -inset; dx <= inset && ok; dx++) if (outside[(y + dy) * w + x + dx]) ok = 0;
      core[y * w + x] = ok;
    }
  }
  return core;
}

/** The blob's pixels grown by r px (square), as a set of pixel indices clipped to the image. */
function grow(b, r, W, H) {
  const set = new Set();
  for (const q of b.px) {
    const x = q % W, y = (q / W) | 0;
    for (let dy = -r; dy <= r; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < W) set.add(ny * W + nx);
      }
    }
  }
  return set;
}

/** Shelf-pack rects (tallest first) into one sheet ≤ SHEET_W wide. Mutates r.sx / r.sy. */
function pack(rects) {
  const order = [...rects].sort((a, b) => b.h - a.h);
  let x = 0, y = 0, shelf = 0, w = 0;
  for (const r of order) {
    if (x + r.w > SHEET_W) (x = 0), (y += shelf + GAP), (shelf = 0);
    r.sx = x;
    r.sy = y;
    x += r.w + GAP;
    shelf = Math.max(shelf, r.h);
    w = Math.max(w, x - GAP);
  }
  return { w, h: y + shelf };
}

async function split({ key, id }) {
  const raw = rawFile(key);
  const strip = join(bgDir, `${key}.webp`);
  const src = raw ?? (existsSync(strip) ? strip : null);
  if (!src) return { report: `SKIP ${key} (no source)` };
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data, width: info.width, height: info.height };
  const W = img.width, H = img.height;
  const bg = rowColours(img);
  const found = blobs(img, bg);
  const horizon = classify(found, W, H);

  const clear = Buffer.from(data);
  const paintSky = (q) => {
    const y = (q / W) | 0;
    clear[q * 4] = Math.round(bg[y * 3]);
    clear[q * 4 + 1] = Math.round(bg[y * 3 + 1]);
    clear[q * 4 + 2] = Math.round(bg[y * 3 + 2]);
    clear[q * 4 + 3] = 255;
  };

  const clouds = [];
  const stars = [];
  let moon = null;
  for (const b of found) {
    if (b.kind === 'ground') continue;
    if (b.kind === 'moon') {
      moon = [b.x0, b.y0, b.w, b.h];
      continue;
    }
    const r = b.kind === 'cloud' ? GROW.cloud : GROW.small;
    const area = grow(b, r, W, H);
    if (b.kind === 'small') {
      // star spot: brightness-weighted centre and size, for the live star drawn in its place
      let sx = 0, sy = 0, sw = 0;
      for (const q of b.px) {
        const wgt = (data[q * 4] + data[q * 4 + 1] + data[q * 4 + 2]) / 765;
        sx += (q % W) * wgt;
        sy += ((q / W) | 0) * wgt;
        sw += wgt;
      }
      // (faint specks are compression noise: erased, not redrawn)
      if (id === 'night' && b.peak > STAR_MIN_RISE) stars.push({ x: +(sx / sw).toFixed(1), y: +(sy / sw).toFixed(1), s: Math.max(b.w, b.h) });
      for (const q of area) paintSky(q);
      continue;
    }
    // cloud: cut out with alpha, un-mixing the row colour from the anti-aliased rim
    const x0 = Math.max(0, b.x0 - r), y0 = Math.max(0, b.y0 - r);
    const w = Math.min(W, b.x1 + r + 1) - x0, h = Math.min(H, b.y1 + r + 1) - y0;
    const core = solidCore(b, x0, y0, w, h, W, 2);
    const px = Buffer.alloc(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      const y = y0 + yy;
      const [br, bgc, bb] = [bg[y * 3], bg[y * 3 + 1], bg[y * 3 + 2]];
      for (let xx = 0; xx < w; xx++) {
        const q = y * W + x0 + xx;
        const o = (yy * w + xx) * 4;
        // fully transparent pixels carry the sky colour, so filtering never bleeds a dark fringe
        let a = 0;
        if (core[yy * w + xx]) a = 1;
        else if (area.has(q)) {
          const d = Math.hypot(data[q * 4] - br, data[q * 4 + 1] - bgc, data[q * 4 + 2] - bb);
          a = Math.min(1, Math.max(0, (d - ALPHA_RAMP[0]) / (ALPHA_RAMP[1] - ALPHA_RAMP[0])));
        }
        const un = (c, s) => (a > 0 ? Math.min(255, Math.max(0, Math.round((c - (1 - a) * s) / a))) : Math.round(s));
        px[o] = un(data[q * 4], br);
        px[o + 1] = un(data[q * 4 + 1], bgc);
        px[o + 2] = un(data[q * 4 + 2], bb);
        px[o + 3] = Math.round(a * 255);
      }
    }
    for (const q of area) paintSky(q);
    clouds.push({ x: x0, y: y0, w, h, px });
  }
  // left → right, as painted
  clouds.sort((a, b) => a.x - b.x);
  stars.sort((a, b) => a.x - b.x);

  const clearKey = `${key}_clear`;
  await encode(sharp(clear, { raw: { width: W, height: H, channels: 4 } }).removeAlpha()).toFile(join(bgDir, `${clearKey}.webp`));
  const sheetKey = `sky_clouds_${id}`;
  const sheet = pack(clouds);
  if (clouds.length) {
    const base = sharp({ create: { width: sheet.w, height: sheet.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
    const layers = clouds.map((c) => ({ input: c.px, raw: { width: c.w, height: c.h, channels: 4 }, left: c.sx, top: c.sy }));
    await encode(base.composite(layers)).toFile(join(bgDir, `${sheetKey}.webp`));
  }
  return {
    report: `OK   ${key} → ${clearKey} + ${clouds.length} cloud(s) in ${sheetKey} (${sheet.w}×${sheet.h})${id === 'night' ? `, ${stars.length} star(s)` : ''}${moon ? ', moon kept' : ''} [${src.endsWith('.png') ? 'raw' : 'strip'}]`,
    data: {
      w: W,
      h: H,
      clear: clearKey,
      sheet: clouds.length ? sheetKey : null,
      // f: frame in the sheet [x, y, w, h]; x / y: where it was painted, in sky texture px
      clouds: clouds.map((c, i) => ({ name: `cloud_${i}`, f: [c.sx, c.sy, c.w, c.h], x: c.x, y: c.y })),
      stars,
      moon, // [x, y, w, h] — stays painted; live stars keep clear of it
      horizon, // sky texture row where the mountains start
    },
  };
}

const out = {};
const report = [];
for (const sky of SKIES) {
  const r = await split(sky);
  report.push(r.report);
  if (r.data) out[sky.key] = r.data;
}
const file = join(bgDir, 'sky.js');
if (Object.keys(out).length) {
  writeFileSync(file, `/* GENERATED by tools/sky-split.mjs — clear skies + drifting clouds + star spots for js/ui/SkyLife.js. Do not edit. */\nwindow.KL_SKY = ${JSON.stringify(out)};\n`);
  report.push(`wrote ${file}`);
}
console.log(report.join('\n'));
