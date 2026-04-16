// nextframe preview <timeline.json> [--time 3] [--times 0,5,10] [--auto] [--out /tmp]
//
// Builds HTML, opens in headless Chrome, screenshots key frames.
// --auto: auto-detect interesting frames (layer transitions, midpoints)
// Returns paths to PNG files for AI to inspect.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { parseFlags, emit } from "../_helpers/_io.js";
import { resolveTimeline, timelineUsage } from "../_helpers/_resolve.js";
import { buildHTML } from "../../../../nf-core/engine/build.js";

function getPreviewViewport(timeline: Record<string, unknown>) {
  const proj = timeline.project as Record<string, unknown> | undefined;
  const width = Number(proj?.width || timeline.width || 1920);
  const height = Number(proj?.height || timeline.height || 1080);
  const isPortrait = height > width;
  const isSquare = Math.abs(width - height) < 50;

  if (isSquare) {
    return { width: 1080, height: 1200 };
  }
  if (isPortrait) {
    return { width: 430, height: 932 };
  }
  return { width: 1440, height: 900 };
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("preview", " [--times=0,5,10]") });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const jsonPath = resolved.jsonPath;
  let timeline;
  try {
    timeline = JSON.parse(await readFile(jsonPath, "utf-8"));
  } catch (e: unknown) {
    emit({ ok: false, error: { code: "READ_FAIL", message: (e as Error).message } }, flags);
    return 2;
  }

  // Determine which times to screenshot
  let times: number[] = [];
  if (flags.time != null) {
    times = [parseFloat(String(flags.time))];
  } else if (flags.times) {
    times = String(flags.times).split(",").map(Number).filter(Number.isFinite);
  } else if (flags.auto || (!flags.time && !flags.times)) {
    // Auto-detect key frames: start of each content layer + midpoint + end
    times = autoDetectFrames(timeline);
  }

  if (times.length === 0) {
    emit({ ok: false, error: { code: "NO_TIMES", message: "no times to screenshot" } }, flags);
    return 3;
  }

  // Build HTML to temp file
  const outDir = flags.out ? resolve(String(flags.out)) : resolve(tmpdir(), "nextframe-preview");
  await mkdir(outDir, { recursive: true });
  const htmlPath = resolve(outDir, "preview.html");
  const buildResult = buildHTML(timeline, htmlPath);
  if (!buildResult.ok) {
    emit(buildResult, flags);
    return 2;
  }

  // Launch puppeteer and screenshot
  let puppeteer;
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    // Try from nextframe-cli node_modules
    const modPath = resolve(dirname(new URL(import.meta.url).pathname), "../../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
    puppeteer = await import(modPath);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const page = await browser.newPage();
  await page.setViewport(getPreviewViewport(timeline));

  const errors: string[] = [];
  page.on("pageerror", (err: { message: string }) => errors.push((err as Error).message));

  await page.goto("file://" + htmlPath, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 500));

  const BG_IDS = /^(bg|vignette|stars|dark|overlay|rings|noise|wave|ripple|marquee|subtitle|lower|badge|firefl|confetti|chrome|frame|subs|sub-)/i;
  const screenshots = [];
  const issues = [];

  for (const t of times) {
    await page.evaluate((time: number) => (window as Window & { __onFrame?: (t: number) => void }).__onFrame?.(time), t);
    await new Promise((r) => setTimeout(r, 300));

    const framePath = resolve(outDir, `frame-${t.toFixed(1)}s.png`);
    await page.screenshot({ path: framePath });

    // Analyze frame: layout + overlap detection
    const analysis = await page.evaluate((time: number) => {
      const layers = document.querySelectorAll(".nf-layer");
      const visible: Record<string, unknown>[] = [];
      const stage = document.getElementById("stage");
      const sr = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, width: 1920, height: 1080 };

      layers.forEach((el) => {
        const hel = el as HTMLElement;
        if (hel.style.display === "none") return;
        const id = hel.dataset["layerId"];
        const opacity = parseFloat(hel.style.opacity) || 1;
        const rect = hel.getBoundingClientRect();
        // Position relative to stage
        const x = Math.round(rect.left - sr.left);
        const y = Math.round(rect.top - sr.top);
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const isFullscreen = w >= sr.width * 0.9 && h >= sr.height * 0.9;
        // Get blend mode and z-index
        const cs = getComputedStyle(hel);
        const blend = cs.mixBlendMode || "normal";
        const zIndex = hel.style.zIndex || "auto";
        // Check if has actual content (not just empty container)
        const hasContent = el.querySelector("canvas, svg, div, img, video, h1, p, span") !== null;
        visible.push({ id, x, y, w, h, opacity: +opacity.toFixed(2), isFullscreen, blend, zIndex, hasContent });
      });

      return { time, visibleCount: visible.length, visible, stageW: Math.round(sr.width), stageH: Math.round(sr.height) };
    }, t);

    // Detect issues — exclude known background/overlay layers
    const fullscreenContent = analysis.visible.filter(
      (v: Record<string, unknown>) => v.isFullscreen && Number(v.opacity) > 0.3 && !BG_IDS.test(String(v.id))
    );
    if (fullscreenContent.length > 1) {
      issues.push({ time: t, type: "CONTENT_OVERLAP", message: `${fullscreenContent.length} fullscreen content layers visible at same time`, layers: fullscreenContent.map((v: Record<string, unknown>) => v.id) });
    }
    if (analysis.visibleCount === 0) {
      issues.push({ time: t, type: "EMPTY_FRAME", message: "no visible layers — blank frame" });
    }

    screenshots.push({ time: t, path: framePath, ...analysis });
  }

  await browser.close();

  const screenshotSummary = screenshots.map((s) => ({ time: s.time, path: s.path, visible: s.visibleCount }));
  const result = {
    ok: true,
    value: {
      screenshots: screenshotSummary,
      issues,
      jsErrors: errors,
      htmlPath,
    },
    screenshots: screenshotSummary,
    issues,
    jsErrors: errors,
    htmlPath,
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    for (const s of screenshots) {
      process.stdout.write(`\n── t=${s.time.toFixed(1)}s ── ${s.visibleCount} layers ── ${s.path}\n`);
      // Layout map
      for (const v of s.visible) {
        const pos = v.isFullscreen ? "FULL" : `${v.x},${v.y} ${v.w}x${v.h}`;
        const role = BG_IDS.test(v.id) ? "bg" : "CONTENT";
        const extra = [];
        if (v.blend !== "normal") extra.push(`blend:${v.blend}`);
        if (v.opacity < 1) extra.push(`α:${v.opacity}`);
        const tag = extra.length ? ` (${extra.join(" ")})` : "";
        process.stdout.write(`  z${String(v.zIndex).padStart(2)} ${v.id.padEnd(22)} ${pos.padEnd(18)} ${role}${tag}\n`);
      }
    }
    process.stdout.write(`\n${outDir}/\n`);
    if (issues.length) {
      process.stdout.write(`\n⚠ ${issues.length} issues:\n`);
      for (const i of issues) {
        process.stdout.write(`  t=${i.time.toFixed(1)}s  ${i.type}: ${i.message}\n`);
      }
    }
    if (errors.length) {
      process.stdout.write(`\n✗ ${errors.length} JS errors:\n`);
      for (const e of errors) process.stdout.write(`  ${e}\n`);
    }
  }

  return issues.length > 0 ? 1 : 0;
}

function autoDetectFrames(timeline: Record<string, unknown>) {
  const times = new Set<number>();
  const dur = Number(timeline.duration || 10);

  // Always include start and near-end
  times.add(0.5);
  times.add(dur - 0.5);

  // Each layer's start + midpoint
  const layers = Array.isArray(timeline.layers) ? timeline.layers : [];
  for (const layer of layers as Record<string, unknown>[]) {
    const s = Number(layer.start || 0);
    const d = Number(layer.dur || 5);
    times.add(Math.round((s + 0.5) * 10) / 10); // just after start
    times.add(Math.round((s + d / 2) * 10) / 10); // midpoint
  }

  // Deduplicate and sort, limit to ~10 frames
  const sorted = [...times].filter((t) => t >= 0 && t <= Number(dur)).sort((a, b) => a - b);

  // If too many, sample evenly
  if (sorted.length > 12) {
    const step = Number(dur) / 10;
    const sampled = [];
    for (let t = 0.5; t < dur; t += step) {
      sampled.push(Math.round(t * 10) / 10);
    }
    return sampled;
  }

  return sorted;
}
