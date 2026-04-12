// nextframe render <timeline.json> <out.mp4>
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { configureProjectCacheEnv, resolveTimeline, timelineDir, timelineUsage } from "./_resolve.js";
import { exportMP4, muxMP4Audio } from "../targets/ffmpeg-mp4.js";
import { exportRecorder } from "../targets/recorder.js";
import { validateTimeline } from "../engine/validate.js";

const USAGE = timelineUsage("render", "", " <out.mp4>");
const DEFAULT_CRF = 20;

const HELP = `${USAGE}

flags:
  --target <name>  export backend (supported: ffmpeg, recorder)
  --fps <n>        override export fps
  --crf <n>        override video quality (0..51)
  --width <n>      override render width
  --height <n>     override render height
  --audio <path>   mux external audio into the output mp4
  --quiet          suppress progress output
  --json           output structured JSON
`;

function toMuxFailure(result) {
  if (result?.ok || !result?.error) return result;
  if (result.error.code !== "FFMPEG_SPAWN" && result.error.code !== "FFMPEG_FAILED") return result;
  return {
    ok: false,
    error: {
      code: "MUX_FAIL",
      message: result.error.message,
      hint: result.error.hint,
    },
  };
}

function makeTempVideoPath(outPath) {
  return join(dirname(outPath), `.nextframe-video-${randomUUID()}.mp4`);
}

function parseCrfFlag(raw) {
  if (raw === undefined) return { ok: true, value: undefined };
  const crf = Number(raw);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    return { ok: false, error: { code: "BAD_CRF", hint: "0..51" } };
  }
  return { ok: true, value: crf };
}

export async function run(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

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
  const outPath = resolved.legacy ? resolved.rest[0] : resolved.mp4Path;
  const audioPath = flags.audio ? resolve(flags.audio) : null;
  if (!outPath) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }
  if (audioPath && !existsSync(audioPath)) {
    emit({
      ok: false,
      error: {
        code: "AUDIO_NOT_FOUND",
        message: `no such audio file: ${flags.audio}`,
        hint: "check --audio path",
      },
    }, flags);
    return 2;
  }
  const target = flags.target || "ffmpeg";
  if (target !== "ffmpeg" && target !== "recorder") {
    emit({
      ok: false,
      error: {
        code: "UNKNOWN_TARGET",
        hint: "supported: ffmpeg, recorder",
      },
    }, flags);
    return 2;
  }
  const crf = parseCrfFlag(flags.crf);
  if (!crf.ok) {
    emit({ ok: false, error: crf.error }, flags);
    return 2;
  }
  const effectiveCrf = crf.value ?? DEFAULT_CRF;
  const restoreCacheEnv = !resolved.legacy ? configureProjectCacheEnv(resolved.cachePath) : () => {};
  try {
    const loaded = await loadTimeline(resolved.jsonPath);
    if (!loaded.ok) {
      emit(loaded, flags);
      return 2;
    }

    // BDD cli-render-8 invariant: render must validate before touching ffmpeg.
    const projectDir = timelineDir(resolved.jsonPath);
    const v = validateTimeline(loaded.value, { projectDir });
    if (v.errors && v.errors.length > 0) {
      emit({ ok: false, error: v.errors[0], errors: v.errors, hints: v.hints }, flags);
      return 2;
    }
    const opts = {};
    if (flags.fps) opts.fps = Number(flags.fps);
    if (crf.value !== undefined) opts.crf = crf.value;
    if (flags.width) opts.width = Number(flags.width);
    if (flags.height) opts.height = Number(flags.height);
    opts.projectDir = projectDir;
    opts.onProgress = (i, total) => {
      if (!flags.quiet) {
        process.stderr.write(`  rendered ${i}/${total} frames\r`);
      }
    };
    await mkdir(dirname(outPath), { recursive: true });
    const start = Date.now();
    let r;
    const exporter = target === "recorder" ? exportRecorder : exportMP4;
    if (audioPath) {
      const tempVideoPath = makeTempVideoPath(outPath);
      const videoOnly = await exporter(loaded.value, tempVideoPath, opts);
      if (!videoOnly.ok) {
        r = toMuxFailure(videoOnly);
      } else {
        const muxed = await muxMP4Audio(tempVideoPath, audioPath, outPath);
        if (!muxed.ok) {
          r = muxed;
        } else {
          try {
            unlinkSync(tempVideoPath);
          } catch {}
          r = { ok: true, value: { ...videoOnly.value, outputPath: outPath, audioPath } };
        }
      }
    } else {
      r = await exporter(loaded.value, outPath, opts);
    }
    if (!flags.quiet) process.stderr.write("\n");
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    if (!r.ok) {
      emit(r, flags);
      return 2;
    }
    if (!resolved.legacy) {
      const logged = await appendExportLog(resolved, outPath, r.value, effectiveCrf);
      if (!logged.ok) {
        emit(logged, flags);
        return 2;
      }
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, value: { ...r.value, elapsedSeconds: Number(elapsed) } }, null, 2) + "\n");
    } else {
      process.stdout.write(`wrote ${outPath} (${r.value.framesRendered} frames @ ${r.value.fps}fps, ${elapsed}s)\n`);
    }
    return 0;
  } finally {
    restoreCacheEnv();
  }
}

async function appendExportLog(resolved, outPath, renderValue, crf) {
  const exportDir = dirname(resolved.exportsPath);
  let history = [];

  await mkdir(exportDir, { recursive: true });
  try {
    const text = await readFile(resolved.exportsPath, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        error: {
          code: "EXPORT_LOG_INVALID",
          message: `export log must be a JSON array: ${resolved.exportsPath}`,
        },
      };
    }
    history = parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      return {
        ok: false,
        error: {
          code: "EXPORT_LOG_FAIL",
          message: `cannot read export log: ${err.message}`,
        },
      };
    }
  }

  const outputStat = await stat(outPath);
  history.push({
    segment: resolved.segment,
    path: basename(outPath),
    duration: renderValue.duration,
    size: outputStat.size,
    timestamp: new Date().toISOString(),
    width: renderValue.width,
    height: renderValue.height,
    fps: renderValue.fps,
    crf,
  });

  try {
    await writeFile(resolved.exportsPath, JSON.stringify(history, null, 2) + "\n");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "EXPORT_LOG_FAIL",
        message: `cannot write export log: ${err.message}`,
      },
    };
  }
}
