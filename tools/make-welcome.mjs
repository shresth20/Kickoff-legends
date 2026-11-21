#!/usr/bin/env node
/**
 * The welcome screen's art (js/scenes/Menu.js), from the raw images in assets/source/ (found by
 * rawFile: welcome-bg.png in welcome/, ui_logo.png in ui/ — the same logo the ui atlas is cut from):
 *
 *   welcome-bg.png → assets/images/welcome/welcome_bg.webp    the stadium backdrop, as painted
 *   ui_logo.png    → assets/images/welcome/welcome_logo.webp  the logo exactly as drawn: only its flat
 *                    magenta background is keyed out (so the sky shows through, with no purple fringe
 *                    left along the navy outline) and trimmed away
 *                  → welcome_ball.webp + welcome_ball_light.webp + welcome.js: its football, cut out so
 *                    the welcome screen can spin it slowly (see makeLogoBall)
 *
 *   node tools/make-welcome.mjs        (a full node tools/slice-sheet.mjs runs it too)
 *
 * The raw folder is git-ignored like the rest of assets/source/; the outputs are committed. A missing
 * raw image is skipped: the welcome screen then falls back to the stadium and the atlas logo.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_DIR, WELCOME_DIR, rawFile } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, WELCOME_DIR);
mkdirSync(outDir, { recursive: true });

/** Same encoder as the atlases (tools/slice-sheet.mjs): q92 colour, lossless alpha. */
const encode = (img) => img.webp({ quality: 92, alphaQuality: 100, smartSubsample: true, effort: 6 });
const rawOf = (data, width, height) => sharp(data, { raw: { width, height, channels: 4 } });
/** Gaussian blur of a one-byte-per-pixel mask (sharp hands back 3 channels unless told otherwise). */
const blurMask = (mask, width, height, sigma) => sharp(mask, { raw: { width, height, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();

/** Flat #FF00FF → alpha with edge de-spill (the plain key of tools/slice-sheet.mjs). */
function keyMagenta(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
    if (d < 70) {
      data[i + 3] = 0;
    } else if (d < 130) {
      const a = (d - 70) / 60;
      data[i + 3] = Math.round(data[i + 3] * a);
      const spill = Math.max(0, Math.min(r, b) - g) * (1 - a);
      data[i] = Math.max(0, r - spill);
      data[i + 2] = Math.max(0, b - spill);
    }
  }
}

/**
 * Clean edge for art outlined in dark ink on the magenta (the logo). Its outline fades into the
 * magenta over a pixel or two, and those blends (up to ~70 % magenta, e.g. 82,7,141) are too far from
 * magenta for the plain key: they stayed opaque, a purple hairline all round the logo. A blend is
 * a·ink + (1−a)·magenta, so its alpha is how far it sits along the magenta → ink line and its colour
 * is the ink. Only pixels close to that line are touched: the art's own reds, yellows and whites
 * are nowhere near it, and solid ink is left as it is.
 */
function keyInkEdge(data, ink) {
  const v = [ink[0] - 255, ink[1], ink[2] - 255];
  const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  for (let i = 0; i < data.length; i += 4) {
    const d0 = data[i] - 255, d1 = data[i + 1], d2 = data[i + 2] - 255;
    const t = (d0 * v[0] + d1 * v[1] + d2 * v[2]) / vv; // 0 magenta … 1 ink
    if (t >= 0.97) continue;
    const off = Math.hypot(d0 - t * v[0], d1 - t * v[1], d2 - t * v[2]);
    if (off > 48) continue; // not a magenta / ink blend
    // the flat background's own noise reaches t ≈ 0.13: from there up, alpha ramps to full
    const a = Math.min(1, Math.max(0, (t - 0.14) / 0.83));
    data[i] = ink[0];
    data[i + 1] = ink[1];
    data[i + 2] = ink[2];
    data[i + 3] = Math.round(data[i + 3] * a);
  }
}

/** Bounding box of the pixels with alpha above thr, or null. */
function alphaBox(data, width, height, thr = 8) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= thr) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * The logo's football, measured on the raw ui_logo.png (px): the centre and radius of its white rim
 * (a circle fit; the drawn rim strays ±5 px from it), and the navy ring round it that the spinning
 * copy covers (navy all the way round out to ~126 px; only the top pentagon's blue-navy reaches it).
 */
const LOGO_BALL = { x: 1153, y: 211, r: 123.5, ring: 128 };
const LOGO_INK = [16, 20, 64]; // the logo's outline navy, sampled along its outer edge
const RING_INK = [17, 21, 59]; // the navy round the ball

/**
 * The logo's football in two layers, so the welcome screen can spin it while its light stays put:
 *   welcome_ball.webp        its panels with the art's lighting divided out, as a perfectly round
 *                            disc (radius LOGO_BALL.r) in a navy ring (out to .ring) that hides the
 *                            drawn rim's unevenness and the still logo underneath. This one turns.
 *   welcome_ball_light.webp  that lighting (lit top-left, greyer bottom-right) as a grey disc, laid
 *                            over it with multiply. At angle 0 the two give back the drawn ball.
 * The lighting is the white panels' brightness smoothed over the ball (normalised blur, so the navy
 * panels and seams don't pull it down); panel-sized shading (each panel's puffiness) stays on the
 * panels and turns with them.
 */
async function makeLogoBall(data, width) {
  const { x: cx, y: cy, r, ring } = LOGO_BALL;
  const R = Math.ceil(ring + 2), S = R * 2 + 1; // odd size: the centre pixel is the ball's centre
  const n = S * S;
  const px = (i, j) => ((cy - R + j) * width + (cx - R + i)) * 4;
  const dist = (i, j) => Math.hypot(i - R, j - R);
  const lum = new Float32Array(n);
  const lit = Buffer.alloc(n), white = Buffer.alloc(n);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = px(i, j), p = j * S + i;
      const [cr, cg, cb] = [data[k], data[k + 1], data[k + 2]];
      lum[p] = 0.3 * cr + 0.59 * cg + 0.11 * cb;
      if (dist(i, j) < r - 3 && Math.min(cr, cg, cb) > 150 && Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 45) {
        white[p] = 255;
        lit[p] = Math.round(lum[p]);
      }
    }
  }
  const sigma = r / 3.5;
  const [num, den] = await Promise.all([blurMask(lit, S, S, sigma), blurMask(white, S, S, sigma)]);
  const smooth = new Float32Array(n);
  let top = 0;
  for (let p = 0; p < n; p++) {
    smooth[p] = den[p] > 12 ? (num[p] / den[p]) * 255 : NaN;
    if (white[p] && smooth[p] > top) top = smooth[p];
  }
  const panels = Buffer.alloc(n * 4), light = Buffer.alloc(n * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const p = j * S + i, k = px(i, j), d = dist(i, j);
      const shade = Math.min(1, Math.max(0.5, Number.isNaN(smooth[p]) ? 1 : smooth[p] / top));
      const rim = Math.min(1, Math.max(0, d - r + 0.5)); // 0 inside the ball … 1 in the ring
      const alpha = Math.min(1, Math.max(0, ring + 0.5 - d));
      for (let c = 0; c < 3; c++) {
        const ball = Math.min(255, data[k + c] / shade);
        panels[p * 4 + c] = Math.round(ball + (RING_INK[c] - ball) * rim);
        light[p * 4 + c] = Math.round(255 * (shade + (1 - shade) * rim));
      }
      panels[p * 4 + 3] = light[p * 4 + 3] = Math.round(alpha * 255);
    }
  }
  await encode(rawOf(panels, S, S)).toFile(join(outDir, 'welcome_ball.webp'));
  await encode(rawOf(light, S, S)).toFile(join(outDir, 'welcome_ball_light.webp'));
  return S;
}

/**
 * The logo exactly as drawn, keyed (its navy edge blends exactly, keyInkEdge, then the rest of the
 * magenta) and trimmed; then its football in two layers (makeLogoBall), and where that ball sits on
 * the trimmed logo, for the game: assets/images/welcome/welcome.js (a plain script, file:// safe).
 */
async function makeLogo(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  keyInkEdge(data, LOGO_INK);
  keyMagenta(data);
  const box = alphaBox(data, info.width, info.height, 8);
  if (!box) throw new Error(`${file}: nothing left after keying`);
  await encode(rawOf(data, info.width, info.height).extract(box)).toFile(join(outDir, 'welcome_logo.webp'));
  const size = await makeLogoBall(data, info.width);
  const art = { logoBall: { x: LOGO_BALL.x - box.left, y: LOGO_BALL.y - box.top } };
  writeFileSync(join(outDir, 'welcome.js'), `/* GENERATED by tools/make-welcome.mjs: where the logo's football sits on welcome_logo.webp (px). */\nwindow.KL_WELCOME_ART = ${JSON.stringify(art)};\n`);
  return `welcome_logo ${box.width}×${box.height} + welcome_ball(_light) ${size}×${size}, centre ${art.logoBall.x},${art.logoBall.y}`;
}

async function makeBackground(file) {
  const img = sharp(file).removeAlpha();
  const { width, height } = await img.metadata();
  await encode(img).toFile(join(outDir, 'welcome_bg.webp'));
  return `welcome_bg ${width}×${height}`;
}

const JOBS = [
  ['welcome-bg', makeBackground],
  ['ui_logo', makeLogo], // drawn on flat magenta, outlined in navy
];
for (const [name, make] of JOBS) {
  const file = rawFile(name);
  if (!file) {
    console.log(`SKIP ${name} (no ${name}.png in ${RAW_DIR}/)`);
    continue;
  }
  console.log(`OK   ${name} → ${await make(file)}`);
}
