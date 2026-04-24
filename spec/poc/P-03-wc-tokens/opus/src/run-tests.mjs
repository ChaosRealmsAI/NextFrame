#!/usr/bin/env node
/**
 * POC P-03 · headless verification + screenshot capture (Chromium via playwright)
 *
 * Runs 4 tests:
 *   A · tokens 穿透 (initial + flip + reset)
 *   B · 主文档污染隔离 (inject * { color: red })
 *   C · :host([kind]) 属性选择器
 *   D · adoptedStyleSheets vs inline <style> 性能
 *
 * Outputs:
 *   screenshots/test-a-*.png  test-b-*.png  test-c-*.png  test-d-*.png
 *   results.json              raw numbers
 */

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname } from "node:path";
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
const poc_root = resolve(here, "..");
const shotsDir = resolve(poc_root, "screenshots");
mkdirSync(shotsDir, { recursive: true });

// tiny static server rooted at opus/ so that /src/index.html + /dist/index.js both resolve
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
};
const server = createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/src/index.html";
  const abs = join(poc_root, urlPath);
  if (!abs.startsWith(poc_root) || !existsSync(abs) || statSync(abs).isDirectory()) {
    res.writeHead(404); res.end("not found: " + urlPath); return;
  }
  res.writeHead(200, { "content-type": MIME[extname(abs)] || "application/octet-stream" });
  res.end(readFileSync(abs));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/src/index.html`;
console.log("serving at", url);

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const results = {
  A: {},
  B: {},
  C: {},
  D: {},
  ua: null,
  timestamp: new Date().toISOString(),
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.error("[pageerror]", err.message));
page.on("requestfailed", (req) => console.error("[reqfailed]", req.url(), req.failure()?.errorText));
page.on("request", (req) => console.log("[req]", req.method(), req.url()));
page.on("response", (res) => console.log("[resp]", res.status(), res.url()));

await page.goto(url, { waitUntil: "networkidle" });
try {
  await page.waitForFunction(() => window.__POC__ != null, null, { timeout: 8000 });
} catch (e) {
  console.error("---DIAG---");
  const html = await page.content();
  console.error(html.slice(0, 2000));
  throw e;
}

results.ua = await page.evaluate(() => navigator.userAgent);

// ----- Test A · tokens 穿透 -----
const A_initial = await page.evaluate(() => window.__POC__.readAccentFromShadow());
results.A.initial = A_initial;
ok(A_initial === "rgb(167, 139, 250)", `A-1 initial .box bg (expect rgb(167, 139, 250), got ${A_initial})`);
await page.evaluate(() => window.runA_initial());
await page.screenshot({ path: `${shotsDir}/test-a-1-initial-purple.png`, fullPage: true });

await page.evaluate(() => window.runA_flip());
const A_flipped = await page.evaluate(() => window.__POC__.readAccentFromShadow());
results.A.flipped = A_flipped;
ok(A_flipped === "rgb(255, 0, 0)", `A-2 after flip(#ff0000) .box bg (expect rgb(255, 0, 0), got ${A_flipped})`);
await page.screenshot({ path: `${shotsDir}/test-a-2-flipped-red.png`, fullPage: true });

await page.evaluate(() => window.runA_reset());
const A_reset = await page.evaluate(() => window.__POC__.readAccentFromShadow());
results.A.reset = A_reset;
ok(A_reset === "rgb(167, 139, 250)", `A-3 after reset .box bg (expect rgb(167, 139, 250), got ${A_reset})`);

// ----- Test B · 主文档污染隔离 -----
// take "before" (no injection)
await page.evaluate(() => window.runB_clean()); // make sure clean
const B_pre_tab = await page.evaluate(() => window.__POC__.readTabColor());
const B_pre_h1 = await page.evaluate(() => getComputedStyle(document.querySelector("h1")).color);
results.B.pre_tab = B_pre_tab;
results.B.pre_h1 = B_pre_h1;
await page.screenshot({ path: `${shotsDir}/test-b-1-before-inject.png`, fullPage: true });

// inject universal red
await page.evaluate(() => window.runB_inject());
const B_post_tab = await page.evaluate(() => window.__POC__.readTabColor());
const B_post_h1 = await page.evaluate(() => getComputedStyle(document.querySelector("h1")).color);
const B_post_box = await page.evaluate(() => getComputedStyle(document.querySelector("nf-demo#d1").shadowRoot.querySelector(".box")).color);
results.B.post_tab = B_post_tab;
results.B.post_h1 = B_post_h1;
results.B.post_box = B_post_box;

ok(B_post_h1 === "rgb(255, 0, 0)", `B main <h1> color IS red after inject (expect rgb(255,0,0), got ${B_post_h1})`);
ok(B_post_tab !== "rgb(255, 0, 0)", `B shadow .tab.cur color NOT red after inject (got ${B_post_tab}; should be accent)`);
await page.evaluate(() => window.runB_check());
await page.screenshot({ path: `${shotsDir}/test-b-2-after-inject.png`, fullPage: true });

await page.evaluate(() => window.runB_clean());

// ----- Test C · :host([kind]) 属性选择器 -----
const C_scene = await page.evaluate(() => window.__POC__.readStripeBg("scene"));
const C_text = await page.evaluate(() => window.__POC__.readStripeBg("text"));
const C_audio = await page.evaluate(() => window.__POC__.readStripeBg("audio"));
results.C = { scene: C_scene, text: C_text, audio: C_audio };

ok(C_scene === "rgb(167, 139, 250)", `C scene stripe = accent purple (got ${C_scene})`);
ok(C_text === "rgb(224, 183, 108)", `C text stripe = amber (got ${C_text})`);
ok(C_audio === "rgb(123, 201, 181)", `C audio stripe = teal (got ${C_audio})`);

await page.evaluate(() => window.runC_check());
await page.screenshot({ path: `${shotsDir}/test-c-3-stripes.png`, fullPage: true });

// ----- Test D · perf -----
const D_runs = [];
for (const n of [10, 100, 500]) {
  const inline = await page.evaluate((nn) => window.__POC__.benchInline(nn), n);
  const adopted = await page.evaluate((nn) => window.__POC__.benchAdopted(nn), n);
  D_runs.push({ n, inline_ms: +inline.toFixed(3), adopted_ms: +adopted.toFixed(3), ratio: +(inline / Math.max(0.01, adopted)).toFixed(2) });
  await page.evaluate((nn) => window.runD(nn), n);
}

// 3× median-ish: repeat n=100 twice more for stability
for (let k = 0; k < 2; k++) {
  const inline = await page.evaluate(() => window.__POC__.benchInline(100));
  const adopted = await page.evaluate(() => window.__POC__.benchAdopted(100));
  D_runs.push({ n: 100, inline_ms: +inline.toFixed(3), adopted_ms: +adopted.toFixed(3), ratio: +(inline / Math.max(0.01, adopted)).toFixed(2), repeat: k + 1 });
}

const D_repaint = await page.evaluate(() => window.__POC__.benchRepaint());
await page.evaluate(() => window.runD_repaint());
results.D.runs = D_runs;
results.D.repaint_ms = +D_repaint.toFixed(3);

await page.screenshot({ path: `${shotsDir}/test-d-perf.png`, fullPage: true });

// ----- save -----
writeFileSync(resolve(poc_root, "results.json"), JSON.stringify(results, null, 2));
console.log("\n=== results ===");
console.log(JSON.stringify(results, null, 2));

await browser.close();
server.close();
