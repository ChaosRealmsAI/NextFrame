import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";

import { buildHTMLDocument, timelineBaseHref } from "../engine-v2/build.js";
import { timelineMetrics } from "../engine-v2/timeline.js";

export async function exportRecorder(timeline, outputPath, opts = {}) {
  const binary = opts.recorderPath || "nextframe-recorder";
  const probe = spawnSync(binary, ["--help"], { stdio: "ignore" });
  if (probe.error?.code === "ENOENT") {
    return {
      ok: false,
      error: {
        code: "RECORDER_NOT_FOUND",
        message: `${binary} not found in PATH`,
      },
    };
  }

  const { width, height, fps } = timelineMetrics(timeline);
  const tempDir = await mkdtemp(join(tmpdir(), "nextframe-recorder-"));
  const htmlPath = join(tempDir, "render.html");
  const html = buildHTMLDocument(timeline, {
    mode: "headless",
    baseHref: timelineBaseHref(opts.baseDir || process.cwd()),
  });
  await writeFile(htmlPath, html, "utf8");

  const args = [
    "slide",
    htmlPath,
    "--out", outputPath,
    "--fps", String(Number(opts.fps) || fps),
    "--crf", String(Number.isInteger(Number(opts.crf)) ? Number(opts.crf) : 20),
    "--dpr", String(Number(opts.dpr) > 0 ? Number(opts.dpr) : 1),
    "--width", String(Number(opts.width) || width),
    "--height", String(Number(opts.height) || height),
  ];

  try {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const [exitCode] = await once(child, "close");
    if (exitCode !== 0) {
      return {
        ok: false,
        error: {
          code: "RECORDER_FAILED",
          message: `nextframe-recorder exited ${exitCode}`,
          hint: stderr.trim(),
        },
      };
    }
    return {
      ok: true,
      value: {
        outputPath,
        width: Number(opts.width) || width,
        height: Number(opts.height) || height,
        fps: Number(opts.fps) || fps,
        duration: timelineMetrics(timeline).duration,
        framesRendered: Math.round(timelineMetrics(timeline).duration * (Number(opts.fps) || fps)),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "RECORDER_SPAWN",
        message: error.message,
      },
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
