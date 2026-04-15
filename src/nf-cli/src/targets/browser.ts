// Renders timelines in headless Chrome and captures frames or MP4 output from them.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";

import { buildHTML } from "../../../nf-core/engine/build.js";
import { timelineMetrics } from "../lib/timeline-utils.js";

/** Minimal structural type for puppeteer Page — avoids importing puppeteer-core types at top level */
interface PuppeteerPage {
  evaluate: (fn: ((...args: unknown[]) => unknown) | string, ...args: unknown[]) => Promise<unknown>;
  $: (sel: string) => Promise<{ screenshot: (opts: Record<string, unknown>) => Promise<unknown> } | null>;
}

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function captureFrameToFile(timeline: Record<string, unknown>, outPath: string, opts: { t?: number; fps?: number; crf?: number; ffmpegPath?: string } = {}) {
  const session = await openRenderedTimeline(timeline, opts);
  try {
    await seekTimeline(session.page, opts.t ?? 0);
    await screenshotStage(session.page, outPath);
    return { ok: true, value: { path: outPath } };
  } catch (error: unknown) {
    return { ok: false, error: { code: "FRAME_CAPTURE_FAILED", message: (error as Error).message } };
  } finally {
    await session.close();
  }
}

export async function captureFrames(timeline: Record<string, unknown>, times: number[], outDir: string, opts: { t?: number; fps?: number; crf?: number; ffmpegPath?: string } = {}) {
  const session = await openRenderedTimeline(timeline, opts);
  const screenshots = [];
  try {
    for (let index = 0; index < times.length; index++) {
      const t = Number(times[index]) || 0;
      const outPath = join(outDir, `${String(index).padStart(6, "0")}.png`);
      await seekTimeline(session.page, t);
      await screenshotStage(session.page, outPath);
      screenshots.push({ t, path: outPath });
    }
    return { ok: true, value: screenshots };
  } catch (error: unknown) {
    return { ok: false, error: { code: "FRAME_CAPTURE_FAILED", message: (error as Error).message } };
  } finally {
    await session.close();
  }
}

export async function encodeFramesToMp4(frameDir: string, outputPath: string, opts: { fps?: number; crf?: number; ffmpegPath?: string } = {}) {
  const fps = Number(opts.fps) || 30;
  const crf = Number.isInteger(Number(opts.crf)) ? Number(opts.crf) : 20;
  const ffmpegArgs = [
    "-y",
    "-framerate", String(fps),
    "-i", join(frameDir, "%06d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", String(crf),
    outputPath,
  ];

  try {
    const child = spawn(opts.ffmpegPath || "ffmpeg", ffmpegArgs, { stdio: ["ignore", "ignore", "pipe"] });
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
          code: "FFMPEG_FAILED",
          message: `ffmpeg exited ${exitCode}`,
          hint: stderr.trim(),
        },
      };
    }
    return { ok: true, value: { outputPath } };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "FFMPEG_SPAWN",
        message: (error as Error).message,
        hint: `ffmpeg ${ffmpegArgs.join(" ")}`,
      },
    };
  }
}

export async function openRenderedTimeline(timeline: Record<string, unknown>, opts: { fps?: number; crf?: number; ffmpegPath?: string; t?: number } = {}) {
  const { width, height } = timelineMetrics(timeline);
  const htmlDir = await mkdtemp(join(tmpdir(), "nextframe-v3-"));
  const htmlPath = join(htmlDir, "render.html");
  const buildResult = buildHTML(timeline, htmlPath);
  if (!buildResult.ok) {
    throw new Error(buildResult.error?.message || "failed to build timeline HTML");
  }

  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
    defaultViewport: { width, height },
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__NEXTFRAME_READY === true, { timeout: 15000 });

  return {
    browser,
    page,
    htmlDir,
    htmlPath,
    async close() {
      await browser.close();
      await rm(htmlDir, { recursive: true, force: true });
    },
  };
}

export async function seekTimeline(page: PuppeteerPage, t: number) {
  await page.evaluate(((time: unknown) => {
    const engine = (window as unknown as Record<string, unknown>).__NEXTFRAME_ENGINE as { renderFrame?: (t: number) => void; compose?: (t: number) => void } | undefined;
    if (engine?.renderFrame) engine.renderFrame(time as number);
    else if (engine?.compose) engine.compose(time as number);
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }) as (...args: unknown[]) => unknown, Number(t) || 0);
}

async function screenshotStage(page: PuppeteerPage, outPath: string) {
  const stage = await page.$("#stage");
  if (!stage) {
    throw new Error("missing #stage element");
  }
  await stage.screenshot({ path: outPath, type: "png" });
}

function findChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("Chrome executable not found. Set PUPPETEER_EXECUTABLE_PATH or CHROME_BIN.");
}
