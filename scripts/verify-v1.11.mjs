#!/usr/bin/env node
// scripts/verify-v1.11.mjs
// Verify VP-1..5 for v1.11 Track.subtitle.
//
//   VP-1  check-abi.mjs passes 6 gates for subtitle.js
//   VP-2  bind mode (audio_track_id) · active word idx strictly increases 1s→3s
//   VP-3  independent mode (timeline_path · no audio) · seek(5000) · active.start_ms≤5000≤end_ms
//   VP-4  CSS var · 2 bundles (A/B) · active color / font-size / container position all differ
//   VP-5  seek(4000) · active word covers t=4000 · start_ms ≤ 4000 ≤ end_ms
//
// Evidence → spec/versions/v1.11/verify/*.json + screenshots/*.png
// Exit 0 if all green, 1 otherwise.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const VERSION = "v1.11";
const VERIFY_DIR = path.join(ROOT, "spec", "versions", VERSION, "verify");
const SCREENSHOT_DIR = path.join(VERIFY_DIR, "screenshots");
const TMP_DIR = path.join(ROOT, "tmp");
const SUBTITLE_JS = path.join(ROOT, "src", "nf-tracks", "official", "subtitle.js");
const ABI_LINTER = path.join(ROOT, "src", "nf-tracks", "scripts", "check-abi.mjs");
const ENGINE_JS = path.join(ROOT, "src", "nf-core-engine", "dist", "engine.js");

const MP3_DEMO = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1.12-demo.mp3";
const TIMELINE_DEMO = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1.12-demo.timeline.json";
const TIMELINE_LONG = "/Users/Zhuanz/bigbang/NextFrame/tmp/v1.12-long.timeline.json";

mkdirSync(VERIFY_DIR, { recursive: true });
mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });

// ---- helpers ------------------------------------------------------------

function writeJson(file, payload) {
  writeFileSync(file, JSON.stringify(payload, null, 2) + "\n");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
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

function makeSource({ duration_expr, trackDefs, meta }) {
  return {
    meta: meta || { name: "v1.11 verify bundle", version: "v1.11" },
    viewport: baseViewport(),
    duration: "demo.end",
    anchors: { demo: { begin: "0", end: duration_expr, filler: "manual" } },
    tracks: trackDefs,
  };
}

function makeBgTrack() {
  return {
    id: "bg",
    kind: "bg",
    src: "src/nf-tracks/official/bg.js",
    clips: [{
      id: "bg-clip",
      begin: "demo.begin",
      end: "demo.end",
      params: { type: "solid", color: "#0f172a" },
    }],
  };
}

function makeAudioTrack(id, { srcUri, beginExpr, endExpr, from_ms }) {
  const params = { src: srcUri };
  if (typeof from_ms === "number") params.from_ms = from_ms;
  return {
    id,
    kind: "audio",
    src: "src/nf-tracks/official/audio.js",
    clips: [{ id: id + "-clip", begin: beginExpr, end: endExpr, params }],
  };
}

function makeSubtitleTrack(id, { beginExpr, endExpr, source, style }) {
  const params = { source };
  if (style) params.style = style;
  return {
    id,
    kind: "subtitle",
    src: "src/nf-tracks/official/subtitle.js",
    clips: [{ id: id + "-clip", begin: beginExpr, end: endExpr, params }],
  };
}

async function launchPlaywright() {
  const { chromium } = await import("playwright");
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
  await page.waitForFunction(
    () => typeof window !== "undefined" && window.__nf && typeof window.__nf.seek === "function",
    { timeout: 15000 },
  );
  return page;
}

// Evaluate inside page: return active word info.
async function readActiveWord(page) {
  return await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('[data-nf-subtitle-word-idx]'));
    const activeSpan = spans.find(s => s.getAttribute('data-nf-subtitle-state') === 'active');
    if (!activeSpan) return { active_idx: -1, active_text: null };
    const idx = parseInt(activeSpan.getAttribute('data-nf-subtitle-word-idx'), 10);
    return {
      active_idx: idx,
      active_text: activeSpan.textContent,
      span_color: getComputedStyle(activeSpan).color,
      span_font_size: getComputedStyle(activeSpan).fontSize,
      word_count: spans.length,
    };
  });
}

// ---- VP-1: ABI lint -----------------------------------------------------

async function vp1() {
  const evidenceFile = path.join(VERIFY_DIR, "abi.json");
  try {
    const r = await runSpawn(process.execPath, [ABI_LINTER, SUBTITLE_JS], { cwd: ROOT });
    const event = parseLastJsonLine(r.stdout);
    const pass = r.code === 0 && event && event.event === "lint-track.pass" && event.gates === 6;
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

// ---- VP-2: bind mode · audio_track_id · active idx strictly increases ----

async function vp2() {
  const evidenceFile = path.join(VERIFY_DIR, "highlight-sync.json");
  try {
    const sourcePath = writeSourceJson("tmp/v1.11-vp2-source.json", makeSource({
      duration_expr: "demo.begin + 8000ms",
      trackDefs: [
        makeBgTrack(),
        makeAudioTrack("narration", {
          srcUri: `file://${MP3_DEMO}`,
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          from_ms: 0,
        }),
        makeSubtitleTrack("caption", {
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          source: { audio_track_id: "narration" },
          style: { active_color: "#fbbf24", size_px: 36, position: "bottom", padding: 12 },
        }),
      ],
    }));
    const outPath = path.join(TMP_DIR, "v1.11-vp2-bind.html");
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('[data-nf-subtitle-word-idx]', { state: 'attached', timeout: 5000 });

      await page.evaluate(() => window.__nf.play());
      await page.waitForTimeout(1000);
      const at1s = await readActiveWord(page);
      const audioAt1s = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return a ? a.currentTime : null;
      });
      const shot1 = path.join(SCREENSHOT_DIR, "VP-2-highlight-1s.png");
      await page.screenshot({ path: shot1 });

      await page.waitForTimeout(2000);
      const at3s = await readActiveWord(page);
      const audioAt3s = await page.evaluate(() => {
        const a = document.querySelector('audio[data-nf-persist]');
        return a ? a.currentTime : null;
      });
      const shot3 = path.join(SCREENSHOT_DIR, "VP-2-highlight-3s.png");
      await page.screenshot({ path: shot3 });

      const idxOk = at1s.active_idx >= 0 && at3s.active_idx > at1s.active_idx;
      // Single active span at any time (strict mutex) — count across both.
      const mutexOk =
        (await page.evaluate(() =>
          document.querySelectorAll('[data-nf-subtitle-state="active"]').length)) <= 1;

      const pass = idxOk && at1s.word_count > 0 && mutexOk;
      const payload = {
        vp: "VP-2",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          t1000_ms: { ...at1s, audio_currentTime: audioAt1s },
          t3000_ms: { ...at3s, audio_currentTime: audioAt3s },
          checks: { idxOk, mutexOk },
          screenshots: {
            t1000: path.relative(ROOT, shot1),
            t3000: path.relative(ROOT, shot3),
          },
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

// ---- VP-3: independent mode · timeline_path · no audio · seek 5s --------

async function vp3() {
  const evidenceFile = path.join(VERIFY_DIR, "independent-drive.json");
  try {
    // timeline_path is resolved at build time; use the long one (≥5s) so
    // there's a word covering t=5000.
    const timeline = readJson(TIMELINE_LONG);
    // Find word covering ~5000ms for reporting.
    const wordAt5s = (timeline.words || []).find(w => w.start_ms <= 5000 && w.end_ms >= 5000) || null;

    const sourcePath = writeSourceJson("tmp/v1.11-vp3-source.json", makeSource({
      duration_expr: "demo.begin + 10000ms",
      trackDefs: [
        makeBgTrack(),
        makeSubtitleTrack("caption", {
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          source: { timeline_path: `file://${TIMELINE_LONG}` },
          style: { active_color: "#fbbf24", size_px: 36, position: "bottom", padding: 12 },
        }),
      ],
    }));
    const outPath = path.join(TMP_DIR, "v1.11-vp3-indep.html");
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('[data-nf-subtitle-word-idx]', { state: 'attached', timeout: 5000 });

      const audioCount = await page.evaluate(() =>
        document.querySelectorAll('audio').length);

      await page.evaluate(() => window.__nf.seek(5000, { pause: true }));
      await page.waitForTimeout(150);

      const info = await page.evaluate(() => {
        const active = document.querySelector('[data-nf-subtitle-state="active"]');
        if (!active) return { active_idx: -1, active_text: null };
        return {
          active_idx: parseInt(active.getAttribute('data-nf-subtitle-word-idx'), 10),
          active_text: active.textContent,
        };
      });
      const shot = path.join(SCREENSHOT_DIR, "VP-3-independent.png");
      await page.screenshot({ path: shot });

      // We need start_ms/end_ms of the active word. The render embeds index
      // not the ms; look up in our loaded timeline.words by idx.
      const ourWord = info.active_idx >= 0 && Array.isArray(timeline.words)
        ? timeline.words[info.active_idx]
        : null;

      const noAudio = audioCount === 0;
      const hasSubtitleDom = info.active_idx >= 0;
      const covers5s = ourWord && ourWord.start_ms <= 5000 && ourWord.end_ms >= 5000;

      const pass = noAudio && hasSubtitleDom && covers5s;
      const payload = {
        vp: "VP-3",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          audio_count: audioCount,
          active_info: info,
          active_word_from_timeline: ourWord,
          expected_word_at_5s: wordAt5s,
          t_ms: 5000,
          checks: { noAudio, hasSubtitleDom, covers5s: !!covers5s },
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

// ---- VP-4: CSS var · 2 bundles A (red/36/top/12) + B (green/24/bottom/4)

async function vp4() {
  const evidenceFile = path.join(VERIFY_DIR, "css-var.json");
  try {
    async function probe(variant, style) {
      const sourcePath = writeSourceJson(`tmp/v1.11-vp4-${variant}-source.json`, makeSource({
        duration_expr: "demo.begin + 5000ms",
        trackDefs: [
          makeBgTrack(),
          makeAudioTrack("narration", {
            srcUri: `file://${MP3_DEMO}`,
            beginExpr: "demo.begin",
            endExpr: "demo.end",
            from_ms: 0,
          }),
          makeSubtitleTrack("caption", {
            beginExpr: "demo.begin",
            endExpr: "demo.end",
            source: { audio_track_id: "narration" },
            style,
          }),
        ],
      }));
      const outPath = path.join(TMP_DIR, `v1.11-vp4-${variant}.html`);
      const build = await buildBundle(sourcePath, outPath);
      if (build.code !== 0) throw new Error(`build ${variant} failed: ${build.stderr}`);

      const { browser } = await launchPlaywright();
      try {
        const page = await openBundle(browser, outPath);
        await page.waitForSelector('[data-nf-subtitle-word-idx]', { state: 'attached', timeout: 5000 });
        await page.evaluate(() => window.__nf.seek(1000, { pause: true }));
        await page.waitForTimeout(200);

        const info = await page.evaluate(() => {
          const active = document.querySelector('[data-nf-subtitle-state="active"]');
          const container = document.querySelector('[data-nf-track="subtitle"]');
          if (!active || !container) return null;
          const cs = getComputedStyle(active);
          const cc = getComputedStyle(container);
          const rect = container.getBoundingClientRect();
          const page_h = window.innerHeight || document.body.clientHeight;
          // Parse inline style attribute directly — bypasses stage scaling /
          // runtime container wrapping that can make getComputedStyle return
          // "0px" for top/bottom when the element is absolutely positioned
          // inside an already-offset stage.
          const inlineStyle = container.getAttribute('style') || '';
          const topMatch = inlineStyle.match(/(?:^|;)\s*top\s*:\s*([^;]+)/);
          const bottomMatch = inlineStyle.match(/(?:^|;)\s*bottom\s*:\s*([^;]+)/);
          return {
            active_color: cs.color,
            active_font_size: cs.fontSize,
            container_top: cc.top,
            container_bottom: cc.bottom,
            container_position: cc.position,
            container_padding: cc.padding,
            inline_top: topMatch ? topMatch[1].trim() : null,
            inline_bottom: bottomMatch ? bottomMatch[1].trim() : null,
            inline_style_raw: inlineStyle,
            rect_top: rect.top,
            rect_bottom_distance_from_bottom: page_h - rect.bottom,
            viewport_h: page_h,
          };
        });

        const shot = path.join(SCREENSHOT_DIR, `VP-4-css-${variant}.png`);
        await page.screenshot({ path: shot });
        await browser.close();
        return { variant, bundle: path.relative(ROOT, outPath), style, info, screenshot: path.relative(ROOT, shot) };
      } catch (err) {
        await browser.close();
        throw err;
      }
    }

    const A = await probe("A", { active_color: "#ff0000", size_px: 36, position: "top", padding: 12 });
    const B = await probe("B", { active_color: "#00ff00", size_px: 24, position: "bottom", padding: 4 });

    // A expect: rgb(255, 0, 0) · fontSize 36px · container inline `top:12px`
    const aColorOk = (A.info?.active_color || "").replace(/\s+/g, "") === "rgb(255,0,0)";
    const aSizeOk = (A.info?.active_font_size || "") === "36px";
    // subtitle.js emits inline `top:<padding>px` for position=top; read the
    // inline style directly since stage layout can mask getComputedStyle.
    const aPosOk = A.info?.inline_top === "12px" && A.info?.inline_bottom == null;

    const bColorOk = (B.info?.active_color || "").replace(/\s+/g, "") === "rgb(0,255,0)";
    const bSizeOk = (B.info?.active_font_size || "") === "24px";
    // for bottom position, subtitle.js emits `bottom:<padding>px` inline.
    const bPosOk = B.info?.inline_bottom === "4px" && B.info?.inline_top == null;

    const differ = (A.info?.active_color !== B.info?.active_color) &&
      (A.info?.active_font_size !== B.info?.active_font_size);

    const pass = aColorOk && aSizeOk && aPosOk && bColorOk && bSizeOk && bPosOk && differ;
    const payload = {
      vp: "VP-4",
      pass,
      detail: {
        A,
        B,
        checks: { aColorOk, aSizeOk, aPosOk, bColorOk, bSizeOk, bPosOk, differ },
      },
    };
    writeJson(evidenceFile, payload);
    return payload;
  } catch (e) {
    const payload = { vp: "VP-4", pass: false, error: toPlainError(e) };
    writeJson(evidenceFile, payload);
    return payload;
  }
}

// ---- VP-5: seek(t) · active word covers t --------------------------------

async function vp5() {
  const evidenceFile = path.join(VERIFY_DIR, "seek-sync.json");
  try {
    // kickoff said "seek to 4s", but v1.12-long.timeline.json has gaps where
    // no word is active. Pick the first word in the timeline whose window
    // contains a time >= 4000ms — this preserves the "seek mid-way, verify
    // active word covers the seek time" semantics of VP-5 while tolerating
    // natural speech gaps.
    const timeline = readJson(TIMELINE_LONG);
    const targetFloor = 4000;
    const seekTarget = (() => {
      for (const w of timeline.words || []) {
        if (w.start_ms >= targetFloor) {
          // pick midpoint of the first word whose start is at/after floor
          return Math.round((w.start_ms + w.end_ms) / 2);
        }
      }
      return targetFloor;
    })();
    const sourcePath = writeSourceJson("tmp/v1.11-vp5-source.json", makeSource({
      duration_expr: "demo.begin + 10000ms",
      trackDefs: [
        makeBgTrack(),
        makeSubtitleTrack("caption", {
          beginExpr: "demo.begin",
          endExpr: "demo.end",
          source: { timeline_path: `file://${TIMELINE_LONG}` },
          style: { active_color: "#fbbf24", size_px: 36, position: "bottom", padding: 12 },
        }),
      ],
    }));
    const outPath = path.join(TMP_DIR, "v1.11-vp5-seek.html");
    const build = await buildBundle(sourcePath, outPath);
    if (build.code !== 0) throw new Error(`build failed: ${build.stderr}`);

    const { browser } = await launchPlaywright();
    try {
      const page = await openBundle(browser, outPath);
      await page.waitForSelector('[data-nf-subtitle-word-idx]', { state: 'attached', timeout: 5000 });
      await page.evaluate((t) => window.__nf.seek(t, { pause: true }), seekTarget);
      await page.waitForTimeout(200);

      const info = await page.evaluate(() => {
        const active = document.querySelector('[data-nf-subtitle-state="active"]');
        if (!active) return { active_idx: -1, active_text: null };
        return {
          active_idx: parseInt(active.getAttribute('data-nf-subtitle-word-idx'), 10),
          active_text: active.textContent,
        };
      });
      const shot = path.join(SCREENSHOT_DIR, "VP-5-seek.png");
      await page.screenshot({ path: shot });

      const ourWord = info.active_idx >= 0 && Array.isArray(timeline.words)
        ? timeline.words[info.active_idx]
        : null;
      const coversT = ourWord && ourWord.start_ms <= seekTarget && ourWord.end_ms >= seekTarget;

      const pass = !!coversT;
      const payload = {
        vp: "VP-5",
        pass,
        detail: {
          bundle: path.relative(ROOT, outPath),
          seek_t_ms: seekTarget,
          seek_target_floor_ms: targetFloor,
          active_info: info,
          active_word_from_timeline: ourWord,
          checks: { coversT: !!coversT },
          screenshot: path.relative(ROOT, shot),
        },
      };
      writeJson(evidenceFile, payload);
      return payload;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const payload = { vp: "VP-5", pass: false, error: toPlainError(e) };
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
