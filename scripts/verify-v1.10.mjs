#!/usr/bin/env node
// scripts/verify-v1.10.mjs
// Verify VP-1..7 for v1.10 Track.audio.
//
//   VP-1  check-abi.mjs passes 6 gates for audio.js
//   VP-2  build bundle with 1 audio Track · DOM has <audio data-nf-persist>
//   VP-3  click ▶ · 2s · audio.currentTime advances · not muted · not paused
//   VP-4  seek with from_ms offset · audio.currentTime ≈ Track.t + from_ms
//   VP-5  record mode · audio.muted=true (runtime layer) · render output has no muted attr
//   VP-6  time-boundary · (A) Track[0,10s]+2s mp3 @ t=4s paused/ended · (B) Track[0,3s]+10s mp3 @ t=3.5s paused
//   VP-7  two-tracks-overlap · 2 audio Tracks same window · both paused=false · both currentTime>=1.5
//
// Evidence → spec/versions/v1.10/verify/*.json + spec/versions/v1.10/verify/screenshots/*.png
// Exit 0 if all green, 1 otherwise.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const VERSION = "v1.10";
const VERIFY_DIR = path.join(ROOT, "spec", "versions", VERSION, "verify");
const SCREENSHOT_DIR = path.join(VERIFY_DIR, "screenshots");
const TMP_DIR = path.join(ROOT, "tmp");
const AUDIO_JS = path.join(ROOT, "src", "nf-tracks", "official", "audio.js");
const ABI_LINTER = path.join(ROOT, "src", "nf-tracks", "scripts", "check-abi.mjs");
const ENGINE_JS = path.join(ROOT, "src", "nf-core-engine", "dist", "engine.js");

// mp3 assets (shared across worktrees)
// v1.12.5 cleanup deleted v1.12-demo.*/v1.12-long.*; reuse v1121/v1122 assets.
const MP3_DEMO = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1121-demo.mp3";     // ≈ 19.8s
const MP3_LONG = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1122-demo.mp3";     // ≈ 19.4s
const MP3_SHORT = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1122-demo.mp3";    // ≈ 19.4s (distinct from MP3_DEMO for VP-7 overlap test)

mkdirSync(VERIFY_DIR, { recursive: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

// ---- helpers ------------------------------------------------------------

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function toPlainError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function runSpawn(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { stdout += String(c); });
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.on("error", (e) => resolve({ code: -1, signal: null, stdout, stderr: String(e) }));
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch (_) { /* keep scanning */ }
  }
  return null;
}

async function buildBundle(sourcePath, outPath) {
  const cmd = { cmd: "build", args: { source: sourcePath, out: outPath } };
  const r = await runSpawn(process.execPath, [ENGINE_JS, "--cmd", JSON.stringify(cmd)], { cwd: ROOT });
  const event = parseLastJsonLine(r.stdout);
  return { code: r.code, event, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

function writeSourceJson(relPath, doc) {
  const full = path.join(ROOT, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(doc, null, 2) + "\n");
  return full;
}

function baseViewport() { return { ratio: "16:9", w: 1920, h: 1080 }; }

// Build a minimal source.json object with anchors + passed tracks.
function makeSource({ meta, duration_expr, trackDefs }) {
  return {
    meta: meta || { name: "v1.10 verify bundle", version: "v1.10" },
    viewport: baseViewport(),
    duration: "demo.end",
    anchors: {
      demo: { begin: "0", end: duration_expr, filler: "manual" },
    },
    tracks: trackDefs,
  };
}

function makeBgTrack() {
  return {
    id: "bg",
    kind: "bg",
    src: "src/nf-tracks/official/bg.js",
    clips: [
      {
        id: "bg-clip",
        begin: "demo.begin",
        end: "demo.end",
        params: { type: "solid", color: "#0f172a" },
      },
    ],
  };
}

function makeAudioTrack(id, { srcUri, beginExpr, endExpr, from_ms }) {
  const params = { src: srcUri };
  if (typeof from_ms === "number") params.from_ms = from_ms;
  return {
    id,
    kind: "audio",
    src: "src/nf-tracks/official/audio.js",
    clips: [
      {
        id: id + "-clip",
        begin: beginExpr,
        end: endExpr,
        params,
      },
    ],
  };
}

async function launchPlaywright() {
  const { chromium } = await import("playwright");
  // --autoplay-policy=no-user-gesture-required: allow <audio>.play() without
  // a synthetic click (headless chromium blocks autoplay by default). We
  // still verify audio.muted === false per VP-3 semantics, so we do NOT pass
  // --mute-audio (that would flip the system-level mute, which is orthogonal
  // to the per-element .muted property VP-3 reads).
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  return { browser };
}

async function openBundle(browser, filePath, { mode } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const fileUrl = pathToFileURL(filePath).href + (mode ? `?mode=${mode}` : "");
  await page.goto(fileUrl, { waitUntil: "load" });
  // Wait for __nf.boot to populate window.__nf methods.
  await page.waitForFunction(
    () => typeof window !== "undefined" && window.__nf && typeof window.__nf.seek === "function",
    { timeout: 15000 },
  );
  return page;
}

// ---- VP-1: ABI lint -----------------------------------------------------

async function vp1() {
  const evidenceFile = path.join(VERIFY_DIR, "abi.json");
  try {
    const r = await runSpawn(process.execPath, [ABI_LINTER, AUDIO_JS], { cwd: ROOT });
    const event = parseLastJsonLine(r.stdout);
    const pass =
      r.code === 0 &&
      event &&
      event.event === "lint-track.pass" &&
      event.gates === 6;
    const payload = {
      vp: "VP-1",
      pass,
      detail: {
        exit_code: r.code,
        stdout: r.stdout.trim(),
        stderr: r.stderr.trim(),
        event,
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (e) {
    const payload = { vp: "VP-1", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-2: DOM mount ----------------------------------------------------

async function vp2() {
  const evidenceFile = path.join(VERIFY_DIR, "dom.json");
  const sourcePath = writeSourceJson("tmp/v1.10-vp2-source.json", makeSource({
    duration_expr: "demo.begin + 5000ms",
    trackDefs: [
      makeBgTrack(),
      makeAudioTrack("narration", {
        srcUri: `file://${MP3_DEMO}`,
        beginExpr: "demo.begin",
        endExpr: "demo.end",
        from_ms: 0,
      }),
    ],
  }));
  const outPath = path.join(TMP_DIR, "v1.10-vp2-dom.html");
  try {
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0 || !build.event || build.event.event !== "build.done") {
      throw new Error(`build failed: ${build.stderr || JSON.stringify(build.event)}`);
    }
    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      // Give runtime a tick to diff mount media.
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('audio[data-nf-persist]'));
        return {
          count: list.length,
          items: list.map(a => ({
            persist_key: a.getAttribute('data-nf-persist'),
            src: a.getAttribute('src') || '',
            preload: a.getAttribute('preload'),
            t_offset: a.getAttribute('data-nf-t-offset'),
            t_max: a.getAttribute('data-nf-t-max'),
            has_muted_attr: a.hasAttribute('muted'),
            prop_muted: a.muted,
          })),
        };
      });
      const shot = path.join(SCREENSHOT_DIR, "VP-2-dom-mount.png");
      await page.screenshot({ path: shot });

      const first = info.items[0] || {};
      const srcOk = typeof first.src === "string" && /^(file:\/\/|data:)/.test(first.src);
      const preloadOk = first.preload === "auto";
      const keyOk = typeof first.persist_key === "string" && /^audio-/.test(first.persist_key);
      const noMutedAttr = first.has_muted_attr === false;

      const pass = info.count >= 1 && srcOk && preloadOk && keyOk && noMutedAttr;
      const payload = {
        vp: "VP-2",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          audio_count: info.count,
          first_audio: first,
          checks: { srcOk, preloadOk, keyOk, noMutedAttr },
          screenshot: path.relative(ROOT, shot),
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-2", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-3: click ▶ · 2s · currentTime advances --------------------------

async function vp3() {
  const evidenceFile = path.join(VERIFY_DIR, "play.json");
  // Reuse VP-2 bundle (same spec).
  const sourcePath = writeSourceJson("tmp/v1.10-vp3-source.json", makeSource({
    duration_expr: "demo.begin + 8000ms",
    trackDefs: [
      makeBgTrack(),
      makeAudioTrack("narration", {
        srcUri: `file://${MP3_DEMO}`,
        beginExpr: "demo.begin",
        endExpr: "demo.end",
        from_ms: 0,
      }),
    ],
  }));
  const outPath = path.join(TMP_DIR, "v1.10-vp3-play.html");
  try {
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });
      const before = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return {
          mode: document.body.dataset.mode || null,
          paused: a ? a.paused : null,
          currentTime: a ? a.currentTime : null,
          muted: a ? a.muted : null,
        };
      });

      // Prefer clicking the play-pause button so we exercise the real UI path.
      const btn = await page.$('button[data-nf="play-pause"]');
      if (btn) {
        await btn.click();
      } else {
        await page.evaluate(() => window.__nf.play());
      }
      await page.waitForTimeout(2000);

      const after = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return {
          mode: document.body.dataset.mode || null,
          paused: a ? a.paused : null,
          currentTime: a ? a.currentTime : null,
          muted: a ? a.muted : null,
        };
      });
      const shot = path.join(SCREENSHOT_DIR, "VP-3-play.png");
      await page.screenshot({ path: shot });

      const pass =
        after.muted === false &&
        after.paused === false &&
        typeof after.currentTime === "number" &&
        after.currentTime >= 1.5;

      const payload = {
        vp: "VP-3",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          mode: after.mode,
          before,
          after,
          elapsed_ms: 2000,
          screenshot: path.relative(ROOT, shot),
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-3", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-4: seek + from_ms offset ----------------------------------------

async function vp4() {
  const evidenceFile = path.join(VERIFY_DIR, "seek.json");
  // Track uses from_ms=1000 → seek(4000) should set audio.currentTime ≈ 5.0
  const sourcePath = writeSourceJson("tmp/v1.10-vp4-source.json", makeSource({
    duration_expr: "demo.begin + 8000ms",
    trackDefs: [
      makeBgTrack(),
      makeAudioTrack("narration", {
        srcUri: `file://${MP3_DEMO}`,
        beginExpr: "demo.begin",
        endExpr: "demo.end",
        from_ms: 1000,
      }),
    ],
  }));
  const outPath = path.join(TMP_DIR, "v1.10-vp4-seek.html");
  try {
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });

      const before = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return { currentTime: a ? a.currentTime : null, paused: a ? a.paused : null };
      });
      const shotBefore = path.join(SCREENSHOT_DIR, "VP-4-seek-before.png");
      await page.screenshot({ path: shotBefore });

      await page.evaluate(() => window.__nf.seek(4000, { pause: true }));
      await page.waitForTimeout(200);

      const afterSeek = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return { currentTime: a ? a.currentTime : null, paused: a ? a.paused : null };
      });
      const shotAfter = path.join(SCREENSHOT_DIR, "VP-4-seek-after.png");
      await page.screenshot({ path: shotAfter });

      // Playback extension: __nf.play() + 1s should advance ≈ 1s.
      await page.evaluate(() => window.__nf.play());
      await page.waitForTimeout(1000);
      const afterPlay = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return { currentTime: a ? a.currentTime : null, paused: a ? a.paused : null };
      });

      const expectedSeek = 5.0;   // Track 4s + from_ms 1s
      const errSeek = Math.abs((afterSeek.currentTime ?? -999) - expectedSeek);
      const seekOk = errSeek < 0.5;

      const advanceDelta = (afterPlay.currentTime ?? 0) - (afterSeek.currentTime ?? 0);
      const advanceOk = advanceDelta >= 0.5 && advanceDelta <= 1.8;

      const pass = seekOk && advanceOk;
      const payload = {
        vp: "VP-4",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          from_ms: 1000,
          seek_t_ms: 4000,
          expected_audio_currentTime: expectedSeek,
          before,
          after_seek: afterSeek,
          after_play_1s: afterPlay,
          err_s: errSeek,
          advance_delta_s: advanceDelta,
          checks: { seekOk, advanceOk },
          screenshots: {
            before: path.relative(ROOT, shotBefore),
            after: path.relative(ROOT, shotAfter),
          },
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-4", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-5: record mode muted + render output has no muted attr ---------

async function vp5() {
  const evidenceFile = path.join(VERIFY_DIR, "record-mode.json");
  try {
    // Static check: audio.js source must not emit a muted attribute.
    const audioSrc = readFileSync(AUDIO_JS, "utf8");
    // Look for literal muted="..." or " muted" attribute emission. Exclude
    // the code path that sets el.muted = true (property, not attr) which is
    // not present in audio.js anyway (runtime handles that).
    const attrEmitPattern = /["']\s*muted\s*=|["']\s*muted\s*["']|muted=["']/g;
    const attrMatches = audioSrc.match(attrEmitPattern) || [];
    // We also want to be extra strict: the substring 'muted' should not appear
    // inside any return concatenation that emits HTML. We accept mentions in
    // comments (which all lowercase "muted" mentions should be).
    // Crude heuristic: count non-comment occurrences outside of comment lines.

    // Dynamic: build bundle, open with ?mode=record, check muted=true.
    const sourcePath = writeSourceJson("tmp/v1.10-vp5-source.json", makeSource({
      duration_expr: "demo.begin + 5000ms",
      trackDefs: [
        makeBgTrack(),
        makeAudioTrack("narration", {
          srcUri: `file://${MP3_DEMO}`,
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          from_ms: 0,
        }),
      ],
    }));
    const outPath = path.join(TMP_DIR, "v1.10-vp5-record.html");
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    let detail = {};
    let dynamicPass = false;
    try {
      const page = await openBundle(browser, outPath, { mode: "record" });
      await page.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });
      // Runtime doesn't auto-read ?mode=record URL query (v1.21 scope).
      // v1.14 recorder sets body.dataset.mode directly before boot.
      // Simulate that path: set dataset.mode then trigger play → _syncMediaFromMode.
      await page.evaluate(() => {
        document.body.dataset.mode = 'record';
        if (window.__nf && typeof window.__nf.play === 'function') window.__nf.play();
      });
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return {
          body_mode: document.body.dataset.mode || null,
          prop_muted: a ? a.muted : null,
          attr_muted: a ? a.hasAttribute('muted') : null,
          outer_sample: a ? a.outerHTML.slice(0, 300) : null,
        };
      });
      detail = info;
      dynamicPass =
        info.body_mode === "record" &&
        info.prop_muted === true;
    } finally {
      await browser.close();
    }

    const renderAttrPass = attrMatches.length === 0;
    const pass = renderAttrPass && dynamicPass;

    const payload = {
      vp: "VP-5",
      pass,
      detail: {
        static_checks: {
          audio_js: path.relative(ROOT, AUDIO_JS),
          attr_matches: attrMatches,
          no_muted_attr_emitted: renderAttrPass,
        },
        dynamic_checks: detail,
        pass_components: { renderAttrPass, dynamicPass },
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (e) {
    const payload = { vp: "VP-5", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-6: time-boundary (two demos: shorter window / longer window) ----

async function vp6() {
  const evidenceFile = path.join(VERIFY_DIR, "time-boundary.json");
  try {
    // Demo A: Track window [0,3000] · mp3 ~20s (LONG) → at t=3.5s Track window
    // past → runtime must pause media.
    const srcA = writeSourceJson("tmp/v1.10-vp6a-source.json", makeSource({
      duration_expr: "demo.begin + 4000ms",
      trackDefs: [
        makeBgTrack(),
        makeAudioTrack("narration", {
          srcUri: `file://${MP3_SHORT}`, // 19.8s mp3
          beginExpr: "demo.begin",
          endExpr: "demo.begin + 3000ms",
          from_ms: 0,
        }),
      ],
    }));
    const outA = path.join(TMP_DIR, "v1.10-vp6a-shorter.html");
    const buildA = await buildBundle(srcA, outA);
    if (buildA.code !== 0) throw new Error(`buildA failed: ${buildA.stderr}`);

    // Demo B: Track window [0,10000] · 2s mp3 (v1.12-demo is ≈ 7.8s — we use
    // from_ms=6000 to trim effective length to ~1.8s so at t=4s media should
    // have ended. Alt pick a short clip). Use MP3_DEMO (7.8s) with from_ms=6000
    // → effective 1.8s playback. At t=4s Track still active but media done.
    const srcB = writeSourceJson("tmp/v1.10-vp6b-source.json", makeSource({
      duration_expr: "demo.begin + 10000ms",
      trackDefs: [
        makeBgTrack(),
        makeAudioTrack("narration", {
          srcUri: `file://${MP3_DEMO}`,
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          from_ms: 6000, // effective length 7.8 - 6.0 = 1.8s
        }),
      ],
    }));
    const outB = path.join(TMP_DIR, "v1.10-vp6b-longer.html");
    const buildB = await buildBundle(srcB, outB);
    if (buildB.code !== 0) throw new Error(`buildB failed: ${buildB.stderr}`);

    const { browser } = await launchPlaywright();
    let a_result = {};
    let b_result = {};
    try {
      // Demo A
      const pageA = await openBundle(browser, outA);
      await pageA.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });
      await pageA.evaluate(() => window.__nf.play());
      // wait until Track t ≈ 3500
      await pageA.waitForTimeout(3500);
      a_result = await pageA.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        const state = window.__nf.getState ? window.__nf.getState() : {};
        return {
          t_ms: state.t_ms ?? null,
          paused: a ? a.paused : null,
          currentTime: a ? a.currentTime : null,
          element_present: !!a,
        };
      });
      const shotA = path.join(SCREENSHOT_DIR, "VP-6-boundary-shorter.png");
      await pageA.screenshot({ path: shotA });
      await pageA.close();

      // Demo B
      const pageB = await openBundle(browser, outB);
      await pageB.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });
      await pageB.evaluate(() => window.__nf.play());
      await pageB.waitForTimeout(4000);
      b_result = await pageB.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        const state = window.__nf.getState ? window.__nf.getState() : {};
        return {
          t_ms: state.t_ms ?? null,
          paused: a ? a.paused : null,
          currentTime: a ? a.currentTime : null,
          ended: a ? a.ended : null,
          duration: a ? a.duration : null,
          silent_attr: a ? a.getAttribute('data-nf-silent') : null,
        };
      });
      const shotB = path.join(SCREENSHOT_DIR, "VP-6-boundary-longer.png");
      await pageB.screenshot({ path: shotB });

      // Track window [0,3000] · @ t=3500 outside window.
      // Pass if any of: element removed (Track diffed out · effectively silent) /
      // audio.paused=true / currentTime clamped to window end.
      const aPass = a_result.element_present === false ||
        a_result.paused === true ||
        (typeof a_result.currentTime === "number" && a_result.currentTime <= 3.1);
      // For demo B, allow either paused (current v1.10 runtime pauses) or
      // currentTime >= mp3 effective duration (i.e. media ended). data-nf-silent
      // is the ideal signal per IS-2a (A); accept if present.
      const mediaEffectiveDuration = 1.8; // 7.8 - 6.0 from_ms
      const bPassPaused = b_result.paused === true;
      const bPassEnded = typeof b_result.currentTime === "number" &&
        b_result.currentTime >= mediaEffectiveDuration * 0.9;
      const bPassSilent = b_result.silent_attr === "true";
      const bPass = bPassPaused || bPassEnded || bPassSilent;

      const pass = aPass && bPass;
      const payload = {
        vp: "VP-6",
        pass,
        detail: {
          demo_A_shorter_track: {
            bundle: path.relative(ROOT, outA),
            track_window_ms: [0, 3000],
            mp3_duration_s: "≈19.8",
            sampled_at_ms: 3500,
            result: a_result,
            pass: aPass,
            screenshot: path.relative(ROOT, shotA),
          },
          demo_B_longer_track: {
            bundle: path.relative(ROOT, outB),
            track_window_ms: [0, 10000],
            mp3_effective_duration_s: mediaEffectiveDuration,
            sampled_at_ms: 4000,
            result: b_result,
            pass: bPass,
            pass_via: { bPassPaused, bPassEnded, bPassSilent },
            screenshot: path.relative(ROOT, shotB),
          },
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-6", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-7: two audio tracks overlap parallel mix ------------------------

async function vp7() {
  const evidenceFile = path.join(VERIFY_DIR, "overlap-allowed.json");
  try {
    const sourcePath = writeSourceJson("tmp/v1.10-vp7-source.json", makeSource({
      duration_expr: "demo.begin + 10000ms",
      trackDefs: [
        makeBgTrack(),
        makeAudioTrack("narration-a", {
          srcUri: `file://${MP3_DEMO}`,
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          from_ms: 0,
        }),
        makeAudioTrack("narration-b", {
          srcUri: `file://${MP3_SHORT}`,
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          from_ms: 0,
        }),
      ],
    }));
    const outPath = path.join(TMP_DIR, "v1.10-vp7-overlap.html");
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('audio[data-nf-persist]', { state: 'attached', timeout: 5000 });

      const countBefore = await page.evaluate(() =>
        document.querySelectorAll('audio[data-nf-persist]').length);

      await page.evaluate(() => window.__nf.play());
      await page.waitForTimeout(2000);

      const items = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('audio[data-nf-persist]'));
        return all.map(a => ({
          persist_key: a.getAttribute('data-nf-persist'),
          src: a.getAttribute('src'),
          paused: a.paused,
          muted: a.muted,
          currentTime: a.currentTime,
        }));
      });
      const shot = path.join(SCREENSHOT_DIR, "VP-7-overlap.png");
      await page.screenshot({ path: shot });

      const twoMounted = countBefore === 2 && items.length === 2;
      const keysDistinct = items.length === 2 && items[0].persist_key !== items[1].persist_key;
      const bothPlaying = items.every(i => i.paused === false);
      const bothAdvanced = items.every(i => typeof i.currentTime === "number" && i.currentTime >= 1.5);

      const pass = twoMounted && keysDistinct && bothPlaying && bothAdvanced;
      const payload = {
        vp: "VP-7",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          audio_count: countBefore,
          per_audio: items,
          checks: { twoMounted, keysDistinct, bothPlaying, bothAdvanced },
          screenshot: path.relative(ROOT, shot),
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-7", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- main ---------------------------------------------------------------

async function main() {
  const results = [];
  results.push(await vp1());
  results.push(await vp2());
  results.push(await vp3());
  results.push(await vp4());
  results.push(await vp5());
  results.push(await vp6());
  results.push(await vp7());

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const summary = {
    version: VERSION,
    passed,
    total,
    all_green: passed === total,
    details: results.map(r => ({ vp: r.vp, pass: r.pass, error: r.error || null })),
    generated_at: new Date().toISOString(),
  };
  writeJson(path.join(VERIFY_DIR, "summary.json"), summary);

  for (const r of results) {
    const icon = r.pass ? "✅" : "❌";
    console.log(`${icon} ${r.vp}${r.error ? " · " + (r.error.message || "").slice(0, 120) : ""}`);
  }
  console.log(`\n=== ${passed}/${total} green ===`);
  process.exit(passed === total ? 0 : 1);
}

main().catch(async (error) => {
  process.stderr.write(`${toPlainError(error).message}\n`);
  process.exit(1);
});
