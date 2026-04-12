import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { loadTimeline, parseFlags, emit } from "./_io.js";
import {
  CACHE_DIRS,
  cachePathForScene,
  resolveLottieFrame,
} from "../scenes/_browser-scenes.js";
import {
  htmlSlideDocument,
  lottieDocument,
  markdownDocument,
  placeholderDocument,
  svgDocument,
} from "../scenes/_browser-documents.js";

const SUPPORTED_SCENES = ["htmlSlide", "svgOverlay", "markdownSlide", "lottieAnim"];
const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [timelinePath] = positional;
  if (!timelinePath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe bake-browser <timeline.json>" } }, flags);
    return 3;
  }

  const loaded = await loadTimeline(timelinePath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const timeline = loaded.value;
  const width = Number(flags.width) || timeline.project?.width || 1920;
  const height = Number(flags.height) || timeline.project?.height || 1080;
  const rootDir = dirname(resolve(timelinePath));
  const jobs = collectJobs(timeline, { width, height, rootDir });

  if (jobs.length === 0) {
    emit({ ok: true, value: { baked: 0, skipped: 0, width, height, jobs: [] } }, flags);
    return 0;
  }

  for (const dir of Object.values(CACHE_DIRS)) mkdirSync(dir, { recursive: true });

  let browser = null;
  try {
    const missingJobs = jobs.filter((job) => !existsSync(job.cachePath));
    if (missingJobs.length > 0) {
      let puppeteer;
      try {
        ({ default: puppeteer } = await import("puppeteer-core"));
      } catch {
        emit({ ok: false, error: { code: "MISSING_PUPPETEER", message: "puppeteer-core not installed", hint: "npm install puppeteer-core" } }, flags);
        return 2;
      }
      browser = await puppeteer.launch({
        executablePath: findChromeExecutable(),
        headless: true,
        args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
        defaultViewport: { width, height },
      });
      const page = await browser.newPage();
      for (const job of missingJobs) {
        await bakeJob(page, job);
      }
    }

    const result = {
      baked: jobs.filter((job) => job.status === "baked").length,
      skipped: jobs.filter((job) => job.status === "cached").length,
      width,
      height,
      jobs: jobs.map(({ clipId, scene, cachePath, status }) => ({ clipId, scene, cachePath, status })),
    };
    emit({ ok: true, value: result }, flags);
    return 0;
  } catch (err) {
    emit({ ok: false, error: { code: "BAKE_BROWSER_FAILED", message: err.message } }, flags);
    return 2;
  } finally {
    if (browser) await browser.close();
  }
}

function collectJobs(timeline, opts) {
  const jobs = [];
  const seen = new Map();
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      if (!SUPPORTED_SCENES.includes(clip.scene)) continue;
      const job = browserJobForClip(clip, opts);
      if (!seen.has(job.cachePath)) {
        job.status = existsSync(job.cachePath) ? "cached" : "pending";
        seen.set(job.cachePath, job);
        jobs.push(job);
      }
    }
  }
  return jobs;
}

function browserJobForClip(clip, { width, height, rootDir }) {
  if (clip.scene === "svgOverlay") {
    const params = { svg: String(clip.params?.svg || "<svg></svg>") };
    return {
      clipId: clip.id,
      scene: clip.scene,
      cachePath: cachePathForScene("svgOverlay", width, height, params),
      html: svgDocument(params.svg),
    };
  }
  if (clip.scene === "markdownSlide") {
    const params = {
      md: String(clip.params?.md || "# Hello"),
      theme: String(clip.params?.theme || "anthropic-warm"),
    };
    return {
      clipId: clip.id,
      scene: clip.scene,
      cachePath: cachePathForScene("markdownSlide", width, height, params),
      html: markdownDocument(params.md, params.theme),
    };
  }
  if (clip.scene === "lottieAnim") {
    const resolvedSrc = resolveBrowserPath(clip.params?.src, rootDir);
    const frame = resolveLottieFrame(clip.params?.frame, 0);
    const params = { src: resolvedSrc, frame };
    return {
      clipId: clip.id,
      scene: clip.scene,
      cachePath: cachePathForScene("lottieAnim", width, height, params, 0),
      html: lottieDocument(resolvedSrc, frame),
      readyCheck: true,
      fallbackHtml: placeholderDocument("Lottie preview placeholder", [
        resolvedSrc
          ? `Unable to bake ${resolvedSrc} with live lottie-web in this environment.`
          : "No src provided, so this bake generated a placeholder card instead.",
        "Actual Lottie rendering requires internet for the lottie-web CDN fetch at bake time.",
        `Requested frame: ${frame}`,
      ]),
    };
  }

  const html = resolveHtmlSlide(clip.params, rootDir);
  const params = { html };
  return {
    clipId: clip.id,
    scene: clip.scene,
    cachePath: cachePathForScene("htmlSlide", width, height, params),
    html: htmlSlideDocument(html),
  };
}

async function bakeJob(page, job) {
  mkdirSync(dirname(job.cachePath), { recursive: true });
  try {
    await page.setContent(job.html, { waitUntil: "domcontentloaded", timeout: 12_000 });
    if (job.readyCheck) {
      await page.waitForFunction(() => document.body?.dataset?.ready === "1", { timeout: 12_000 });
    }
  } catch (err) {
    if (!job.fallbackHtml) throw err;
    await page.setContent(job.fallbackHtml, { waitUntil: "domcontentloaded", timeout: 12_000 });
  }
  await page.screenshot({ path: job.cachePath, type: "png" });
  job.status = "baked";
}

function findChromeExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome executable not found. Set PUPPETEER_EXECUTABLE_PATH or CHROME_BIN.");
}

function resolveHtmlSlide(params, rootDir) {
  if (typeof params?.html === "string" && params.html.trim()) return params.html;
  const src = resolveBrowserPath(params?.src, rootDir);
  if (src && existsSync(src)) return readFileSync(src, "utf8");
  return placeholderDocument("HTML slide placeholder", [
    "No params.html or readable params.src was provided.",
    "This keeps bake-browser tolerant of htmlSlide clips in mixed timelines.",
  ]);
}

function resolveBrowserPath(value, rootDir) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.startsWith("/") ? value : resolve(rootDir, value);
}
