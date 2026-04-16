// nextframe render <timeline.json> <out.mp4>
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";
import { configureProjectCacheEnv, resolveTimeline, timelineDir, timelineUsage } from "../_helpers/_resolve.js";
import { exportMP4, muxMP4Audio } from "../../targets/ffmpeg-mp4.js";
import { exportRecorder, exportRecorderHtml } from "../../targets/recorder.js";
import { exportBrowser } from "../../targets/browser.js";
import { detectFormat, validateTimelineLegacy, validateTimelineV08, validateTimelineV3 } from "../_helpers/_timeline-validate.js";
import { buildV08 } from "../../../../nf-core/engine/build-v08.js";
import type { TimelineV08 } from "../../../../nf-core/types.js";

const USAGE = timelineUsage("render", "", " <out.mp4>");
const DEFAULT_CRF = 20;

const HELP = `${USAGE}

flags:
  --target <name>  export backend (supported: ffmpeg, recorder, browser)
  --fps <n>        override export fps
  --crf <n>        override video quality (0..51)
  --width <n>      override render width
  --height <n>     override render height
  --audio <path>   mux external audio into the output mp4
  --quiet          suppress progress output
  --json           output structured JSON
`;

function toMuxFailure(result: Record<string, unknown>) {
  if (result?.ok || !result?.error) return result;
  const err = result.error as Record<string, unknown>;
  if (err.code !== "FFMPEG_SPAWN" && err.code !== "FFMPEG_FAILED") return result;
  return {
    ok: false,
    error: {
      code: "MUX_FAIL",
      message: err.message,
      hint: err.hint,
    },
  };
}

function makeTempVideoPath(outPath: string) {
  return join(dirname(outPath), `.nextframe-video-${randomUUID()}.mp4`);
}

// v0.8 intermediate HTML path — project root tmp/ (not system /tmp per no-system-tmp rule).
// Named from timeline file + timestamp for traceability; retained on failure for debugging.
function makeTempHtmlPath(timelineJsonPath: string) {
  const stem = basename(timelineJsonPath).replace(/\.json$/i, "") || "timeline";
  const ts = Date.now();
  return resolve(process.cwd(), "tmp", `render-v08-${stem}-${ts}.html`);
}

interface RenderOpts {
  fps?: number;
  crf?: number;
  width?: number;
  height?: number;
}

function computeV08Duration(timeline: TimelineV08): number {
  let maxMs = 0;
  const scan = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value) && value > maxMs) maxMs = value;
  };
  for (const entry of Object.values(timeline.anchors || {})) {
    if (!entry || typeof entry !== "object") continue;
    scan((entry as Record<string, unknown>).begin);
    scan((entry as Record<string, unknown>).end);
    scan((entry as Record<string, unknown>).at);
  }
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  for (const track of tracks) {
    const clips = Array.isArray((track as Record<string, unknown>).clips)
      ? ((track as Record<string, unknown>).clips as Record<string, unknown>[])
      : [];
    for (const clip of clips) {
      const begin = clip.begin;
      const end = clip.end;
      const at = clip.at;
      if (typeof begin === "number") scan(begin);
      if (typeof end === "number") scan(end);
      if (typeof at === "number") scan(at);
    }
  }
  return maxMs / 1000;
}

async function renderV08({
  timeline,
  timelineJsonPath,
  outPath,
  audioPath,
  opts,
  flags,
}: {
  timeline: TimelineV08;
  timelineJsonPath: string;
  outPath: string;
  audioPath: string | null;
  opts: RenderOpts;
  flags: Record<string, string | boolean>;
}): Promise<{ result: Record<string, unknown>; htmlPath: string }> {
  const v = validateTimelineV08(timeline);
  if (!v.ok && v.errors.length > 0) {
    return {
      result: { ok: false, error: v.errors[0] },
      htmlPath: "",
    };
  }

  await mkdir(resolve(process.cwd(), "tmp"), { recursive: true });
  const htmlPath = makeTempHtmlPath(timelineJsonPath);

  try {
    await buildV08(timeline, htmlPath);
  } catch (error) {
    const err = error as Error & { code?: string; issues?: unknown; field?: string; fix?: string };
    return {
      result: {
        ok: false,
        error: {
          code: err.code || "BUILD_FAIL",
          message: err.message || "v0.8 build failed",
          hint: err.fix || "Check the v0.8 timeline contract and scene registry.",
          field: err.field,
          issues: err.issues,
        },
      },
      htmlPath,
    };
  }

  const tl = timeline as Record<string, unknown>;
  const width = opts.width ?? Number(tl.width) ?? 1920;
  const height = opts.height ?? Number(tl.height) ?? 1080;
  const fps = opts.fps ?? Number(tl.fps) ?? 30;
  const duration = computeV08Duration(timeline);

  if (!flags.quiet) {
    process.stderr.write(`v0.8 pipeline: ${htmlPath}\n`);
  }

  const videoTarget = audioPath ? makeTempVideoPath(outPath) : outPath;
  const recorded = await exportRecorderHtml(htmlPath, videoTarget, {
    fps,
    crf: opts.crf,
    width,
    height,
    duration,
  }) as Record<string, unknown>;

  if (!recorded.ok) {
    return { result: recorded, htmlPath };
  }

  if (audioPath) {
    const muxed = await muxMP4Audio(videoTarget, audioPath, outPath) as Record<string, unknown>;
    if (!muxed.ok) {
      return { result: muxed, htmlPath };
    }
    try { unlinkSync(videoTarget); } catch { /* best-effort cleanup */ }
    return {
      result: { ok: true, value: { ...(recorded.value as Record<string, unknown>), outputPath: outPath, audioPath } },
      htmlPath,
    };
  }

  return { result: recorded, htmlPath };
}

function parseCrfFlag(raw: unknown) {
  if (raw === undefined) return { ok: true, value: undefined };
  const crf = Number(raw);
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    return { ok: false, error: { code: "BAD_CRF", hint: "0..51" } };
  }
  return { ok: true, value: crf };
}

export async function run(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: USAGE });
  if (resolved.ok === false) {
    const code = resolved.error.code;
    emit(resolved, flags);
    return code === "USAGE" ? 3 : 2;
  }
  if (resolved.legacy === false && resolved.rest.length > 0) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }
  const outPath = resolved.legacy === false ? resolved.mp4Path : resolved.rest[0];
  const audioPath = flags.audio ? resolve(String(flags.audio)) : null;
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
  if (target !== "ffmpeg" && target !== "recorder" && target !== "browser") {
    emit({
      ok: false,
      error: {
        code: "UNKNOWN_TARGET",
        hint: "supported: ffmpeg, recorder, browser",
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
  const restoreCacheEnv = resolved.legacy === false ? configureProjectCacheEnv(resolved.cachePath) : () => {};
  try {
    const loaded = await loadTimeline(resolved.jsonPath);
    if (!loaded.ok) {
      emit(loaded, flags);
      return 2;
    }

    // BDD cli-render-8 invariant: render must validate before touching ffmpeg.
    const projectDir = timelineDir(resolved.jsonPath);
    const timeline = loaded.value as Record<string, unknown>;
    const format = detectFormat(timeline);

    // v0.8 pipeline: anchors + tracks + kinds. Bypasses legacy validators and ffmpeg;
    // goes buildV08 → HTML → recorder directly. Temp HTML lives in project tmp/ and is
    // retained on failure for AI debugging (per no-system-tmp + POC research).
    if (format === "v0.8") {
      await mkdir(dirname(outPath), { recursive: true });
      const start = Date.now();
      const renderOpts: RenderOpts = {};
      if (flags.fps) renderOpts.fps = Number(flags.fps);
      if (crf.value !== undefined) renderOpts.crf = crf.value;
      if (flags.width) renderOpts.width = Number(flags.width);
      if (flags.height) renderOpts.height = Number(flags.height);
      const { result: r08, htmlPath: tmpHtml } = await renderV08({
        timeline: timeline as TimelineV08,
        timelineJsonPath: resolved.jsonPath,
        outPath,
        audioPath,
        opts: renderOpts,
        flags,
      });
      if (!flags.quiet) process.stderr.write("\n");
      if (!r08.ok) {
        emit(r08 as unknown as Parameters<typeof emit>[0], flags);
        return 2;
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      if (resolved.legacy === false) {
        const logged = await appendExportLog(resolved as unknown as Record<string, unknown>, outPath, r08.value as Record<string, unknown>, effectiveCrf);
        if (!logged.ok) {
          emit(logged, flags);
          return 2;
        }
      }
      if (flags.json) {
        const rv = r08.value as Record<string, unknown>;
        process.stdout.write(JSON.stringify({
          ok: true,
          value: { ...rv, elapsedSeconds: Number(elapsed), pipeline: "v0.8", tempHtml: tmpHtml },
        }, null, 2) + "\n");
      } else {
        const rv = r08.value as Record<string, unknown>;
        process.stdout.write(`wrote ${outPath} via v0.8 pipeline (${rv.framesRendered} frames @ ${rv.fps}fps, ${elapsed}s)\n`);
        process.stdout.write(`tempHtml: ${tmpHtml}\n`);
      }
      return 0;
    }

    const v = format === "v0.3"
      ? await validateTimelineV3(timeline)
      : validateTimelineLegacy(timeline, { projectDir });
    if (v.errors && v.errors.length > 0) {
      emit({ ok: false, error: v.errors[0] }, flags);
      return 2;
    }
    const opts: {
      fps?: number; crf?: number; width?: number; height?: number;
      projectDir?: string; onProgress?: (i: number, total: number) => void;
    } = {};
    if (flags.fps) opts.fps = Number(flags.fps);
    if (crf.value !== undefined) opts.crf = crf.value;
    if (flags.width) opts.width = Number(flags.width);
    if (flags.height) opts.height = Number(flags.height);
    opts.projectDir = projectDir;
    opts.onProgress = (i: number, total: number) => {
      if (!flags.quiet) {
        process.stderr.write(`  rendered ${i}/${total} frames\r`);
      }
    };
    await mkdir(dirname(outPath), { recursive: true });
    const start = Date.now();
    let r: Record<string, unknown> | undefined;
    const exporter =
      target === "browser"
        ? exportBrowser
        : target === "recorder"
          ? exportRecorder
          : exportMP4;
    if (audioPath) {
      const tempVideoPath = makeTempVideoPath(outPath);
      const videoOnly = await exporter(timeline, tempVideoPath, opts) as Record<string, unknown>;
      if (!videoOnly.ok) {
        r = toMuxFailure(videoOnly) as Record<string, unknown>;
      } else {
        const muxed = await muxMP4Audio(tempVideoPath, audioPath, outPath) as Record<string, unknown>;
        if (!muxed.ok) {
          r = muxed;
        } else {
          try {
            unlinkSync(tempVideoPath);
          } catch {}
          r = { ok: true, value: { ...(videoOnly.value as Record<string, unknown>), outputPath: outPath, audioPath } };
        }
      }
    } else {
      r = await exporter(timeline, outPath, opts) as Record<string, unknown>;
    }
    if (!flags.quiet) process.stderr.write("\n");
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    if (!r.ok) {
      emit(r as unknown as Parameters<typeof emit>[0], flags);
      return 2;
    }
    if (resolved.legacy === false) {
      const logged = await appendExportLog(resolved as unknown as Record<string, unknown>, outPath, r.value as Record<string, unknown>, effectiveCrf);
      if (!logged.ok) {
        emit(logged, flags);
        return 2;
      }
    }
    if (flags.json) {
      const rv = r.value as Record<string, unknown>;
      process.stdout.write(JSON.stringify({ ok: true, value: { ...rv, elapsedSeconds: Number(elapsed) } }, null, 2) + "\n");
    } else {
      const rv = r.value as Record<string, unknown>;
      process.stdout.write(`wrote ${outPath} (${rv.framesRendered} frames @ ${rv.fps}fps, ${elapsed}s)\n`);
    }
    return 0;
  } finally {
    restoreCacheEnv();
  }
}

async function appendExportLog(resolved: Record<string, unknown>, outPath: string, renderValue: Record<string, unknown>, crf: number) {
  const exportDir = dirname(String(resolved.exportsPath));
  let history = [];

  await mkdir(exportDir, { recursive: true });
  try {
    const text = await readFile(String(resolved.exportsPath), "utf8");
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
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        ok: false,
        error: {
          code: "EXPORT_LOG_FAIL",
          message: `cannot read export log: ${(err as Error).message}`,
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
    await writeFile(String(resolved.exportsPath), JSON.stringify(history, null, 2) + "\n");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "EXPORT_LOG_FAIL",
        message: `cannot write export log: ${(err as Error).message}`,
      },
    };
  }
}
