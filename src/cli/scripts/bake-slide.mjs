#!/usr/bin/env node
// bake-slide.mjs — Bake an sk-frame HTML slide into a PNG sequence via Puppeteer.
// Usage: node scripts/bake-slide.mjs <slide.html> <outDir> [fps=30] [duration=auto]
//
// Launches headless Chrome, loads the slide, uses window.__seekTo(t) to drive
// the slidekit/GSAP timeline frame-by-frame, and captures 1920×1080 screenshots.
//
// Output: <outDir>/frame-0000.png .. frame-NNNN.png
//
// Prerequisites:
//   npm install --no-save puppeteer-core   (uses system Chrome, no Chromium download)
//   Slide HTML must reference slidekit.js which provides window.__seekTo.

import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const [,, htmlPath, outDir, fpsArg, durArg] = process.argv;
if (!htmlPath || !outDir) {
  console.error("usage: node scripts/bake-slide.mjs <slide.html> <outDir> [fps] [duration]");
  process.exit(1);
}

const fps = Number(fpsArg) || 30;
const absHtml = resolve(htmlPath);
if (!existsSync(absHtml)) { console.error(`not found: ${absHtml}`); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: 1920, height: 1080 },
});

const page = await browser.newPage();
await page.goto(`file://${absHtml}`, { waitUntil: "networkidle0", timeout: 15000 });
await page.waitForFunction("window.__seekTo", { timeout: 8000 });

const slideDuration = Number(durArg) || await page.evaluate(() => window.SK?.duration || 72.42);
const totalFrames = Math.ceil(slideDuration * fps);
const startMs = Date.now();

console.log(`Baking ${totalFrames} frames @ ${fps}fps for ${slideDuration.toFixed(2)}s`);
console.log(`Source: ${absHtml}`);
console.log(`Output: ${outDir}/frame-NNNN.png`);

for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;
  await page.evaluate((tt) => window.__seekTo(tt), t);
  // Small settle time for GSAP tween interpolation + paint
  await new Promise((r) => setTimeout(r, 15));
  const fname = `frame-${String(i).padStart(4, "0")}.png`;
  await page.screenshot({ path: `${outDir}/${fname}` });
  if (i % fps === 0) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    const eta = i > 0 ? (((Date.now() - startMs) / i) * (totalFrames - i) / 1000).toFixed(0) : "?";
    process.stderr.write(`  ${i}/${totalFrames} frames (${elapsed}s elapsed, ~${eta}s remaining)\n`);
  }
}

const totalElapsed = ((Date.now() - startMs) / 1000).toFixed(1);
console.log(`Done: ${totalFrames} frames in ${totalElapsed}s → ${outDir}/`);
console.log(`Next: ffmpeg -framerate ${fps} -i ${outDir}/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4`);

await browser.close();
