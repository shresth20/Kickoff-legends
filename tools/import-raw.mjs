#!/usr/bin/env node
/**
 * Copies the ChatGPT downloads into assets/source/ (RAW_DIR) and reports what is missing.
 *   node tools/import-raw.mjs [sourceDir]      (default: ~/Downloads)
 * Files are expected to already carry their canonical names (char_01_idle.png …);
 * "name (1).png" duplicates are tolerated — the newest copy wins. A copy lands in the top of
 * assets/source/, where it wins over the same sheet filed in a sub-folder (characters/, ui/ …).
 */
import { readdirSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { ASSETS, RAW_DIR, rawFile } from './manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] || join(homedir(), 'Downloads'));
const dst = resolve(root, RAW_DIR);
mkdirSync(dst, { recursive: true });

// every raw sheet: the assets plus the arms-up line-ups of the crowd (`cheer`)
const wanted = new Map(ASSETS.flatMap((a) => [a.name, a.cheer].filter(Boolean)).map((n) => [n, null]));
const files = readdirSync(src).filter((f) => /\.png$/i.test(f));
for (const f of files) {
  const base = basename(f, '.png').replace(/\s*\(\d+\)$/, '');
  if (!wanted.has(base)) continue;
  const p = join(src, f);
  const m = statSync(p).mtimeMs;
  const prev = wanted.get(base);
  if (!prev || m > prev.mtime) wanted.set(base, { path: p, mtime: m });
}

let copied = 0;
const missing = [];
for (const [name, hit] of wanted) {
  if (!hit) {
    if (!rawFile(name)) missing.push(name);
    continue;
  }
  copyFileSync(hit.path, join(dst, `${name}.png`));
  copied++;
}
console.log(`copied ${copied} file(s) from ${src} → ${dst}`);
if (missing.length) {
  console.log(`missing ${missing.length}: ${missing.join(', ')}`);
  console.log('Generate the missing ones from the prompt table in the plan, download, and re-run.');
  process.exitCode = 1;
} else {
  console.log('all raw assets present — run: npm run assets:build');
}
