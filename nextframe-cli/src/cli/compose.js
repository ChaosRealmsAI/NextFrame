import { spawnSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags, emit } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";

const USAGE = timelineUsage("compose", "", " [out.html]");
const BUNDLE_PATH = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  "../../../runtime/web/src/bundle.cjs"
);

function defaultOutputPath(jsonPath) {
  return jsonPath.endsWith(".json") ? `${jsonPath.slice(0, -5)}.html` : `${jsonPath}.html`;
}

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

  if (resolved.legacy && resolved.rest.length > 1) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const outputPath = resolved.legacy
    ? resolvePath(resolved.rest[0] || defaultOutputPath(resolved.jsonPath))
    : defaultOutputPath(resolved.jsonPath);

  await mkdir(dirname(outputPath), { recursive: true });

  const result = spawnSync("node", [BUNDLE_PATH, resolved.jsonPath, outputPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    emit({
      ok: false,
      error: {
        code: "COMPOSE_SPAWN",
        message: `failed to spawn node bundle.cjs: ${result.error.message}`,
      },
    }, flags);
    return 2;
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    emit({
      ok: false,
      error: {
        code: "COMPOSE_FAILED",
        message: detail || `bundle.cjs exited with code ${result.status ?? -1}`,
      },
    }, flags);
    return 2;
  }

  const outputStat = await stat(outputPath);
  emit({
    ok: true,
    value: {
      path: outputPath,
      size: outputStat.size,
    },
  }, flags);
  return 0;
}
