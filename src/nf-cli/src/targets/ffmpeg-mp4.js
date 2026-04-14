// L1 render target — full timeline to MP4 via ffmpeg pipe.
// Adapted from POC H. Pipes raw RGBA frames into libx264.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { guarded } from "../engine/legacy/_guard.js";
import { CanvasPool, renderAt } from "../engine/legacy/render.js";
import { resolveTimeline } from "../engine/legacy/time.js";

function normalizeCrf(value) {
  if (value === undefined || value === null) return 20;
  const crf = Number(value);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) return null;
  return crf;
}

function copyFrameData(source, target) {
  if (typeof source.copy === "function") {
    source.copy(target, 0, 0, target.length);
    return;
  }
  target.set(source);
}

function writeFrame(stream, chunk) {
  return new Promise((resolve, reject) => {
    let needsDrain = false;
    let writeDone = false;
    let drainDone = false;
    let settled = false;

    const cleanup = () => {
      stream.off("error", onError);
      if (needsDrain) stream.off("drain", onDrain);
    };
    const finish = () => {
      if (settled || !writeDone) return;
      if (needsDrain && !drainDone) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onDrain = () => {
      drainDone = true;
      finish();
    };

    stream.once("error", onError);
    try {
      needsDrain = !stream.write(chunk, (err) => {
        if (err) {
          onError(err);
          return;
        }
        writeDone = true;
        finish();
      });
    } catch (err) {
      onError(err);
      return;
    }

    if (needsDrain) {
      stream.once("drain", onDrain);
    } else {
      drainDone = true;
      finish();
    }
  });
}

/**
 * Export a timeline to an MP4 file.
 * @param {object} timeline
 * @param {string} outputPath - absolute path
 * @param {{fps?: number, crf?: number, width?: number, height?: number, ffmpegPath?: string, useCanvasPool?: boolean, onProgress?: (frameIdx, total) => void}} [opts]
 * @returns {Promise<{ok: true, value: object} | {ok: false, error: object}>}
 */
export async function exportMP4(timeline, outputPath, opts = {}) {
  const r = resolveTimeline(timeline);
  if (!r.ok) return guarded("exportMP4", { ok: false, error: r.error });
  const resolved = r.value;

  const fps = opts.fps || resolved.project?.fps || 30;
  const width = opts.width || resolved.project?.width || 1920;
  const height = opts.height || resolved.project?.height || 1080;
  const duration = resolved.duration;
  const totalFrames = Math.round(duration * fps);
  const ffmpegPath = opts.ffmpegPath || "ffmpeg";
  const crf = normalizeCrf(opts.crf);
  const useCanvasPool = opts.useCanvasPool !== false;
  if (crf === null) {
    return guarded("exportMP4", { ok: false, error: { code: "BAD_CRF", hint: "0..51" } });
  }

  const ffmpegArgs = [
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${width}x${height}`,
    "-r", String(fps),
    "-i", "-",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", String(crf),
    "-preset", "fast",
    outputPath,
  ];

  let ffmpeg;
  try {
    ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "ignore", "pipe"] });
  } catch (err) {
    return guarded("exportMP4", { ok: false, error: { code: "FFMPEG_SPAWN", message: err.message } });
  }

  let stderr = "";
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const canvasPool = useCanvasPool ? new CanvasPool(2) : null;
  const offscreenCanvasPool = useCanvasPool ? new CanvasPool(2) : null;
  const frameBytes = width * height * 4;
  const rgbaBuffers = [Buffer.allocUnsafe(frameBytes), Buffer.allocUnsafe(frameBytes)];
  const writeDone = [Promise.resolve(), Promise.resolve()];
  let renderedFrames = 0;
  let firstError = null;
  let pipeError = null;

  const renderFrameIntoSlot = (frameIdx, slot) => {
    const frame = renderAt(resolved, frameIdx / fps, {
      width,
      height,
      useCanvasPool,
      canvasPool,
      offscreenCanvasPool,
    });
    if (!frame.ok) return frame;
    try {
      copyFrameData(frame.canvas.data(), rgbaBuffers[slot]);
    } finally {
      frame.release();
    }
    return frame;
  };

  if (totalFrames > 0) {
    const firstFrame = renderFrameIntoSlot(0, 0);
    if (!firstFrame.ok) {
      firstError = firstFrame.error;
    }
  }

  try {
    for (let i = 0; i < totalFrames && !firstError; i++) {
      const currentSlot = i % 2;
      writeDone[currentSlot] = writeFrame(ffmpeg.stdin, rgbaBuffers[currentSlot]);

      const nextFrameIdx = i + 1;
      if (nextFrameIdx < totalFrames) {
        const nextSlot = nextFrameIdx % 2;
        await writeDone[nextSlot];
        const nextFrame = renderFrameIntoSlot(nextFrameIdx, nextSlot);
        if (!nextFrame.ok) {
          firstError = nextFrame.error;
          break;
        }
      }

      renderedFrames++;
      if (opts.onProgress && (renderedFrames % 30 === 0 || renderedFrames === totalFrames)) {
        opts.onProgress(renderedFrames, totalFrames);
      }
    }
    await Promise.all(writeDone);
  } catch (err) {
    pipeError = err;
  }

  ffmpeg.stdin.end();
  const [exitCode] = await once(ffmpeg, "close");

  if (firstError) {
    return guarded("exportMP4", { ok: false, error: firstError, stderr });
  }
  if (pipeError) {
    return guarded("exportMP4", {
      ok: false,
      error: {
        code: "FFMPEG_PIPE",
        message: pipeError.message,
        hint: stderr.split("\n").slice(-5).join("\n"),
      },
    });
  }
  if (exitCode !== 0) {
    return guarded("exportMP4", {
      ok: false,
      error: {
        code: "FFMPEG_FAILED",
        message: `ffmpeg exited ${exitCode}`,
        hint: stderr.split("\n").slice(-5).join("\n"),
      },
    });
  }

  return guarded("exportMP4", {
    ok: true,
    value: {
      outputPath,
      width,
      height,
      fps,
      duration,
      framesRendered: renderedFrames,
    },
  });
}

/**
 * Mux an external audio track into an MP4 file.
 * @param {string} videoPath
 * @param {string} audioPath
 * @param {string} outputPath
 * @param {{ffmpegPath?: string}} [opts]
 * @returns {Promise<{ok: true, value: object} | {ok: false, error: object}>}
 */
export async function muxMP4Audio(videoPath, audioPath, outputPath, opts = {}) {
  const ffmpegPath = opts.ffmpegPath || "ffmpeg";
  const ffmpegArgs = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    outputPath,
  ];

  let ffmpeg;
  try {
    ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    return guarded("muxMP4Audio", {
      ok: false,
      error: { code: "MUX_FAIL", message: err.message, hint: `ffmpeg ${ffmpegArgs.join(" ")}` },
    });
  }

  let stderr = "";
  ffmpeg.stderr.setEncoding("utf8");
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const [exitCode] = await once(ffmpeg, "close");
  if (exitCode !== 0) {
    return guarded("muxMP4Audio", {
      ok: false,
      error: {
        code: "MUX_FAIL",
        message: `ffmpeg exited ${exitCode}`,
        hint: stderr.split("\n").slice(-5).join("\n"),
      },
    });
  }

  return guarded("muxMP4Audio", { ok: true, value: { outputPath, videoPath, audioPath } });
}
