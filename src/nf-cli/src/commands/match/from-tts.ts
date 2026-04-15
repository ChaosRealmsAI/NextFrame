// nextframe match from-tts <tts-timeline.json> --out <timeline.json>
//
// One-shot: turn a TTS timeline (nf-tts output with segments[].words[]) into a
// complete v0.6 timeline.json with tracks + matches, ready for `nextframe build`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { emit, parseFlags } from "../_helpers/_io.js";
import { dispatchPlan } from "../../../../nf-core/matches/index.js";
import type { AudioTrack, PlanCtx, Segment, Timeline } from "../../../../nf-core/types.js";

function normalizeArgs(argv: string[]) {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if ((v === "--out" || v === "--ratio" || v === "--audio") && i + 1 < argv.length) {
      out.push(`${v}=${argv[i + 1]}`);
      i += 1;
      continue;
    }
    out.push(v);
  }
  return out;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(normalizeArgs(argv));
  const [ttsPath] = positional;
  if (!ttsPath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe match from-tts <tts-timeline.json> [--audio <mp3>] [--ratio 16:9] [--out timeline.json]" } }, flags);
    return 3;
  }
  const ttsAbs = resolve(ttsPath);
  if (!existsSync(ttsAbs)) {
    emit({ ok: false, error: { code: "NOT_FOUND", message: `tts file not found: ${ttsAbs}` } }, flags);
    return 2;
  }

  let ttsData: { segments?: Array<Record<string, unknown>> };
  try {
    ttsData = JSON.parse(readFileSync(ttsAbs, "utf8"));
  } catch (err) {
    emit({ ok: false, error: { code: "PARSE_FAILED", message: (err as Error).message } }, flags);
    return 2;
  }
  const rawSegs = Array.isArray(ttsData.segments) ? ttsData.segments : [];
  if (rawSegs.length === 0) {
    emit({ ok: false, error: { code: "NO_SEGMENTS", message: "tts file has no segments[]" } }, flags);
    return 2;
  }

  const segments: Segment[] = rawSegs.map((raw, idx) => {
    const words = Array.isArray(raw.words) ? raw.words.map((w) => {
      const word = w as { word?: string; start_ms?: number; end_ms?: number };
      return { w: String(word.word ?? ""), s: Number(word.start_ms ?? 0), e: Number(word.end_ms ?? 0) };
    }) : [];
    return {
      id: `s${idx + 1}`,
      text: String(raw.text ?? ""),
      startMs: Number(raw.start_ms ?? 0),
      endMs: Number(raw.end_ms ?? 0),
      words,
    };
  });

  // Audio src: --audio flag, or guess "<tts-dir>/<stem>.mp3"
  const audioFlag = typeof flags.audio === "string" ? resolve(flags.audio) : null;
  const guessed = ttsAbs.replace(/\.timeline\.json$/, ".mp3");
  const audioSrc = audioFlag ?? (existsSync(guessed) ? guessed : null);
  if (!audioSrc) {
    emit({ ok: false, error: { code: "NO_AUDIO", message: `cannot locate audio — pass --audio <path> or place .mp3 next to .timeline.json`, hint: `tried: ${guessed}` } }, flags);
    return 2;
  }

  const ratio = typeof flags.ratio === "string" ? flags.ratio : "16:9";
  const [wStr, hStr] = ratio.split(":");
  const baseW = 1920, baseH = 1080;
  const aspect = Number(wStr) / Number(hStr);
  const [width, height] = aspect >= 1 ? [baseW, Math.round(baseW / aspect)] : [Math.round(baseH * aspect), baseH];

  const source: AudioTrack = {
    kind: "audio",
    id: "narration",
    src: audioSrc,
    meta: { segments, duration_ms: segments[segments.length - 1].endMs },
  };
  const draftTimeline: Timeline = { ratio, tracks: [source] };
  const planCtx: PlanCtx = { timeline: draftTimeline, rule: "scene-per-segment", ratio, source };
  let scenePlan: unknown;
  try {
    scenePlan = await dispatchPlan("scene-per-segment", planCtx);
  } catch (err) {
    emit({ ok: false, error: { code: "PLAN_FAILED", message: (err as Error).message } }, flags);
    return 2;
  }

  const timeline: Timeline = {
    ratio,
    width,
    height,
    fps: 30,
    duration: segments[segments.length - 1].endMs / 1000 + 0.5,
    background: "#0a0a0a",
    tracks: [
      source,
      { kind: "scene", id: "main", clips: [] },
      { kind: "subtitle", id: "captions" },
    ],
    matches: [
      { rule: "scene-per-segment", source: "narration", target: "main", plan: scenePlan },
      { rule: "subtitle-from-words", source: "narration", target: "captions", level: "word" },
    ],
  };

  const outPath = typeof flags.out === "string" ? resolve(flags.out) : resolve(dirname(ttsAbs), "timeline.json");
  writeFileSync(outPath, JSON.stringify(timeline, null, 2) + "\n", "utf8");

  emit({
    ok: true,
    value: {
      out: outPath,
      audio: audioSrc,
      segments: segments.length,
      duration: timeline.duration,
      dimensions: `${width}x${height}`,
      ratio,
      matches: timeline.matches?.length ?? 0,
    },
  }, flags);
  return 0;
}
