#!/usr/bin/env node
/**
 * Art pipeline: raw ChatGPT images → keyed, sliced, packed atlases.
 *
 *   node tools/slice-sheet.mjs            build everything in the manifest
 *   node tools/slice-sheet.mjs char_01_run  build one asset (debug)
 *   node tools/slice-sheet.mjs --preview  also write a contact sheet per strip to assets/images/preview/
 *
 * For each raw PNG: key the flat magenta (#FF00FF) background to alpha, detect
 * frame columns/rows by alpha projection, normalise every frame of a strip to one
 * cell on a shared feet baseline, then shelf-pack into characters / props / ui / fx
 * atlases (split into ≤4096 px pages: <atlas>.webp, <atlas>-1.webp, …). Writes the pages +
 * atlases.js (window.KL_ATLASES, Phaser JSON-hash format; an array for multi-page
 * atlases) so the game loads them without XHR (file:// safe).
 *
 * Output images are WebP: lossy colour at q92 (indistinguishable from PNG on this cel-shaded art)
 * with lossless alpha, so cut-out edges stay exact. ~4× smaller than PNG.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ASSETS, RAW_DIR, ATLAS_DIR, BG_DIR, PREVIEW_DIR, CHAR_STAND_PX, FAN_STAND_PX, FAN_CELL_W, FAN_CELL_H, FAN_FEET_Y } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PREVIEW = args.includes('--preview');
const only = args.filter((a) => !a.startsWith('--'));
const rawDir = resolve(root, RAW_DIR);
const atlasDir = resolve(root, ATLAS_DIR);
const bgDir = resolve(root, BG_DIR);
const previewDir = resolve(root, PREVIEW_DIR);
for (const d of [atlasDir, bgDir, previewDir]) mkdirSync(d, { recursive: true });

/**
 * The raw PNG for an asset name: assets/image/<name>.png, else the newest "<name>.png" or
 * "<name> (n).png" in one of its sub-folders (new art batches are dropped in as e.g. new2/). null if none.
 */
function rawFile(name) {
  const direct = join(rawDir, `${name}.png`);
  if (existsSync(direct)) return direct;
  let best = null;
  for (const dir of readdirSync(rawDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(join(rawDir, dir.name))) {
      if (!/\.png$/i.test(f) || f.replace(/\.png$/i, '').replace(/\s*\(\d+\)$/, '') !== name) continue;
      const p = join(rawDir, dir.name, f), t = statSync(p).mtimeMs;
      if (!best || t > best.t) best = { p, t };
    }
  }
  return best?.p ?? null;
}

const MAX_ATLAS = 4096;
/** Encoder for every generated atlas page / background strip (see header). */
const encode = (img) => img.webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 });
const pad2 = (i) => String(i).padStart(2, '0');

/* ------------------------------------------------------------------ image ops */

/** Load as RGBA and key magenta → alpha (key: true | 'unmix' | 'glow', see unmixMagenta / keyGlow). Returns {data, width, height}. */
async function loadKeyed(file, { key = true } = {}) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  if (key === 'unmix') unmixMagenta(data);
  else if (key === 'glow') keyGlow(data, info.width, info.height);
  else if (key) keyMagenta(data);
  return { data, width: info.width, height: info.height };
}

/**
 * Key for art with a soft warm glow around its outline (the charged Super coin): the glow (orange
 * fading to a white rim) is blended into the magenta, which the plain key leaves as a pink halo.
 * A pixel is a·colour + (1−a)·magenta; magenta has no green and full blue, so the least alpha that
 * explains it is a = max(green / 255, 1 − blue / 255), and the colour is recovered by taking the
 * magenta back out. That reading is only right for the glow (it would thin out the art's own pinks
 * and purples), so it applies to the pixels reachable from the sheet's border without crossing an
 * ink outline; the rest gets the plain key.
 */
function keyGlow(data, width, height) {
  const n = width * height;
  const outside = new Uint8Array(n);
  const open = (p) => data[p * 4] > 200; // glow and background are all full red; ink outlines are not
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || !open(p)) continue;
    outside[p] = 1;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < n - width) stack.push(p + width);
  }
  const px = new Uint8Array(4);
  for (let p = 0; p < n; p++) {
    const i = p * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    if (!outside[p]) {
      px.set(data.subarray(i, i + 4));
      keyMagenta(px);
      data.set(px, i);
      continue;
    }
    const a = Math.max(g / 255, 1 - b / 255);
    // the flat background (a ≤ 0.07) and stray specks near it (a sheet corner reads ~0.15) fade out
    const k = Math.min(1, Math.max(0, (a - 0.15) / 0.1));
    if (k === 0) {
      data[i + 3] = 0;
      continue;
    }
    const un = (v) => Math.min(255, Math.max(0, Math.round((v - (1 - a) * 255) / a)));
    data[i] = un(r);
    data[i + 1] = Math.min(255, Math.round(g / a));
    data[i + 2] = un(b);
    data[i + 3] = Math.round(data[i + 3] * a * k);
  }
}

/**
 * Exact key for art whose colours are all greys / blues (red ≈ green), like the chain-link fence: its
 * hair-thin wires are mostly blended with the magenta, which the plain key leaves as a pink cast.
 * A pixel is a·colour + (1−a)·magenta; magenta has no green and full red, so with red ≈ green in the
 * colour, a = 1 − (red − green) / 255, and the colour is recovered by taking the magenta back out.
 */
function unmixMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = Math.min(1, Math.max(0, 1 - (r - g) / 255));
    if (a < 0.12) {
      data[i + 3] = 0;
      continue;
    }
    const un = (v) => Math.min(255, Math.max(0, Math.round((v - (1 - a) * 255) / a)));
    data[i] = Math.min(un(r), Math.round(g / a) + 12); // keep red ≈ green (no leftover pink)
    data[i + 1] = Math.min(255, Math.round(g / a));
    data[i + 2] = un(b);
    data[i + 3] = Math.round(data[i + 3] * a);
  }
}

/** In-place chroma key for the flat #FF00FF background with edge de-spill. */
function keyMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // distance to pure magenta, weighted so dark-navy outlines never key
    const d = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
    if (d < 70) {
      data[i + 3] = 0;
    } else if (d < 130) {
      const a = (d - 70) / 60;
      data[i + 3] = Math.round(data[i + 3] * a);
      // de-spill: pull the magenta cast out of edge pixels
      const m = Math.min(r, b);
      const spill = Math.max(0, m - g) * (1 - a);
      data[i] = Math.max(0, r - spill);
      data[i + 2] = Math.max(0, b - spill);
    }
  }
}

const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

function bbox(img, x0 = 0, y0 = 0, x1 = img.width, y1 = img.height, thr = 24) {
  let minX = x1, minY = y1, maxX = x0 - 1, maxY = y0 - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (alphaAt(img, x, y) > thr) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Split a region into `n` bands along an axis using alpha-projection gaps; falls back to equal division.
 * merge: how surplus content runs are folded together until there are `n` —
 *   'smallest' (default) the smallest run joins its nearest neighbour (detached smear lines, stars…);
 *   'nearest'  the two runs with the narrowest gap between them join, so a frame drawn as a ring of
 *              loose pieces (a burst of shards around an empty middle) stays one frame, and a small
 *              frame sitting on its own is not swallowed by its neighbour.
 */
function bands(img, region, n, axis, merge = 'smallest') {
  const len = axis === 'x' ? region.w : region.h;
  const proj = new Array(len).fill(0);
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (alphaAt(img, x, y) > 24) proj[axis === 'x' ? x - region.x : y - region.y]++;
    }
  }
  // find content runs separated by gaps of >= minGap empty lines
  const minGap = Math.max(3, Math.round(len * 0.006));
  const runs = [];
  let inRun = false, start = 0, gap = 0;
  for (let i = 0; i < len; i++) {
    if (proj[i] > 0) {
      if (!inRun) {
        inRun = true;
        start = i;
      }
      gap = 0;
    } else if (inRun) {
      gap++;
      if (gap >= minGap) {
        runs.push([start, i - gap]);
        inRun = false;
      }
    }
  }
  if (inRun) runs.push([start, len - 1]);
  // merge tiny runs (smear lines / stars that detached) into their nearest neighbour until we have n
  let merged = runs.map(([a, b]) => [a, b]);
  while (merged.length > n && merge === 'nearest') {
    let bestI = 0, bestGap = Infinity;
    for (let i = 0; i < merged.length - 1; i++) {
      const g = merged[i + 1][0] - merged[i][1];
      if (g < bestGap) {
        bestGap = g;
        bestI = i;
      }
    }
    merged[bestI] = [merged[bestI][0], merged[bestI + 1][1]];
    merged.splice(bestI + 1, 1);
  }
  while (merged.length > n) {
    let bestI = 0, bestLen = Infinity;
    for (let i = 0; i < merged.length; i++) {
      const l = merged[i][1] - merged[i][0];
      if (l < bestLen) {
        bestLen = l;
        bestI = i;
      }
    }
    const left = bestI > 0 ? merged[bestI][0] - merged[bestI - 1][1] : Infinity;
    const right = bestI < merged.length - 1 ? merged[bestI + 1][0] - merged[bestI][1] : Infinity;
    const into = left <= right ? bestI - 1 : bestI + 1;
    merged[into] = [Math.min(merged[into][0], merged[bestI][0]), Math.max(merged[into][1], merged[bestI][1])];
    merged.splice(bestI, 1);
  }
  let method = 'gaps';
  if (merged.length !== n) {
    // frames touch (smears, auras): cut at the emptiest column near each equal-step boundary
    method = 'valley';
    const step = len / n;
    const sm = proj.map((_, i) => {
      let a = 0, c = 0;
      for (let k = Math.max(0, i - 3); k <= Math.min(len - 1, i + 3); k++) (a += proj[k]), c++;
      return a / c;
    });
    const cuts = [0];
    for (let k = 1; k < n; k++) {
      const e = k * step;
      let best = Math.round(e), bestV = Infinity;
      for (let i = Math.max(cuts[k - 1] + 1, Math.round(e - step * 0.3)); i <= Math.min(len - 1, Math.round(e + step * 0.3)); i++) {
        const v = sm[i] + Math.abs(i - e) * 0.02; // prefer the true gap, tie-break toward the expected spot
        if (v < bestV) (bestV = v), (best = i);
      }
      cuts.push(best);
    }
    cuts.push(len);
    merged = Array.from({ length: n }, (_, i) => [cuts[i], cuts[i + 1] - 1]);
  }
  return {
    method,
    bands: merged.map(([a, b]) => (axis === 'x' ? { x: region.x + a, y: region.y, w: b - a + 1, h: region.h } : { x: region.x, y: region.y + a, w: region.w, h: b - a + 1 })),
  };
}

/**
 * Bounding box of the main subject in a frame region: column runs that are tiny, or small and
 * touching the region edge (slivers of the neighbouring frame), are ignored.
 */
function mainBox(img, region) {
  const b = bbox(img, region.x, region.y, region.x + region.w, region.y + region.h);
  if (!b) return null;
  const col = new Array(b.w).fill(0);
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (alphaAt(img, x, y) > 24) col[x - b.x]++;
  const runs = [];
  let start = -1, gap = 0;
  for (let i = 0; i <= b.w; i++) {
    const on = i < b.w && col[i] > 0;
    if (on) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0 && (++gap >= 3 || i === b.w)) {
      const end = i - gap;
      let mass = 0;
      for (let k = start; k <= end; k++) mass += col[k];
      runs.push({ start, end, mass });
      start = -1;
    }
  }
  if (runs.length <= 1) return b;
  const maxMass = Math.max(...runs.map((r) => r.mass));
  const atEdge = (r) => b.x + r.start <= region.x + 2 || b.x + r.end >= region.x + region.w - 3;
  const keep = runs.filter((r) => r.mass >= maxMass * (atEdge(r) ? 0.35 : 0.08));
  const x0 = b.x + Math.min(...keep.map((r) => r.start)), x1 = b.x + Math.max(...keep.map((r) => r.end)) + 1;
  return bbox(img, x0, b.y, x1, b.y + b.h);
}

const opaqueArea = (img, b) => {
  let a = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (alphaAt(img, x, y) > 128) a++;
  return a;
};

/** Per-character calibration from the idle sheet: standing height and sqrt(area)/height ratio. */
const calibCache = new Map();
async function charCalib(charId) {
  if (calibCache.has(charId)) return calibCache.get(charId);
  const idleSpec = ASSETS.find((a) => a.name === `${charId}_idle`);
  const img = await loadKeyed(rawFile(`${charId}_idle`));
  const { bands: cols } = bands(img, bbox(img), idleSpec.cols, 'x');
  const boxes = cols.map((r) => mainBox(img, r));
  const standH = Math.max(...boxes.map((b) => b.h));
  const rootArea = Math.sqrt(Math.min(...boxes.map((b) => opaqueArea(img, b))));
  const c = { standH, k: rootArea / standH };
  calibCache.set(charId, c);
  return c;
}

/** Crop a region out of a keyed image as a sharp instance. */
function crop(img, r) {
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).extract({ left: r.x, top: r.y, width: r.w, height: r.h });
}

/* ------------------------------------------------------------------- packing */

class Atlas {
  constructor(name) {
    this.name = name;
    this.items = []; // {name, buffer(png), w, h, cellW, cellH, offX, offY}
  }
  add(item) {
    this.items.push(item);
  }
  /**
   * Shelf-pack (tallest first) into as many ≤ MAX_ATLAS pages as needed. Page 0 is `<name>.webp`,
   * later pages `<name>-1.webp`, … Returns one descriptor, or an array of them for a multi-page
   * atlas (Boot loads every page into a single Phaser texture key).
   */
  async write() {
    const items = [...this.items].sort((a, b) => b.h - a.h);
    const PAD = 2;
    const width = this.items.length > 60 ? MAX_ATLAS : 2048;
    const pages = [];
    let page, shelfY, shelfH, x;
    const newPage = () => {
      page = { items: [], w: 0, h: 0 };
      pages.push(page);
      shelfY = shelfH = x = 0;
    };
    newPage();
    for (const it of items) {
      if (x + it.w + PAD > width) {
        x = 0;
        shelfY += shelfH + PAD;
        shelfH = 0;
      }
      if (shelfY + it.h > MAX_ATLAS) newPage();
      it.x = x;
      it.y = shelfY;
      x += it.w + PAD;
      shelfH = Math.max(shelfH, it.h);
      page.w = Math.max(page.w, x);
      page.h = Math.max(page.h, shelfY + it.h);
      page.items.push(it);
    }
    const out = [];
    for (let p = 0; p < pages.length; p++) {
      const pg = pages[p];
      const image = p === 0 ? `${this.name}.webp` : `${this.name}-${p}.webp`;
      // composite to a raw buffer first: sharp applies one output format per pipeline
      const pageBuf = await sharp({ create: { width: pg.w, height: pg.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(pg.items.map((it) => ({ input: it.buffer, left: it.x, top: it.y })))
        .png({ compressionLevel: 0 })
        .toBuffer();
      await encode(sharp(pageBuf)).toFile(join(atlasDir, image));
      const frames = {};
      for (const it of pg.items) {
        frames[it.name] = {
          frame: { x: it.x, y: it.y, w: it.w, h: it.h },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: it.offX, y: it.offY, w: it.w, h: it.h },
          sourceSize: { w: it.cellW, h: it.cellH },
          ...it.data, // extra keys reach the game as frame.customData
        };
      }
      console.log(`  atlas ${image}: ${pg.items.length} frames, ${pg.w}×${pg.h}`);
      out.push({ frames, meta: { image, size: { w: pg.w, h: pg.h }, scale: '1' } });
    }
    return out.length === 1 ? out[0] : out;
  }
}

const atlases = Object.fromEntries(['characters', 'props', 'ui', 'fx', 'crowd'].map((k) => [k, new Atlas(k)]));
const report = [];

/**
 * Normalise a list of frame regions (from one strip) into cells.
 * Shared scale = cellH*fill / tallest frame, so the feet baseline is consistent.
 */
async function emitStrip(img, regions, spec, outPrefix, names) {
  const cellW = spec.cellW ?? spec.cell;
  const cellH = spec.cellH ?? spec.cell;
  const boxes = regions.map((r) => (spec.atlas === 'characters' ? mainBox(img, r) : bbox(img, r.x, r.y, r.x + r.w, r.y + r.h)));
  if (boxes.some((b) => !b)) throw new Error(`${spec.name}: empty frame detected`);
  const atlas = atlases[spec.atlas];

  if (spec.keepAspect) {
    // UI pieces: fit each frame into maxSize by its own aspect
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const scale = Math.min(1, spec.maxSize / Math.max(b.w, b.h));
      const w = Math.max(1, Math.round(b.w * scale)), h = Math.max(1, Math.round(b.h * scale));
      const buffer = await crop(img, b).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
      atlas.add({ name: names?.[i] ?? (boxes.length === 1 ? outPrefix : `${outPrefix}/${pad2(i)}`), buffer, w, h, cellW: w, cellH: h, offX: 0, offY: 0 });
    }
    if (PREVIEW) await writePreview(atlas.items.slice(-boxes.length), spec.previewName ?? spec.name);
    return;
  }

  const fill = 0.88;
  const tallest = Math.max(...boxes.map((b) => b.h));
  const widest = Math.max(...boxes.map((b) => b.w));
  let scale = Math.min((cellH * fill) / tallest, (cellW * fill) / widest);
  if (spec.charId && spec.sizeRef) {
    // one consistent on-screen size per character across every animation sheet
    const cal = await charCalib(spec.charId);
    const equivStand = spec.sizeRef === 'area' ? Math.sqrt(Math.min(...boxes.map((b) => opaqueArea(img, b)))) / cal.k : tallest;
    const want = CHAR_STAND_PX / equivStand;
    const fits = Math.min((cellH * 0.99) / tallest, (cellW * 0.99) / widest);
    if (want > fits) report.push(`WARN ${spec.name}: shrunk to ${((fits / want) * 100).toFixed(0)} % to fit the ${cellW}px cell`);
    scale = Math.min(want, fits);
  }
  // common baseline: the lowest pixel across the strip (feet on the floor frames)
  const baseline = Math.max(...boxes.map((b) => b.y + b.h));
  const feetY = Math.round(cellH * (0.5 + fill / 2)); // bottom edge of the fill area
  const packed = []; // [slot on the sheet, atlas item] — spec.skip frames are measured above but not packed
  for (let i = 0; i < boxes.length; i++) {
    if (spec.skip?.includes(i)) continue;
    const b = boxes[i];
    const w = Math.max(1, Math.round(b.w * scale)), h = Math.max(1, Math.round(b.h * scale));
    let offX = Math.round(cellW / 2 - w / 2);
    let offY;
    if (spec.pivot === 'center') offY = Math.round(cellH / 2 - h / 2);
    else if (spec.pivot === 'feet-each') offY = feetY - h; // each frame stands on the floor; physics supplies the arc
    else offY = Math.round(feetY - (baseline - b.y) * scale); // keep vertical offset relative to the shared floor
    offY = Math.max(0, Math.min(cellH - h, offY));
    offX = Math.max(0, Math.min(cellW - w, offX));
    const buffer = await crop(img, b).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    atlas.add({ name: names?.[i] ?? (boxes.length === 1 && spec.kind === 'single' ? outPrefix : `${outPrefix}/${pad2(i)}`), buffer, w, h, cellW, cellH, offX, offY });
    packed.push([i, atlas.items[atlas.items.length - 1]]);
  }
  if (PREVIEW) {
    const n = boxes.length;
    const comps = packed.map(([i, it]) => ({ input: it.buffer, left: i * cellW + it.offX, top: it.offY }));
    // floor line at the feet baseline helps spot size/baseline jumps between strips
    const floor = Buffer.from(`<svg width="${cellW * n}" height="${cellH}"><line x1="0" y1="${feetY}" x2="${cellW * n}" y2="${feetY}" stroke="#00ffff" stroke-width="1"/></svg>`);
    await sharp({ create: { width: cellW * n, height: cellH, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
      .composite([...(spec.pivot === 'center' ? [] : [{ input: floor, left: 0, top: 0 }]), ...comps])
      .png()
      .toFile(join(previewDir, `${spec.previewName ?? spec.name}.png`));
  }
}

/**
 * Perspective goal → two layers that sandwich the players and the ball (js/entities/Goal.js):
 *   <out>/back       the whole goal minus the near side panel's net (drawn behind the players)
 *   <out>/near/00    the near side panel: posts + net (drawn in front of them)
 *   <out>/near/01‥04 the same panel with its net rippling back and settling; the posts never move
 * All are frames of one cell, so a single position + scale lines them up. spec.goal is measured on
 * the art in source px: `near` = the near side panel [x0, y0, x1, y1]; `mouthX` / `barY` / `groundY`
 * = the goal mouth, crossbar top and ground at mid-depth, where the ball and players are. They're
 * stored as fractions of the cell on the back frame (frame.customData.goal), with `posts` (where each
 * post meets the grass).
 */
async function emitGoal(img, spec) {
  const g = spec.goal;
  const W = img.width, H = img.height, d = img.data;
  const c = bbox(img);
  const [nx0, ny0, nx1, ny1] = [Math.max(g.near[0], c.x), Math.max(g.near[1], c.y), Math.min(g.near[2], c.x + c.w), Math.min(g.near[3], c.y + c.h)];
  const nw = nx1 - nx0, nh = ny1 - ny0;
  // frame = the blue tubes and their dark outline; everything else in the panel is net (white) or air
  const isFrame = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
    if (a > 40 && ((b > 120 && b - r > 50) || (r + gg + b) / 3 < 95)) isFrame[i] = 1;
  }
  // distance (px) from the frame inside the panel: the net is tied to the tubes, so it moves less near them
  const dist = new Int16Array(nw * nh).fill(-1);
  const queue = [];
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) if (isFrame[(ny0 + y) * W + nx0 + x]) (dist[y * nw + x] = 0), queue.push(y * nw + x);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % nw, y = (i / nw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < nw && yy < nh && dist[yy * nw + xx] < 0) (dist[yy * nw + xx] = dist[i] + 1), queue.push(yy * nw + xx);
    }
  }
  const smooth = (e0, e1, v) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const free = (i) => smooth(3, 36, dist[i]); // 0 at the tubes … 1 well clear of them
  const back = g.mouth === 'right' ? -1 : 1; // which way is the back of the goal
  /** One frame of the panel: the net pushed by `amp` source px, as a travelling wave from the mouth. */
  const panel = (amp, phase) => {
    const out = Buffer.from(d);
    if (!amp) return out;
    const sample = (x, y, ch) => {
      // bilinear over net pixels only (tubes count as air, so they never smear into the net)
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      let acc = 0, wsum = 0;
      for (const [xx, yy, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
        if (xx < nx0 || yy < ny0 || xx >= nx1 || yy >= ny1) continue;
        const i = yy * W + xx;
        const a = isFrame[i] ? 0 : d[i * 4 + 3] / 255;
        acc += (ch === 3 ? a : d[i * 4 + ch] * a) * w;
        wsum += w;
      }
      return wsum ? acc / wsum : 0;
    };
    for (let y = ny0; y < ny1; y++) {
      for (let x = nx0; x < nx1; x++) {
        const i = y * W + x;
        if (isFrame[i]) continue;
        const u = (x - nx0) / nw, v = (y - ny0) / nh;
        const fromMouth = g.mouth === 'right' ? 1 - u : u;
        const k = free((y - ny0) * nw + (x - nx0)) * Math.sin(Math.PI * v) ** 0.8 * Math.sin(Math.PI * fromMouth + phase);
        const sx = x - back * amp * k, sy = y - Math.abs(amp) * 0.2 * k;
        const a = sample(sx, sy, 3);
        out[i * 4 + 3] = Math.round(a * 255);
        for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] = a > 0.004 ? Math.min(255, Math.round(sample(sx, sy, ch) / a)) : 0;
      }
    }
    return out;
  };

  const s = Math.min(1, spec.maxSize / Math.max(c.w, c.h));
  const cw = Math.round(c.w * s), ch = Math.round(c.h * s);
  const scaled = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).extract({ left: c.x, top: c.y, width: c.w, height: c.h }).resize(cw, ch, { kernel: 'lanczos3' });
  const n = { x: Math.round((nx0 - c.x) * s), y: Math.round((ny0 - c.y) * s) };
  n.w = Math.min(cw - n.x, Math.round(nw * s));
  n.h = Math.min(ch - n.y, Math.round(nh * s));
  const atlas = atlases[spec.atlas];

  // back layer: the near panel's free-hanging net comes out (it lives on the near layer)
  const backBuf = Buffer.from(d);
  for (let y = ny0; y < ny1; y++) for (let x = nx0; x < nx1; x++) if (!isFrame[y * W + x] && free((y - ny0) * nw + (x - nx0)) > 0) backBuf[(y * W + x) * 4 + 3] = 0;
  const frac = (v, o, len) => +((v - o) / len).toFixed(4);
  atlas.add({
    name: `${spec.out}/back`,
    buffer: await scaled(backBuf).png().toBuffer(),
    w: cw, h: ch, cellW: cw, cellH: ch, offX: 0, offY: 0,
    data: {
      goal: {
        mouthX: frac(g.mouthX, c.x, c.w),
        barY: frac(g.barY, c.y, c.h),
        groundY: frac(g.groundY, c.y, c.h),
        near: [frac(nx0, c.x, c.w), frac(ny0, c.y, c.h), frac(nx1, c.x, c.w), frac(ny1, c.y, c.h)],
        posts: (g.posts || []).map(([x, y, depth]) => ({ x: frac(x, c.x, c.w), y: frac(y, c.y, c.h), near: depth === 'near' })),
      },
    },
  });
  // near layer: rest + a ripple that swings back and forth and dies out
  const ripple = [[0, 0], [30, 0], [-20, 0.9], [11, 1.8], [-5, 2.7]];
  for (let f = 0; f < ripple.length; f++) {
    const full = await scaled(panel(...ripple[f])).raw().toBuffer();
    const buffer = await sharp(full, { raw: { width: cw, height: ch, channels: 4 } }).extract({ left: n.x, top: n.y, width: n.w, height: n.h }).png().toBuffer();
    atlas.add({ name: `${spec.out}/near/${pad2(f)}`, buffer, w: n.w, h: n.h, cellW: cw, cellH: ch, offX: n.x, offY: n.y });
  }
  if (PREVIEW) await writePreview(atlas.items.slice(-(ripple.length + 1)), spec.name);
}

/**
 * Split a line-up of `n` fans into one owner per pixel (fan index, or -1 for air).
 * The fans stand close: raised fists touch their neighbours' and the ground shadows run together, so
 * a pixel can't simply go to its connected piece. Instead:
 *   - the gaps between fans are measured over their torsos and legs (fists and shadows touch);
 *   - every fan grows outwards from the middle of its own torso through the drawing (breadth first, all
 *     fans at once), so each pixel goes to the fan it is nearest to *along the drawing* — a fist joins
 *     the body it is attached to, not the neighbour whose fist it touches;
 *   - loose bits that no fan reaches (sparkles…) go to the fan on their side of the gap.
 * Per fan: its box, feet line (bottom of its shadow), legs centre (where it stands) and standing height
 * (feet to the top of the head, read over the legs centre so fists beside the head don't count).
 */
function splitFans(img, n) {
  const W = img.width, H = img.height;
  const c = bbox(img, 0, 0, W, H, 128);
  const shadowTop = c.y + Math.round(c.h * 0.955);
  const torsoTop = c.y + Math.round(c.h * 0.35);
  const { bands: cols, method } = bands(img, { x: c.x, y: torsoTop, w: c.w, h: shadowTop - torsoTop }, n, 'x');
  const cuts = cols.slice(1).map((b, i) => Math.round((cols[i].x + cols[i].w + b.x) / 2));
  const side = (x) => {
    let i = 0;
    while (i < cuts.length && x >= cuts[i]) i++;
    return i;
  };
  const solid = (i) => img.data[i * 4 + 3] > 8;
  const owner = new Int8Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  // seeds: the middle of each fan's torso (its own column band, a little in from the edges)
  cols.forEach((b, i) => {
    const m = Math.round(b.w * 0.2);
    for (let y = torsoTop + Math.round((shadowTop - torsoTop) * 0.1); y < torsoTop + Math.round((shadowTop - torsoTop) * 0.45); y++) {
      for (let x = b.x + m; x < b.x + b.w - m; x++) {
        const p = y * W + x;
        if (solid(p) && owner[p] < 0) (owner[p] = i), (queue[tail++] = p);
      }
    }
  });
  while (head < tail) {
    const p = queue[head++], px = p % W, py = (p / W) | 0, who = owner[p];
    for (let dy = -1; dy <= 1; dy++) {
      const yy = py + dy;
      if (yy < c.y || yy >= c.y + c.h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx, q = yy * W + xx;
        if (xx < c.x || xx >= c.x + c.w || owner[q] >= 0 || !solid(q)) continue;
        owner[q] = who;
        queue[tail++] = q;
      }
    }
  }
  for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (owner[y * W + x] < 0 && solid(y * W + x)) owner[y * W + x] = side(x);

  const fans = [];
  for (let i = 0; i < n; i++) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        if (owner[y * W + x] !== i) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) throw new Error(`fan ${i} is empty`);
    let sx = 0, cnt = 0;
    for (let y = Math.round(y1 - (y1 - y0) * 0.25); y < shadowTop; y++) for (let x = x0; x <= x1; x++) if (owner[y * W + x] === i) (sx += x), cnt++;
    const legsCx = cnt ? sx / cnt : (x0 + x1) / 2;
    const hw = Math.round(c.h * 0.035);
    let head = y1;
    for (let y = y0; y <= y1 && head === y1; y++) for (let x = Math.round(legsCx - hw); x <= legsCx + hw; x++) if (owner[y * W + x] === i) (head = y), (x = Infinity);
    fans.push({ box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, feet: y1 + 1, legsCx, standH: y1 + 1 - head });
  }
  return { owner, fans, method };
}

/**
 * Fans: a calm line-up and the same line-up arms-up (spec.cheer). Every fan becomes two frames of one
 * FAN_CELL — `fan/<out><nn>` and `fan/<out><nn>_cheer` — standing on the same feet line with the middle
 * of its legs on the cell's centre line, so swapping the frames never moves the fan. The two sheets draw
 * the line-up at different sizes, so each sheet gets its own scale: its median fan stands FAN_STAND_PX
 * tall (kids stay smaller than grown-ups).
 */
async function emitFans(spec, calmImg, cheerImg) {
  const median = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];
  const sheets = [calmImg, cheerImg].map((img) => {
    const s = { img, ...splitFans(img, spec.cols) };
    s.scale = FAN_STAND_PX / median(s.fans.map((f) => f.standH));
    return s;
  });
  const atlas = atlases[spec.atlas];
  const added = [];
  for (let i = 0; i < spec.cols; i++) {
    const [a, b] = sheets.map((s) => s.fans[i].standH * s.scale);
    if (Math.abs(a / b - 1) > 0.08) report.push(`NOTE ${spec.name} fan ${i}: calm ${a.toFixed(0)} px vs cheer ${b.toFixed(0)} px tall (hands over the head?)`);
    for (const [k, s] of sheets.entries()) {
      const f = s.fans[i], { box } = f, W = s.img.width;
      // this fan only: a neighbour's fist or shadow inside its box is left out
      const buf = Buffer.alloc(box.w * box.h * 4);
      for (let y = 0; y < box.h; y++) {
        for (let x = 0; x < box.w; x++) {
          const p = (box.y + y) * W + box.x + x;
          if (s.owner[p] === i) s.img.data.copy(buf, (y * box.w + x) * 4, p * 4, p * 4 + 4);
        }
      }
      const w = Math.max(1, Math.round(box.w * s.scale)), h = Math.max(1, Math.round(box.h * s.scale));
      let offX = Math.round(FAN_CELL_W / 2 - (f.legsCx - box.x) * s.scale);
      let offY = Math.round(FAN_FEET_Y - (f.feet - box.y) * s.scale);
      if (offX < 0 || offY < 0 || offX + w > FAN_CELL_W || offY + h > FAN_CELL_H) report.push(`WARN ${spec.name} fan ${i}${k ? ' cheer' : ''}: ${w}×${h} clipped by the ${FAN_CELL_W}×${FAN_CELL_H} cell`);
      offX = Math.max(0, Math.min(FAN_CELL_W - w, offX));
      offY = Math.max(0, Math.min(FAN_CELL_H - h, offY));
      const buffer = await sharp(buf, { raw: { width: box.w, height: box.h, channels: 4 } }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
      const item = { name: `fan/${spec.out}${pad2(i)}${k ? '_cheer' : ''}`, buffer, w, h, cellW: FAN_CELL_W, cellH: FAN_CELL_H, offX, offY, data: { fan: { feet: FAN_FEET_Y, stand: FAN_STAND_PX } } };
      atlas.add(item);
      added.push(item);
    }
  }
  if (PREVIEW) {
    // calm line-up on top, cheer line-up below, on the feet line
    const n = spec.cols, comps = [];
    added.forEach((it, j) => comps.push({ input: it.buffer, left: (j >> 1) * FAN_CELL_W + it.offX, top: (j & 1) * FAN_CELL_H + it.offY }));
    const lines = Buffer.from(`<svg width="${FAN_CELL_W * n}" height="${FAN_CELL_H * 2}"><path d="M0 ${FAN_FEET_Y}H${FAN_CELL_W * n}M0 ${FAN_CELL_H + FAN_FEET_Y}H${FAN_CELL_W * n}" stroke="#00ffff"/>${Array.from({ length: n }, (_, i) => `<path d="M${(i + 0.5) * FAN_CELL_W} 0V${FAN_CELL_H * 2}" stroke="#00ffff" stroke-opacity="0.4"/>`).join('')}</svg>`);
    await sharp({ create: { width: FAN_CELL_W * n, height: FAN_CELL_H * 2, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
      .composite([{ input: lines, left: 0, top: 0 }, ...comps])
      .png()
      .toFile(join(previewDir, `fans_${spec.out}.png`));
  }
  return sheets.map((s) => s.method);
}

/** Contact sheet for free-aspect pieces (buttons, banners, logo…). */
async function writePreview(items, name) {
  const H = Math.max(...items.map((it) => it.h));
  const W = items.reduce((a, it) => a + it.w + 8, 8);
  let x = 8;
  const comps = items.map((it) => {
    const c = { input: it.buffer, left: x, top: 0 };
    x += it.w + 8;
    return c;
  });
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
    .composite(comps)
    .png()
    .toFile(join(previewDir, `${name}.png`));
}

async function processAsset(spec) {
  const file = rawFile(spec.name);
  if (!file) {
    report.push(`SKIP ${spec.name} (no raw file)`);
    return;
  }
  if (spec.kind === 'fans') {
    const cheerFile = rawFile(spec.cheer);
    if (!cheerFile) {
      report.push(`SKIP ${spec.name} (no raw file for ${spec.cheer})`);
      return;
    }
    const methods = await emitFans(spec, await loadKeyed(file), await loadKeyed(cheerFile));
    report.push(`OK   ${spec.name} + ${spec.cheer} → ${spec.atlas}:fan/${spec.out}00..${pad2(spec.cols - 1)} (+ _cheer) (${methods.join(' / ')})`);
    return;
  }
  if (spec.kind === 'background') {
    // Layer strips keep their aspect; Stadium.js places each one in its own screen band.
    const needsKey = !/sky/.test(spec.name);
    const img = await loadKeyed(file, { key: needsKey && (spec.key ?? true) });
    const full = { x: 0, y: 0, w: img.width, h: img.height };
    const [cx0, cy0, cx1, cy1] = spec.crop ?? [];
    const content = spec.crop ? { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 } : needsKey ? bbox(img, 0, 0, img.width, img.height, 128) ?? full : full;
    const regions = spec.rows ? bands(img, content, spec.rows, 'y').bands.map((r) => bbox(img, r.x, r.y, r.x + r.w, r.y + r.h, 128) ?? r) : [content];
    const outs = spec.outs ?? [spec.name];
    for (let i = 0; i < outs.length; i++) {
      const r = regions[i];
      // keep the full source resolution (up to 2560 wide): on 2–3× screens these layers are shown
      // at or above their native size; the far crowd rows are downscaled at runtime (Stadium.js)
      const w = Math.min(2560, r.w), h = Math.round((r.h * w) / r.w);
      await encode(crop(img, r).resize(w, h, { kernel: 'lanczos3' })).toFile(join(bgDir, `${outs[i]}.webp`));
      report.push(`OK   ${spec.name} → background ${outs[i]} ${w}×${h}`);
    }
    return;
  }
  const img = await loadKeyed(file, { key: spec.key ?? true });
  const content = bbox(img);
  if (!content) throw new Error(`${spec.name}: nothing left after keying`);
  if (spec.kind === 'goal') {
    await emitGoal(img, spec);
    report.push(`OK   ${spec.name} → ${spec.atlas}:${spec.out}/back + near/00..04`);
  } else if (spec.kind === 'single') {
    await emitStrip(img, [content], spec, spec.out);
    report.push(`OK   ${spec.name} → ${spec.atlas}:${spec.out}`);
  } else if (spec.kind === 'strip') {
    const { bands: cols, method } = bands(img, content, spec.cols, 'x', spec.merge);
    await emitStrip(img, cols, spec, spec.out, spec.names);
    report.push(`OK   ${spec.name} → ${spec.atlas}:${spec.out}/00..${pad2(spec.cols - 1)} (${method})`);
  } else if (spec.kind === 'grid') {
    const { bands: rows, method } = bands(img, content, spec.rows, 'y');
    const regions = [];
    for (const r of rows) regions.push(...bands(img, bbox(img, r.x, r.y, r.x + r.w, r.y + r.h), spec.cols, 'x').bands);
    await emitStrip(img, regions, spec, spec.out, spec.names);
    report.push(`OK   ${spec.name} → ${spec.atlas}:${spec.out}/00..${pad2(regions.length - 1)} (${method})`);
  } else if (spec.kind === 'rows') {
    const { bands: rows, method } = bands(img, content, spec.rowSpec.length, 'y');
    for (let i = 0; i < rows.length; i++) {
      const rs = spec.rowSpec[i];
      const rowBox = bbox(img, rows[i].x, rows[i].y, rows[i].x + rows[i].w, rows[i].y + rows[i].h);
      const { bands: cols } = bands(img, rowBox, rs.cols, 'x', rs.merge);
      const sub = { ...spec, cell: rs.cell ?? spec.cell, cellW: rs.cellW ?? rs.cell ?? spec.cellW ?? spec.cell, cellH: rs.cellH ?? rs.cell ?? spec.cellH ?? spec.cell, kind: 'strip', previewName: `${spec.name}__${rs.out}` };
      await emitStrip(img, cols, sub, rs.out, rs.names);
    }
    report.push(`OK   ${spec.name} → ${spec.atlas}:${spec.rowSpec.map((r) => r.out).join(', ')} (${method})`);
  }
}

/* ---------------------------------------------------------------------- main */
const todo = only.length ? ASSETS.filter((a) => only.includes(a.name)) : ASSETS;
console.log(`slicing ${todo.length} asset(s) from ${rawDir}`);
for (const spec of todo) {
  try {
    await processAsset(spec);
  } catch (e) {
    report.push(`FAIL ${spec.name}: ${e.message}`);
  }
}
const out = {};
for (const [k, a] of Object.entries(atlases)) if (a.items.length) out[k] = await a.write();
// browser-tab icon from the first ball frame
const ballFrame = atlases.props.items.find((it) => it.name === 'ball/00');
if (ballFrame) await sharp(ballFrame.buffer).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(resolve(root, 'assets/images/favicon.png'));
// merge with any previously written descriptors so partial runs don't wipe other atlases
const descFile = join(atlasDir, 'atlases.js');
let prev = {};
if (existsSync(descFile)) {
  const m = readFileSync(descFile, 'utf8').match(/window\.KL_ATLASES\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (m) try { prev = JSON.parse(m[1]); } catch { /* ignore */ }
}
const merged = { ...prev, ...out };
writeFileSync(descFile, `/* GENERATED by tools/slice-sheet.mjs — Phaser JSON-hash atlas descriptors. Do not edit. */\nwindow.KL_ATLASES = ${JSON.stringify(merged)};\n`);
console.log(report.join('\n'));
console.log(`wrote ${descFile} (${Object.keys(merged).join(', ')})`);
// the living sky is cut from the skies: refresh its clear skies + drifting clouds whenever they're rebuilt
if (todo.some((a) => /^bg_sky/.test(a.name))) await import('./sky-split.mjs');
if (report.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
