import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const PROJECTS_ROOT = join(homedir(), "NextFrame", "projects");

export function timelineUsage(command, segmentTail = "", legacyTail = segmentTail) {
  return [
    `usage: nextframe ${command} <project> <episode> <segment>${segmentTail}`,
    `   or: nextframe ${command} <timeline.json>${legacyTail}`,
  ].join("\n");
}

export function resolveSegment(argv, options = {}) {
  const [project, episode, segment, ...rest] = argv;
  if (!project || !episode || !segment) {
    return usageFailure(options.usage);
  }
  const jsonPath = join(PROJECTS_ROOT, project, episode, `${segment}.json`);
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
    mp4Path: replaceJsonExtension(jsonPath, ".mp4"),
    project,
    episode,
    segment,
    rest,
  };
}

export function resolveTimeline(argv, options = {}) {
  const first = argv[0] || "";
  if (!first) return usageFailure(options.usage);
  if (first.includes("/") || first.endsWith(".json")) {
    return resolveLegacyTimeline(argv, options);
  }
  return resolveSegment(argv, options);
}

export function defaultFramePath(jsonPath, tSpec) {
  return `${replaceJsonExtension(jsonPath, "")}-frame-${sanitizePathToken(tSpec)}.png`;
}

export function timelineDir(jsonPath) {
  return dirname(resolve(jsonPath));
}

function resolveLegacyTimeline(argv, options) {
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

function replaceJsonExtension(path, replacement) {
  if (path.endsWith(".json")) return `${path.slice(0, -5)}${replacement}`;
  return `${path}${replacement}`;
}

function sanitizePathToken(value) {
  const token = String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return token || "frame";
}

function usageFailure(message) {
  return {
    ok: false,
    error: {
      code: "USAGE",
      message: message || "usage: nextframe <command> <project> <episode> <segment> [args]",
    },
  };
}
