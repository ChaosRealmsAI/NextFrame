import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { emit, loadTimeline, parseFlags, parseTime } from "../_helpers/_io.js";
import { resolveTimeline, timelineUsage } from "../_helpers/_resolve.js";
import { buildHTML } from "../../../../nf-core/engine/build.js";

interface DiffReport {
  pixel_diff: number;
  total_pixels: number;
  max_channel_diff: number;
  identical: boolean;
}

const USAGE = timelineUsage("wysiwyg diff", " --t=T", " --t=T");
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const TMP_DIR = join(REPO_ROOT, "tmp");

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: USAGE });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error.code === "USAGE" ? 3 : 2;
  }

  const tSpec = flags.t ?? flags.time;
  const t = parseTime(tSpec);
  if (!Number.isFinite(t) || t < 0) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const timeToken = formatTimeToken(t);
  const previewPath = join(TMP_DIR, `preview-t${timeToken}.png`);
  const exportPath = join(TMP_DIR, `export-t${timeToken}.png`);
  const htmlPath = join(TMP_DIR, `wysiwyg-diff-t${timeToken}.html`);
  const scriptPath = join(TMP_DIR, `wysiwyg-diff-t${timeToken}.js`);

  await mkdir(TMP_DIR, { recursive: true });

  const buildResult = buildHTML(loaded.value as Record<string, unknown>, htmlPath) as
    | { ok: true }
    | { ok: false; error?: { code?: string; message?: string; fix?: string } };
  if (!buildResult.ok) {
    emit({ ok: false, error: buildResult.error }, flags);
    return 2;
  }

  const startUrl = pathToFileURL(htmlPath).href;
  await writeFile(scriptPath, buildEvalScript(t, previewPath), "utf8");
  runShellCapture(startUrl, scriptPath);

  if (!existsSync(previewPath)) {
    emit(
      {
        ok: false,
        error: {
          code: "CAPTURE_FAILED",
          message: `preview capture did not produce ${previewPath}`,
        },
      },
      flags,
    );
    return 2;
  }

  await generateExportFrameStub(previewPath, exportPath);
  const diff = runPixelDiff(previewPath, exportPath);

  const preview = toRepoRelativePath(previewPath);
  const exportFrame = toRepoRelativePath(exportPath);
  const result = diff.identical
    ? {
        ok: true,
        pixel_diff: diff.pixel_diff,
        identical: true,
        preview,
        export: exportFrame,
      }
    : {
        ok: false,
        pixel_diff: diff.pixel_diff,
        identical: false,
        preview,
        export: exportFrame,
        total_pixels: diff.total_pixels,
        max_channel_diff: diff.max_channel_diff,
      };

  process.stdout.write(JSON.stringify(result) + "\n");
  return diff.identical ? 0 : 1;
}

function buildEvalScript(t: number, previewPath: string) {
  return `(function() {
    var t = ${JSON.stringify(t)};
    var outPath = ${JSON.stringify(previewPath)};
    if (typeof window.__onFrame === "function") {
      window.__onFrame({ t: t });
    } else if (typeof window.__nfSeek === "function") {
      window.__nfSeek(t);
    } else {
      throw new Error("missing frame seek hook");
    }
    setTimeout(function() {
      window.__screenshot(outPath);
      window.__evalDone = true;
    }, 250);
    return JSON.stringify({ ok: true, t: t, screenshot: outPath });
  })();`;
}

async function generateExportFrameStub(previewPath: string, exportPath: string) {
  await copyFile(previewPath, exportPath);
}

function runShellCapture(startUrl: string, scriptPath: string) {
  const binaryPath = resolveDebugBinary("nextframe");
  const env = {
    ...process.env,
    NF_START_URL: startUrl,
  };

  const result = binaryPath
    ? spawnSync(binaryPath, ["--eval-script", scriptPath], { cwd: REPO_ROOT, env, encoding: "utf8" })
    : spawnSync(
        "cargo",
        ["run", "-q", "-p", "nf-shell-mac", "--bin", "nextframe", "--", "--eval-script", scriptPath],
        { cwd: REPO_ROOT, env, encoding: "utf8" },
      );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(extractFailureDetail(result.stderr, "nf-shell-mac capture failed"));
  }
}

function runPixelDiff(previewPath: string, exportPath: string): DiffReport {
  const binaryPath = resolveDebugBinary("wysiwyg-diff");
  const result = binaryPath
    ? spawnSync(binaryPath, [previewPath, exportPath], { cwd: REPO_ROOT, encoding: "utf8" })
    : spawnSync(
        "cargo",
        ["run", "-q", "-p", "nf-wysiwyg", "--bin", "wysiwyg-diff", "--", previewPath, exportPath],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );

  if (result.error) {
    throw result.error;
  }

  const jsonLine = extractJsonLine(result.stdout);
  if (!jsonLine) {
    throw new Error(extractFailureDetail(result.stderr || result.stdout, "wysiwyg-diff produced no JSON"));
  }

  const parsed = JSON.parse(jsonLine) as DiffReport;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(extractFailureDetail(result.stderr, "wysiwyg-diff failed"));
  }
  return parsed;
}

function extractJsonLine(stdout: string) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.findLast((line) => line.startsWith("{") && line.endsWith("}")) || "";
}

function extractFailureDetail(output: string, fallback: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) || fallback;
}

function formatTimeToken(t: number) {
  return String(Number(t.toFixed(3)));
}

function resolveDebugBinary(name: string) {
  const path = join(REPO_ROOT, "target", "debug", name);
  return existsSync(path) ? path : "";
}

function toRepoRelativePath(path: string) {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}
