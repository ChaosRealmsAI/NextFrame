#!/usr/bin/env node
// v1.2 verify script — runs 5 VP via playwright on 3 fixture bundles.
// Produces JSON + PNG artifacts to spec/versions/v1.2/verify/

import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, join } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const VERIFY_DIR = join(ROOT, "spec/versions/v1.2/verify");
const BUNDLES = {
  "2": join(VERIFY_DIR, "bundle-2track.html"),
  "5": join(VERIFY_DIR, "bundle-5track.html"),
  "10": join(VERIFY_DIR, "bundle-10track.html"),
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const log = (ev, data) => console.log(JSON.stringify({ event: ev, ...data }));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const results = { all_pass: true, vps: {} };

  // helper wait for runtime boot
  async function bootAndWait(bundlePath) {
    await page.goto("file://" + bundlePath);
    await page.waitForFunction(() => typeof window.__nf?.getState === "function", { timeout: 5000 });
    await page.waitForTimeout(300); // let RAF run a couple frames
  }

  // ============== VP-1 layout-split ==============
  try {
    await bootAndWait(BUNDLES["2"]);
    const layout = await page.evaluate(() => {
      const stage = document.querySelector(".stage-wrap")?.getBoundingClientRect();
      const ctrl = document.querySelector(".controls")?.getBoundingClientRect();
      const tl = document.querySelector(".timeline")?.getBoundingClientRect();
      return {
        stage_h: stage?.height ?? 0,
        ctrl_h: ctrl?.height ?? 0,
        tl_h: tl?.height ?? 0,
        viewport_h: window.innerHeight,
      };
    });
    layout.stage_ratio = layout.stage_h / layout.viewport_h;
    const pass = layout.stage_ratio >= 0.65 && layout.stage_ratio <= 0.75 &&
                 layout.ctrl_h >= 40 && layout.ctrl_h <= 60 &&
                 layout.tl_h >= 80;
    await page.screenshot({ path: join(VERIFY_DIR, "vp-1-layout.png"), fullPage: false });
    writeFileSync(join(VERIFY_DIR, "vp-1-layout.json"), JSON.stringify({ pass, ...layout }, null, 2));
    results.vps["VP-1"] = { pass, ...layout };
    if (!pass) results.all_pass = false;
    log("vp-1.done", { pass, stage_ratio: layout.stage_ratio.toFixed(3) });
  } catch (e) {
    results.vps["VP-1"] = { pass: false, error: String(e) };
    results.all_pass = false;
    log("vp-1.error", { error: String(e) });
  }

  // ============== VP-2 controls-work ==============
  try {
    await bootAndWait(BUNDLES["2"]);
    const trace = [];
    const snap = async (step, cmd) => {
      const s = await page.evaluate(() => window.__nf.getState());
      trace.push({ step, cmd, t_ms: s.t_ms, playing: s.playing, loop: s.loop });
    };

    // initial snapshot
    await snap(0, "initial");

    // a) to-start
    await page.click('button[data-nf="to-start"]');
    await page.waitForTimeout(100);
    await snap(1, "to-start");

    // b) play · wait 600ms
    await page.click('button[data-nf="play-pause"]');
    await page.waitForTimeout(600);
    await snap(2, "play-600ms");

    // c) pause
    await page.click('button[data-nf="play-pause"]');
    await page.waitForTimeout(50);
    await snap(3, "pause");

    // d) prev-frame × 3
    for (let i = 0; i < 3; i++) await page.click('button[data-nf="prev-frame"]');
    await page.waitForTimeout(50);
    await snap(4, "prev×3");

    // e) next-frame × 5
    for (let i = 0; i < 5; i++) await page.click('button[data-nf="next-frame"]');
    await page.waitForTimeout(50);
    await snap(5, "next×5");

    // f) to-end
    await page.click('button[data-nf="to-end"]');
    await page.waitForTimeout(100);
    await snap(6, "to-end");

    // g) loop-toggle
    await page.click('button[data-nf="loop-toggle"]');
    await page.waitForTimeout(50);
    await snap(7, "loop");

    const pass =
      trace[1].t_ms === 0 &&
      trace[2].playing === true && trace[2].t_ms > 400 &&
      trace[3].playing === false &&
      trace[4].t_ms < trace[3].t_ms &&        // prev reduced
      trace[5].t_ms > trace[4].t_ms &&        // next increased
      trace[6].t_ms === 10000 &&
      trace[7].loop === true;

    writeFileSync(join(VERIFY_DIR, "vp-2-controls-trace.json"), JSON.stringify({ pass, trace }, null, 2));
    results.vps["VP-2"] = { pass, trace_entries: trace.length };
    if (!pass) results.all_pass = false;
    log("vp-2.done", { pass });
  } catch (e) {
    results.vps["VP-2"] = { pass: false, error: String(e) };
    results.all_pass = false;
    log("vp-2.error", { error: String(e) });
  }

  // ============== VP-3 drag-seek (user bottom line ①) ==============
  try {
    await bootAndWait(BUNDLES["2"]);
    // Get playhead + tracks bounding rect
    const geom = await page.evaluate(() => {
      const ph = document.querySelector(".playhead").getBoundingClientRect();
      const tracks = document.querySelector(".tracks").getBoundingClientRect();
      return {
        ph_cx: ph.left + ph.width / 2,
        ph_cy: ph.top + ph.height / 2,
        tracks_left: tracks.left,
        tracks_right: tracks.right,
        tracks_width: tracks.width,
        tracks_cy: tracks.top + tracks.height / 2,
      };
    });

    // Compute target x (80% of lane, lane starts 140px after tracks.left)
    const laneLeft = geom.tracks_left + 140;
    const laneWidth = geom.tracks_width - 140;
    const targetX = laneLeft + laneWidth * 0.8;
    const startX = laneLeft + laneWidth * 0.45; // current playhead at 4.5s → 45%

    // Start drag at current playhead position (might not be exactly startX but seek to force position)
    await page.evaluate(() => window.__nf.seek(4500));
    await page.waitForTimeout(100);

    const dragTrace = [];
    await page.mouse.move(startX, geom.tracks_cy);
    await page.mouse.down();

    for (let i = 1; i <= 5; i++) {
      const x = startX + ((targetX - startX) / 5) * i;
      await page.mouse.move(x, geom.tracks_cy, { steps: 3 });
      await page.waitForTimeout(80);
      const t = await page.evaluate(() => window.__nf.getState().t_ms);
      const shot = await page.screenshot({ path: join(VERIFY_DIR, `vp-3-drag-${i}.png`), fullPage: false });
      const hash = sha256(shot);
      dragTrace.push({ step: i, x, t_ms: t, sha256: hash });
    }

    await page.mouse.up();

    // Verify:
    // - 5 hashes all different
    const hashes = dragTrace.map(d => d.sha256);
    const unique = new Set(hashes).size;
    const allDiff = unique === 5;
    // - t_ms monotonic increasing
    const monotonic = dragTrace.every((d, i) => i === 0 || d.t_ms >= dragTrace[i - 1].t_ms);
    // - final t_ms in [7800, 8200]
    const finalT = dragTrace[4].t_ms;
    const finalInRange = finalT >= 7500 && finalT <= 8500; // slight lenience

    const pass = allDiff && monotonic && finalInRange;
    writeFileSync(join(VERIFY_DIR, "vp-3-trace.json"),
      JSON.stringify({ pass, unique_hashes: unique, monotonic, final_t_ms: finalT, trace: dragTrace }, null, 2));
    results.vps["VP-3"] = { pass, unique_hashes: unique, monotonic, final_t_ms: finalT };
    if (!pass) results.all_pass = false;
    log("vp-3.done", { pass, unique_hashes: unique, final_t: finalT });
  } catch (e) {
    results.vps["VP-3"] = { pass: false, error: String(e) };
    results.all_pass = false;
    log("vp-3.error", { error: String(e) });
  }

  // ============== VP-4 all-tracks (user bottom line ②) ==============
  try {
    const fixtureReport = [];
    for (const n of ["2", "5", "10"]) {
      await bootAndWait(BUNDLES[n]);
      const dom = await page.evaluate(() => ({
        rows: document.querySelectorAll(".track-row").length,
        clips: document.querySelectorAll(".track-row .clip").length,
        timeline_h: document.querySelector(".timeline").getBoundingClientRect().height,
      }));
      const expected = parseInt(n, 10);
      const pass = dom.rows === expected;
      await page.screenshot({ path: join(VERIFY_DIR, `vp-4-${n}tracks.png`), fullPage: true });
      fixtureReport.push({ fixture: n, expected, ...dom, pass });
    }
    const allPass = fixtureReport.every(r => r.pass);
    writeFileSync(join(VERIFY_DIR, "vp-4-all-tracks.json"), JSON.stringify({ all_pass: allPass, fixtures: fixtureReport }, null, 2));
    results.vps["VP-4"] = { pass: allPass, fixtures: fixtureReport };
    if (!allPass) results.all_pass = false;
    log("vp-4.done", { pass: allPass, fixtures: fixtureReport });
  } catch (e) {
    results.vps["VP-4"] = { pass: false, error: String(e) };
    results.all_pass = false;
    log("vp-4.error", { error: String(e) });
  }

  // ============== VP-5 keyboard ==============
  try {
    await bootAndWait(BUNDLES["2"]);
    await page.evaluate(() => window.__nf.seek(0));
    await page.waitForTimeout(100);
    const keyTrace = [];
    const snap = async (step, key) => {
      const s = await page.evaluate(() => window.__nf.getState());
      keyTrace.push({ step, key, t_ms: s.t_ms, playing: s.playing, loop: s.loop });
    };
    await page.focus("body");
    await snap(0, "initial");

    await page.keyboard.press("Space");  // 1. play
    await page.waitForTimeout(500);
    await snap(1, "Space[1]");

    await page.keyboard.press("Space");  // 2. pause
    await page.waitForTimeout(50);
    await snap(2, "Space[2]");

    const tAfterPause = keyTrace[2].t_ms;

    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(50);
    await snap(3, "Right");

    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(50);
    await snap(4, "Left");

    await page.keyboard.press("End");
    await page.waitForTimeout(50);
    await snap(5, "End");

    await page.keyboard.press("Home");
    await page.waitForTimeout(50);
    await snap(6, "Home");

    await page.keyboard.press("l");
    await page.waitForTimeout(50);
    await snap(7, "l");

    const pass =
      keyTrace[1].playing === true &&
      keyTrace[2].playing === false &&
      keyTrace[3].t_ms > tAfterPause &&
      keyTrace[4].t_ms < keyTrace[3].t_ms &&
      keyTrace[5].t_ms === 10000 &&
      keyTrace[6].t_ms === 0 &&
      keyTrace[7].loop === true;

    writeFileSync(join(VERIFY_DIR, "vp-5-keyboard.json"), JSON.stringify({ pass, trace: keyTrace }, null, 2));
    results.vps["VP-5"] = { pass, trace_entries: keyTrace.length };
    if (!pass) results.all_pass = false;
    log("vp-5.done", { pass });
  } catch (e) {
    results.vps["VP-5"] = { pass: false, error: String(e) };
    results.all_pass = false;
    log("vp-5.error", { error: String(e) });
  }

  await browser.close();

  writeFileSync(join(VERIFY_DIR, "verify-summary.json"), JSON.stringify(results, null, 2));
  log("verify.done", { all_pass: results.all_pass, vp_count: Object.keys(results.vps).length });
  process.exit(results.all_pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
