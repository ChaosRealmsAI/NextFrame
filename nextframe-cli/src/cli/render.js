import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { validateTimeline } from "../engine-v2/validate.js";
import { timelineMetrics } from "../engine-v2/timeline.js";
import { captureFrames, encodeFramesToMp4 } from "../targets/browser.js";
import { muxMP4Audio } from "../targets/ffmpeg-mp4.js";
import { exportRecorder } from "../targets/recorder.js";

const USAGE = timelineUsage("render", "", " <out.mp4>");

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: USAGE });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  if (!resolved.legacy && resolved.rest.length > 0) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const outPath = resolved.legacy ? (resolved.rest[0] || resolved.mp4Path) : resolved.mp4Path;
  if (!outPath) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const validation = validateTimeline(loaded.value);
  if (!validation.ok) {
    emit({ ok: false, error: { code: "VALIDATION_FAILED", message: validation.errors[0]?.message || "validation failed" }, ...validation }, flags);
    return 2;
  }

  const target = flags.target || "browser";
  const metrics = timelineMetrics(loaded.value);
  const effectiveFps = Number(flags.fps) || metrics.fps;
  const effectiveCrf = Number.isInteger(Number(flags.crf)) ? Number(flags.crf) : 20;
  const audioPath = typeof flags.audio === "string" ? flags.audio : null;

  let rendered;
  if (target === "recorder") {
    rendered = await exportRecorder(loaded.value, outPath, {
      fps: effectiveFps,
      crf: effectiveCrf,
      baseDir: timelineDir(resolved.jsonPath),
    });
  } else if (target === "browser") {
    rendered = await exportViaBrowser(loaded.value, outPath, {
      fps: effectiveFps,
      crf: effectiveCrf,
      baseDir: timelineDir(resolved.jsonPath),
    });
  } else {
    emit({ ok: false, error: { code: "BAD_TARGET", message: `unsupported target "${target}"` } }, flags);
    return 2;
  }

  if (!rendered.ok) {
    emit(rendered, flags);
    return 2;
  }

  let finalValue = rendered.value;
  if (audioPath) {
    const muxedPath = `${outPath.replace(/\.mp4$/i, "")}.muxed.mp4`;
    const muxed = await muxMP4Audio(outPath, audioPath, muxedPath, {});
    if (!muxed.ok) {
      emit(muxed, flags);
      return 2;
    }
    finalValue = { ...finalValue, audioPath, muxedPath };
  }

  emit({ ok: true, value: finalValue }, flags);
  return 0;
}

async function exportViaBrowser(timeline, outPath, opts) {
  const { fps, duration, width, height } = { ...timelineMetrics(timeline), fps: opts.fps };
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const times = Array.from({ length: frameCount }, (_value, index) => index / fps);
  const frameDir = await mkdtemp(join(tmpdir(), "nextframe-browser-render-"));

  try {
    const captured = await captureFrames(timeline, times, frameDir, { baseDir: opts.baseDir });
    if (!captured.ok) return captured;
    const encoded = await encodeFramesToMp4(frameDir, outPath, { fps, crf: opts.crf });
    if (!encoded.ok) return encoded;
    return {
      ok: true,
      value: {
        outputPath: outPath,
        width,
        height,
        fps,
        duration,
        framesRendered: frameCount,
      },
    };
  } finally {
    await rm(frameDir, { recursive: true, force: true });
  }
}
