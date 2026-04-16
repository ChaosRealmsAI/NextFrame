// Resolves project, segment, timeline, and cache paths for timeline-oriented CLI commands.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const PROJECTS_ROOT = join(homedir(), "NextFrame", "projects");

const CACHE_ENV_KEYS = Object.freeze({
  html: "NEXTFRAME_HTML_CACHE_DIR",
  video: "NEXTFRAME_VIDEO_CACHE_DIR",
  browser: "NEXTFRAME_BROWSER_CACHE_DIR",
});

interface ResolveOptions {
  usage?: string;
}

export interface ResolveError {
  readonly ok: false;
  error: { code: string; message: string; hint?: string };
}

export interface ResolveSegmentSuccess {
  readonly ok: true;
  readonly legacy: false;
  jsonPath: string;
  mp4Path: string;
  cachePath: string;
  framesPath: string;
  exportsPath: string;
  project: string;
  episode: string;
  segment: string;
  rest: string[];
}

export interface ResolveLegacySuccess {
  readonly ok: true;
  readonly legacy: true;
  jsonPath: string;
  mp4Path: string;
  rest: string[];
}

export type ResolveResult = ResolveSegmentSuccess | ResolveLegacySuccess | ResolveError;

export function timelineUsage(command: string, segmentTail = "", legacyTail = segmentTail): string {
  return [
    `usage: nextframe ${command} <project> <episode> <segment>${segmentTail}`,
    `   or: nextframe ${command} <timeline.json>${legacyTail}`,
  ].join("\n");
}

export function resolveSegment(argv: string[], options: ResolveOptions = {}): ResolveSegmentSuccess | ResolveError {
  const [project, episode, segment, ...rest] = argv;
  if (!project || !episode || !segment) {
    return usageFailure(options.usage);
  }
  const episodeDir = join(PROJECTS_ROOT, project, episode);
  const jsonPath = join(episodeDir, `${segment}.json`);
  if (!existsSync(jsonPath)) {
    return {
      ok: false,
      error: {
        code: "SEGMENT_NOT_FOUND",
        message: `segment not found: ${jsonPath}`,
        hint: `expected ~/NextFrame/projects/${project}/${episode}/${segment}.json`,
      },
    };
  }
  return {
    ok: true,
    legacy: false,
    jsonPath,
    mp4Path: join(episodeDir, `${segment}.mp4`),
    cachePath: join(episodeDir, ".cache"),
    framesPath: join(episodeDir, ".frames"),
    exportsPath: join(episodeDir, ".exports", "exports.json"),
    project,
    episode,
    segment,
    rest,
  };
}

export function resolveTimeline(argv: string[], options: ResolveOptions = {}): ResolveResult {
  const first = argv[0] ?? "";
  if (!first) return usageFailure(options.usage);
  if (first.includes("/") || first.endsWith(".json")) {
    return resolveLegacyTimeline(argv, options);
  }
  return resolveSegment(argv, options);
}

export function defaultFramePath(jsonPath: string, tSpec: string): string {
  return `${replaceJsonExtension(jsonPath, "")}-frame-${sanitizePathToken(tSpec)}.png`;
}

export function segmentFramePath(segment: string, framesPath: string, t: number): string {
  return join(framesPath, `${segment}-t${formatFrameTimeToken(t)}.png`);
}

export function timelineDir(jsonPath: string): string {
  return dirname(resolve(jsonPath));
}

export function cacheDirs(cachePath: string): { html: string; video: string; browser: string } {
  return {
    html: join(cachePath, "html"),
    video: join(cachePath, "video"),
    browser: join(cachePath, "browser"),
  };
}

export function configureProjectCacheEnv(cachePath: string | undefined): () => void {
  if (!cachePath) return () => {};
  const dirs = cacheDirs(cachePath);
  const previous = Object.fromEntries(
    Object.entries(CACHE_ENV_KEYS).map(([key, envKey]) => [envKey, process.env[envKey]])
  );

  process.env[CACHE_ENV_KEYS.html] = dirs.html;
  process.env[CACHE_ENV_KEYS.video] = dirs.video;
  process.env[CACHE_ENV_KEYS.browser] = dirs.browser;

  return () => {
    for (const envKey of Object.values(CACHE_ENV_KEYS)) {
      restoreEnv(envKey, previous[envKey]);
    }
  };
}

function resolveLegacyTimeline(argv: string[], options: ResolveOptions): ResolveLegacySuccess | ResolveError {
  const [timelineArg, ...rest] = argv;
  const jsonPath = resolve(timelineArg);
  if (!existsSync(jsonPath)) {
    return {
      ok: false,
      error: {
        code: "TIMELINE_NOT_FOUND",
        message: `timeline not found: ${jsonPath}`,
        hint: "provide an existing .json file or use <project> <episode> <segment>",
      },
    };
  }
  return {
    ok: true,
    legacy: true,
    jsonPath,
    mp4Path: replaceJsonExtension(jsonPath, ".mp4"),
    rest,
  };
}

function replaceJsonExtension(path: string, replacement: string): string {
  if (path.endsWith(".json")) return `${path.slice(0, -5)}${replacement}`;
  return `${path}${replacement}`;
}

function formatFrameTimeToken(value: number): string {
  if (Number.isFinite(value)) {
    return sanitizePathToken(value.toFixed(2));
  }
  return sanitizePathToken(String(value));
}

function sanitizePathToken(value: string): string {
  const token = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return token || "frame";
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function usageFailure(message: string | undefined): ResolveError {
  return {
    ok: false,
    error: {
      code: "USAGE",
      message: message ?? "usage: nextframe <command> <project> <episode> <segment> [args]",
    },
  };
}
