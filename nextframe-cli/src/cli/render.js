// nextframe render <timeline.json> <out.mp4>
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { exportMP4, muxMP4Audio } from "../targets/ffmpeg-mp4.js";
import { validateTimeline } from "../engine/validate.js";

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
  const { positional, flags } = parseFlags(argv);
  const [path, outPath] = positional;
  const audioPath = flags.audio ? resolve(flags.audio) : null;
  if (!path || !outPath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe render <timeline> <out.mp4>" } }, flags);
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
  if (target !== "ffmpeg") {
    emit({
      ok: false,
      error: {
        code: "UNKNOWN_TARGET",
        hint: "supported: ffmpeg",
      },
    }, flags);
    return 2;
  }
  const crf = parseCrfFlag(flags.crf);
  if (!crf.ok) {
    emit({ ok: false, error: crf.error }, flags);
    return 2;
  }
  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  // BDD cli-render-8 invariant: render must validate before touching ffmpeg.
  const v = validateTimeline(loaded.value);
  if (v.errors && v.errors.length > 0) {
    emit({ ok: false, error: v.errors[0], errors: v.errors, hints: v.hints }, flags);
    return 2;
  }
  const opts = {};
  if (flags.fps) opts.fps = Number(flags.fps);
  if (crf.value !== undefined) opts.crf = crf.value;
  opts.onProgress = (i, total) => {
    if (!flags.quiet) {
      process.stderr.write(`  rendered ${i}/${total} frames\r`);
    }
  };
  const start = Date.now();
  let r;
  if (audioPath) {
    const tempVideoPath = makeTempVideoPath(outPath);
    const videoOnly = await exportMP4(loaded.value, tempVideoPath, opts);
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
    r = await exportMP4(loaded.value, outPath, opts);
  }
  if (!flags.quiet) process.stderr.write("\n");
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { ...r.value, elapsedSeconds: Number(elapsed) } }, null, 2) + "\n");
  } else {
    process.stdout.write(`wrote ${outPath} (${r.value.framesRendered} frames @ ${r.value.fps}fps, ${elapsed}s)\n`);
  }
  return 0;
}
