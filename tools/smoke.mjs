#!/usr/bin/env node
/**
 * Headless smoke test: boots the game in Chromium, walks Boot → Menu → CharSelect
 * (incl. the night toggle) → Match (plays a few seconds) → Pause → Result, captures a screenshot of
 * each screen into tools/.smoke/ and fails on any console error.
 *   node tools/smoke.mjs [--keep]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'tools/.smoke');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

const url = 'file://' + resolve(root, 'index.html') + '?renderer=canvas';
await page.goto(url);
const shot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
const scene = async () => page.evaluate(() => KL.game?.scene.getScenes(true).map((s) => s.scene.key).join('+'));
const waitScene = async (key, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await scene())?.includes(key)) {
      await page.waitForTimeout(400); // let create() + fade-in settle before sending keys
      return true;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`scene ${key} not reached (at ${await scene()})`);
};

await waitScene('Boot');
await page.waitForFunction(() => KL.game.scene.getScene('Boot').ready); // loaded: "Tap to start"
await shot('01-boot');
await page.mouse.click(640, 360);
await waitScene('Menu');
await page.waitForTimeout(600);
await shot('02-menu');
await page.keyboard.press('Enter');
await waitScene('CharSelect');
await page.waitForTimeout(1800);
await shot('03-select');
await page.keyboard.press('KeyN'); // night match on: the stadium behind the picker switches over
await page.waitForTimeout(800);
await shot('04-select-night');
await page.keyboard.press('KeyD');
await page.waitForTimeout(200); // D and J in the same frame can drop the confirm
await page.keyboard.press('KeyJ');
await waitScene('Match');
await page.waitForTimeout(2200);
await shot('05-match-kickoff');
// play: run right + jump + kick a few times
for (let i = 0; i < 6; i++) {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(350);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(300);
}
await shot('06-match-play');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await shot('07-pause');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// force the clock to the end to reach Result quickly
await page.evaluate(() => {
  const m = KL.game.scene.getScene('Match');
  m.rules.state.clockMs = 1500;
  m.rules.state.score = [2, 1];
});
await waitScene('Result', 15000);
await page.waitForTimeout(1200);
await shot('08-result');
await page.keyboard.press('Escape');
await waitScene('Menu');
await page.keyboard.press('KeyS'); // W/S mirror the arrow keys; headless Chromium double-fires arrows under key capture
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await waitScene('Settings');
await page.waitForTimeout(500);
await shot('09-settings');

const state = await page.evaluate(() => ({ art: KL.artSource, fps: Math.round(KL.game.loop.actualFps) }));
console.log('scenes OK', state);
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  await browser.close();
  process.exit(1);
}
await browser.close();
console.log(`screenshots in ${out}`);
