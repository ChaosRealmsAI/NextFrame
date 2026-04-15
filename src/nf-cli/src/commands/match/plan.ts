// nextframe match plan <episode> --rule <name>
//
// Reads an episode's audio.timeline.json (TTS output) and asks the specified
// match rule to produce a narration-plan.json entry. Output is printed to stdout;
// caller is expected to splice the plan entry into a timeline.matches[] array.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { emit, parseFlags } from "../_helpers/_io.js";
import { dispatchPlan } from "../../../../nf-core/matches/index.js";
import type { AudioTrack, PlanCtx, Segment, Timeline } from "../../../../nf-core/types.js";

const PROJECTS_ROOT = resolve(process.env.HOME || "", "NextFrame/projects");

function normalizeArgs(argv: string[]) {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--rule" && index + 1 < argv.length) {
      normalized.push(`--rule=${argv[index + 1]}`);
      index += 1;
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

function resolveEpisodeDir(episode: string): string {
  if (existsSync(episode) && statSync(episode).isDirectory()) {
    return resolve(episode);
  }
  const parts = episode.split("/");
  if (parts.length >= 2) {
    return join(PROJECTS_ROOT, ...parts);
  }
  return join(PROJECTS_ROOT, episode);
}

function loadAudioSegments(episodeDir: string): Segment[] {
  const audioRoot = join(episodeDir, "audio");
  if (!existsSync(audioRoot)) return [];
  const segments: Segment[] = [];
  const segDirs = readdirSync(audioRoot).filter((name) => /^seg-\d+/.test(name)).sort();
  for (const segDir of segDirs) {
    const jsonPath = join(audioRoot, segDir, "audio.timeline.json");
    if (!existsSync(jsonPath)) continue;
    const data = JSON.parse(readFileSync(jsonPath, "utf8")) as { segments?: Array<Record<string, unknown>> };
    for (const raw of data.segments ?? []) {
      const startMs = Number(raw.start_ms ?? 0);
      const endMs = Number(raw.end_ms ?? startMs);
      const words = Array.isArray(raw.words) ? raw.words.map((w) => {
        const word = w as { word?: string; start_ms?: number; end_ms?: number };
        return { w: String(word.word ?? ""), s: Number(word.start_ms ?? 0), e: Number(word.end_ms ?? 0) };
      }) : [];
      segments.push({ id: `s${segments.length + 1}`, text: String(raw.text ?? ""), startMs, endMs, words });
    }
  }
  return segments;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(normalizeArgs(argv));
  const [episode] = positional;
  const ruleName = typeof flags.rule === "string" ? flags.rule.trim() : "";
  if (!episode || !ruleName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe match plan <episode> --rule <name>" } }, flags);
    return 3;
  }

  const episodeDir = resolveEpisodeDir(episode);
  if (!existsSync(episodeDir)) {
    emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: `episode dir not found: ${episodeDir}` } }, flags);
    return 2;
  }

  const segments = loadAudioSegments(episodeDir);
  if (segments.length === 0) {
    emit({ ok: false, error: { code: "NO_AUDIO_TIMELINE", message: `no audio/seg-*/audio.timeline.json found under ${episodeDir}` } }, flags);
    return 2;
  }

  const ratio = typeof flags.ratio === "string" ? flags.ratio : "16:9";
  const source: AudioTrack = {
    kind: "audio",
    id: "narration",
    meta: { segments, duration_ms: segments[segments.length - 1].endMs },
  };
  const timeline: Timeline = {
    ratio,
    tracks: [source],
  };
  const ctx: PlanCtx = { timeline, rule: ruleName, ratio, source };
  let planResult: unknown;
  try {
    planResult = await dispatchPlan(ruleName, ctx);
  } catch (err) {
    emit({ ok: false, error: { code: "PLAN_FAILED", message: `${ruleName}: ${(err as Error).message}` } }, flags);
    return 2;
  }

  emit({
    ok: true,
    value: {
      rule: ruleName,
      source: "narration",
      target: ruleName === "subtitle-from-words" ? "captions" : "main",
      plan: planResult,
      segmentCount: segments.length,
    },
  }, flags);
  return 0;
}
