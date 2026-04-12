import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { validateTimeline } from "../engine/validate.js";
import {
  cachedFramePath,
  ensureVideoCacheDir,
  normalizeSourceFps,
  quantizeVideoTime,
  resolveVideoInputPath,
} from "../scenes/_video-cache.js";

function collectJobs(timeline, timelineDir) {
  const width = timeline.project?.width || 1920;
  const height = timeline.project?.height || 1080;
  const timelineFps = timeline.project?.fps || 30;
  const jobs = new Map();

  for (const track of timeline.tracks || []) {
    if (track.kind === "audio" || track.muted) continue;
    for (const clip of track.clips || []) {
      if (clip.scene !== "videoClip") continue;
      const src = typeof clip.params?.src === "string" ? clip.params.src : "";
      if (!src) {
        return {
          ok: false,
          error: {
            code: "BAD_VIDEO_SRC",
            message: `clip "${clip.id}" is missing videoClip params.src`,
            ref: clip.id,
          },
        };
      }
      const sourceFps = normalizeSourceFps(clip.params?.fps);
      const offset = Number(clip.params?.offset) || 0;
      const frameCount = Math.max(1, Math.ceil((clip.dur || 0) * timelineFps - 1e-9));
      const inputPath = resolveVideoInputPath(src, timelineDir);

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        const localT = frameIndex / timelineFps;
        const videoT = quantizeVideoTime(offset + localT, sourceFps);
        const cachePath = cachedFramePath(src, videoT, width, height);
        if (jobs.has(cachePath)) continue;
        jobs.set(cachePath, {
          cachePath,
          clipId: clip.id,
          height,
          inputPath,
          src,
          videoT,
          width,
        });
      }
    }
  }

  return { ok: true, value: [...jobs.values()] };
}

function extractFrame(job) {
  const ffmpegArgs = [
    "-loglevel", "error",
    "-y",
    "-ss", job.videoT.toFixed(3),
    "-i", job.inputPath,
    "-frames:v", "1",
    "-vf", `scale=${job.width}:${job.height}`,
    job.cachePath,
  ];
  const result = spawnSync("ffmpeg", ffmpegArgs, { encoding: "utf8" });
  if (result.error) {
    return {
      ok: false,
      error: {
        code: "FFMPEG_SPAWN",
        message: `failed to spawn ffmpeg: ${result.error.message}`,
        hint: `ffmpeg ${ffmpegArgs.join(" ")}`,
      },
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error: {
        code: "FFMPEG_FAILED",
        message: result.stderr?.trim() || `ffmpeg exited ${result.status}`,
        hint: `ffmpeg ${ffmpegArgs.join(" ")}`,
      },
    };
  }
  return { ok: true };
}

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("bake-video") });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const projectDir = timelineDir(resolved.jsonPath);
  const validated = validateTimeline(loaded.value, { projectDir });
  if (!validated.ok) {
    emit({ ok: false, error: validated.error, errors: validated.errors, warnings: validated.warnings, hints: validated.hints }, flags);
    return 2;
  }

  const collected = collectJobs(validated.resolved || validated.value, projectDir);
  if (!collected.ok) {
    emit(collected, flags);
    return 2;
  }

  ensureVideoCacheDir();
  const jobs = collected.value;
  let extracted = 0;
  let skipped = 0;

  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index];
    if (!existsSync(job.inputPath)) {
      emit({
        ok: false,
        error: {
          code: "VIDEO_NOT_FOUND",
          message: `video source not found: ${job.inputPath}`,
          ref: job.clipId,
        },
      }, flags);
      return 2;
    }

    if (existsSync(job.cachePath)) {
      skipped += 1;
      process.stderr.write(`bake-video ${index + 1}/${jobs.length} cached ${job.src} @ ${job.videoT.toFixed(3)}s\n`);
      continue;
    }

    process.stderr.write(`bake-video ${index + 1}/${jobs.length} extracting ${job.src} @ ${job.videoT.toFixed(3)}s\n`);
    const result = extractFrame(job);
    if (!result.ok) {
      emit(result, flags);
      return 2;
    }
    extracted += 1;
  }

  emit({
    ok: true,
    value: {
      clipsScanned: jobs.length,
      extracted,
      skipped,
      cacheDir: "/tmp/nextframe-video-cache",
    },
  }, flags);
  return 0;
}
