#!/usr/bin/env node
// Screenshot vertical segment at key timestamps using puppeteer-core + system Chrome
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = '/Users/Zhuanz/NextFrame/projects/dogfood-test/ep01/final.html';
const OUT = '/Users/Zhuanz/NextFrame/projects/dogfood-test/ep01/screenshots';
mkdirSync(OUT, { recursive: true });

// Find Chrome
let chromePath;
const candidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
for (const c of candidates) {
  try { execSync(`test -f "${c}"`); chromePath = c; break; } catch {}
}
if (!chromePath) { console.error('Chrome not found'); process.exit(1); }
console.log('Using:', chromePath);

const { launch } = await import('/Users/Zhuanz/bigbang/NextFrame/nextframe-cli/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');

const browser = await launch({
  executablePath: chromePath,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  headless: true,
});

const page = await browser.newPage();
// Set viewport to fit 1080x1920 stage (with some padding for the shell UI)
// We use a viewport slightly larger than the stage so it all fits
await page.setViewport({ width: 1100, height: 1960, deviceScaleFactor: 1 });

await page.goto(`file://${HTML}`, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for player to initialize
await page.waitForFunction(() => typeof window.__onFrame === 'function', { timeout: 10000 });

const timestamps = [
  { t: 4,  name: 't01_title_headline' },
  { t: 7,  name: 't07_stats_row' },
  { t: 12, name: 't12_feature_grid' },
  { t: 17, name: 't17_bar_chart' },
];

for (const { t, name } of timestamps) {
  // Use the engine's __onFrame API to render a specific time
  await page.evaluate(async (time) => {
    await window.__onFrame({ time });
  }, t);

  // Wait two rAF cycles to ensure paint
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise(r => setTimeout(r, 300));

  const path = resolve(OUT, `${name}.png`);
  // Get stage element bounding box to clip screenshot to just the stage
  const stageBox = await page.evaluate(() => {
    const el = document.getElementById('stage');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  // Scale down to 430x932 equivalent for the final screenshot
  const scaleX = 430 / stageBox.width;
  const scaleY = 932 / stageBox.height;
  // Take screenshot of the full stage area, then clip
  await page.screenshot({
    path,
    clip: { x: stageBox.x, y: stageBox.y, width: stageBox.width, height: stageBox.height }
  });
  console.log(`saved: ${path} (stage: ${stageBox.width}x${stageBox.height})`);
}

await browser.close();
console.log('done');
