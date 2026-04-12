import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bakeBrowserScenes } from "../cli/bakeBrowser.js";
import { guarded } from "../engine/_guard.js";
import { renderAt } from "../engine/render.js";
import { resolveTimeline } from "../engine/time.js";
import { exportMP4 } from "./ffmpeg-mp4.js";

function normalizeCrf(value) {
  if (value === undefined || value === null) return 20;
  const crf = Number(value);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) return null;
  return crf;
}

function recorderBinary(opts = {}) {
  return opts.recorderPath || "nextframe-recorder";
}

function isRecorderAvailable(binary) {
  const probe = spawnSync(binary, ["--help"], { stdio: "ignore" });
  return probe.error?.code !== "ENOENT";
}

function warnRecorderFallback(binary) {
  process.stderr.write(`warning: ${binary} not found in PATH, falling back to ffmpeg\n`);
}

async function renderFrameFiles(timeline, dir, opts) {
  const frameFiles = [];
  for (let i = 0; i < opts.totalFrames; i++) {
    const t = i / opts.fps;
    const frame = renderAt(timeline, t, { width: opts.width, height: opts.height });
    if (!frame.ok) {
      return { ok: false, error: frame.error };
    }
    const framePath = join(dir, `frame-${String(i).padStart(6, "0")}.png`);
    await writeFile(framePath, frame.canvas.toBuffer("image/png"));
    frameFiles.push(framePath);
    if (opts.onProgress && ((i + 1) % 30 === 0 || i + 1 === opts.totalFrames)) {
      opts.onProgress(i + 1, opts.totalFrames);
    }
  }
  return { ok: true, value: frameFiles };
}

async function runRecorder(binary, frameFiles, outputPath, opts) {
  const args = [
    "slide",
    ...frameFiles,
    "--out", outputPath,
    "--fps", String(opts.fps),
    "--crf", String(opts.crf),
    "--width", String(opts.width),
    "--height", String(opts.height),
  ];

  let child;
  try {
    child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err.code === "ENOENT" ? "RECORDER_NOT_FOUND" : "RECORDER_SPAWN",
        message: err.message,
      },
    };
  }

  let stderr = "";
  let spawnError = null;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (err) => {
    spawnError = err;
  });

  const [exitCode] = await once(child, "close");
  if (spawnError) {
    return {
      ok: false,
      error: {
        code: spawnError.code === "ENOENT" ? "RECORDER_NOT_FOUND" : "RECORDER_SPAWN",
        message: spawnError.message,
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
export async function exportRecorder(timeline, outputPath, opts = {}) {
  const r = resolveTimeline(timeline);
  if (!r.ok) return guarded("exportRecorder", { ok: false, error: r.error });
  const resolved = r.value;

  const fps = opts.fps || resolved.project?.fps || 30;
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const duration = resolved.duration;
  const totalFrames = Math.round(duration * fps);
  const crf = normalizeCrf(opts.crf);
  if (crf === null) {
    return guarded("exportRecorder", { ok: false, error: { code: "BAD_CRF", hint: "0..51" } });
  }

  const baked = await bakeBrowserScenes(timeline, {
    width,
    height,
    rootDir: opts.projectDir,
  });
  if (!baked.ok) return guarded("exportRecorder", baked);

  const binary = recorderBinary(opts);
  if (!isRecorderAvailable(binary)) {
    warnRecorderFallback(binary);
    return exportMP4(timeline, outputPath, opts);
  }

  const framesDir = await mkdtemp(join(tmpdir(), "nextframe-recorder-"));
  try {
    const frameFiles = await renderFrameFiles(resolved, framesDir, {
      fps,
      width,
      height,
      totalFrames,
      onProgress: opts.onProgress,
    });
    if (!frameFiles.ok) {
      return guarded("exportRecorder", frameFiles);
    }

    const recorded = await runRecorder(binary, frameFiles.value, outputPath, {
      fps,
      crf,
      width,
      height,
    });
    if (!recorded.ok) {
      if (recorded.error.code === "RECORDER_NOT_FOUND") {
        warnRecorderFallback(binary);
        return exportMP4(timeline, outputPath, opts);
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
    await rm(framesDir, { recursive: true, force: true });
  }
}
