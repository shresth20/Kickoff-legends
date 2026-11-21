#!/usr/bin/env node
/**
 * Home-screen / install icons for the web-app manifest (manifest.webmanifest) and iOS
 * (apple-touch-icon): the game logo from the sliced `ui` atlas on the stadium-night navy, written to
 * assets/images/icons/icon-{180,192,512}.png (+ a maskable 512 with the logo inside the safe zone).
 *   node tools/make-icons.mjs      (after node tools/slice-sheet.mjs)
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const atlasDir = resolve(root, 'assets/images/atlases');
const out = resolve(root, 'assets/images/icons');
mkdirSync(out, { recursive: true });

// atlases.js is a classic script (window.KL_ATLASES = …) so the game runs from file://
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(resolve(atlasDir, 'atlases.js'), 'utf8'), sandbox);
const page = [].concat(sandbox.window.KL_ATLASES?.ui || []).find((p) => p.frames?.ui_logo);
if (!page) {
  console.error('ui_logo not found in the ui atlas: run node tools/slice-sheet.mjs first');
  process.exit(1);
}
const f = page.frames.ui_logo.frame;
const logo = await sharp(resolve(atlasDir, page.meta.image)).extract({ left: f.x, top: f.y, width: f.w, height: f.h }).png().toBuffer();

/** size × size icon: radial navy backdrop, the logo `fill` of the width across, centred. */
async function icon(size, fill, name) {
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><radialGradient id="g" cx="50%" cy="42%" r="70%">
        <stop offset="0" stop-color="#2f3784"/><stop offset="0.6" stop-color="#171c4c"/><stop offset="1" stop-color="#0b0e2a"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
  const w = Math.round(size * fill);
  const art = await sharp(logo).resize({ width: w }).toBuffer();
  const { height: h } = await sharp(art).metadata();
  await sharp(bg)
    .composite([{ input: art, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9, adaptiveFiltering: true }) // lossless; PNG because iOS home-screen icons must be
    .toFile(resolve(out, name));
  console.log(`wrote assets/images/icons/${name}`);
}

await icon(180, 0.9, 'icon-180.png');
await icon(192, 0.9, 'icon-192.png');
await icon(512, 0.9, 'icon-512.png');
await icon(512, 0.7, 'icon-512-maskable.png'); // the logo inside the 80 % safe circle
