// Exports timelines to MP4 with the Rust recorder and falls back to ffmpeg when needed.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guarded } from "../lib/guard.js";
import { resolveTimeline } from "../lib/legacy-timeline.js";
import { exportMP4 } from "./ffmpeg-mp4.js";
import { generateHarness } from "./harness-gen.js";
import type { Timeline } from "../../../nf-core/types.js";

interface ExportRecorderOpts {
  fps?: number;
  crf?: number;
  width?: number;
  height?: number;
  dpr?: number;
  projectDir?: string;
  recorderPath?: string;
  onProgress?: (frameIdx: number, total: number) => void;
}

function normalizeCrf(value: unknown) {
  if (value === undefined || value === null) return 20;
  const crf = Number(value);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) return null;
  return crf;
}

function recorderBinary(opts: ExportRecorderOpts) {
  return opts.recorderPath || "nextframe-recorder";
}

function isRecorderAvailable(binary: string) {
  const probe = spawnSync(binary, ["--help"], { stdio: "ignore" });
  return (probe.error as NodeJS.ErrnoException | null)?.code !== "ENOENT";
}

function warnRecorderFallback(binary: string) {
  process.stderr.write(`warning: ${binary} not found in PATH, falling back to ffmpeg\n`);
}

async function runRecorder(binary: string, htmlFile: string, outputPath: string, opts: { fps: number; crf: number; dpr: number; width: number; height: number }) {
  // --parallel 1: v1.0 workaround. Parallel frame-slice mode has two known bugs:
  //   1. Short clips (< 10s): concurrent WKWebView startup yields 1x1 captures.
  //   2. Any length: child processes each record the full range instead of their
  //      assigned frame-range, concat reports duration = slices * expected.
  // Track in memory as ISSUE-007; revisit once link is green.
  const args = [
    "slide",
    htmlFile,
    "--out", outputPath,
    "--fps", String(opts.fps),
    "--crf", String(opts.crf),
    "--dpr", String(opts.dpr),
    "--width", String(opts.width),
    "--height", String(opts.height),
    "--parallel", "1",
  ];

  let child;
  try {
    child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return {
      ok: false,
      error: {
        code: e.code === "ENOENT" ? "RECORDER_NOT_FOUND" : "RECORDER_SPAWN",
        message: e.message ?? String(err),
      },
    };
  }

  let stderr = "";
  let spawnError: NodeJS.ErrnoException | null = null;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.on("error", (err: NodeJS.ErrnoException) => {
    spawnError = err;
  });

  const [exitCode] = await once(child, "close");
  if (spawnError) {
    const se = spawnError as NodeJS.ErrnoException;
    return {
      ok: false,
      error: {
        code: se.code === "ENOENT" ? "RECORDER_NOT_FOUND" : "RECORDER_SPAWN",
        message: se.message,
      },
    };
  }
  if (exitCode !== 0) {
    return {
      ok: false,
      error: {
        code: "RECORDER_FAILED",
        message: `nextframe-recorder exited ${exitCode}`,
        hint: stderr.split("\n").slice(-5).join("\n"),
      },
    };
  }
  return { ok: true };
}

/**
 * Export a timeline to an MP4 file via the Rust recorder CLI.
 * Falls back to ffmpeg when nextframe-recorder is unavailable in PATH.
 * @param {object} timeline
 * @param {string} outputPath
 * @param {{fps?: number, crf?: number, width?: number, height?: number, projectDir?: string, recorderPath?: string, onProgress?: (frameIdx: number, total: number) => void}} [opts]
 * @returns {Promise<{ok: true, value: object} | {ok: false, error: object}>}
 */
export async function exportRecorder(timeline: unknown, outputPath: string, opts: ExportRecorderOpts = {}) {
  const r = resolveTimeline(timeline as Timeline);
  if (!r.ok) return guarded("exportRecorder", { ok: false, error: r.error });
  const resolved = r.value as Timeline;

  const fps = opts.fps || resolved.project?.fps || 30;
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const dpr = Number.isFinite(opts.dpr) && (opts.dpr ?? 0) > 0 ? (opts.dpr ?? 1) : 1;
  const duration = resolved.duration ?? 0;
  const totalFrames = Math.round(duration * fps);
  const crf = normalizeCrf(opts.crf);
  if (crf === null) {
    return guarded("exportRecorder", { ok: false, error: { code: "BAD_CRF", hint: "0..51" } });
  }

  const binary = recorderBinary(opts);
  if (!isRecorderAvailable(binary)) {
    warnRecorderFallback(binary);
    return exportViaFfmpegFallback(timeline, outputPath, opts, { width, height });
  }

  const harnessDir = await mkdtemp(join(tmpdir(), "nextframe-recorder-"));
  try {
    const htmlPath = join(harnessDir, "harness.html");
    const html = generateHarness(resolved, { width, height });
    await writeFile(htmlPath, html, "utf8");

    const recorded = await runRecorder(binary, htmlPath, outputPath, {
      fps,
      crf,
      dpr,
      width,
      height,
    });
    if (!recorded.ok) {
      if (recorded.error?.code === "RECORDER_NOT_FOUND") {
        warnRecorderFallback(binary);
        return exportViaFfmpegFallback(timeline, outputPath, opts, { width, height });
      }
      return guarded("exportRecorder", recorded);
    }

    return guarded("exportRecorder", {
      ok: true,
      value: {
        outputPath,
        width,
        height,
        fps,
        duration,
        framesRendered: totalFrames,
      },
    });
  } finally {
    await rm(harnessDir, { recursive: true, force: true });
  }
}

async function exportViaFfmpegFallback(timeline: unknown, outputPath: string, opts: ExportRecorderOpts, _size: { width: number; height: number }) {
  const { fps, crf, width, height, onProgress } = opts;
  return exportMP4(timeline, outputPath, { fps, crf, width, height, onProgress });
}

interface ExportRecorderHtmlOpts {
  fps?: number;
  crf?: number;
  width?: number;
  height?: number;
  dpr?: number;
  duration?: number;
  recorderPath?: string;
}

/**
 * Record a pre-built HTML file directly to MP4 via the Rust recorder CLI.
 *
 * Used by v0.8 render pipeline: buildV08 produces a self-contained HTML with its own
 * runtime/timeline; the recorder only needs to open it and capture frames. We do not
 * fall back to ffmpeg here because the HTML is v0.8-specific and ffmpeg's renderer
 * only speaks the legacy canvas API.
 */
export async function exportRecorderHtml(htmlPath: string, outputPath: string, opts: ExportRecorderHtmlOpts = {}) {
  const fps = opts.fps && opts.fps > 0 ? opts.fps : 30;
  const width = opts.width && opts.width > 0 ? opts.width : 1920;
  const height = opts.height && opts.height > 0 ? opts.height : 1080;
  const dpr = Number.isFinite(opts.dpr) && (opts.dpr ?? 0) > 0 ? (opts.dpr ?? 1) : 1;
  const duration = opts.duration ?? 0;
  const totalFrames = Math.round(duration * fps);
  const crf = normalizeCrf(opts.crf);
  if (crf === null) {
    return guarded("exportRecorderHtml", { ok: false, error: { code: "BAD_CRF", hint: "0..51" } });
  }

  const binary = recorderBinary(opts);
  if (!isRecorderAvailable(binary)) {
    return guarded("exportRecorderHtml", {
      ok: false,
      error: {
        code: "RECORDER_NOT_FOUND",
        message: `${binary} not found in PATH`,
        hint: "build with `cargo build -p nf-recorder` or pass --recorder-path",
      },
    });
  }

  const recorded = await runRecorder(binary, htmlPath, outputPath, { fps, crf, dpr, width, height });
  if (!recorded.ok) return guarded("exportRecorderHtml", recorded);

  return guarded("exportRecorderHtml", {
    ok: true,
    value: {
      outputPath,
      width,
      height,
      fps,
      duration,
      framesRendered: totalFrames,
    },
  });
}
