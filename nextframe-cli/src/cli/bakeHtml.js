import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parseFlags, loadTimeline, emit } from "./_io.js";
import {
  ensureHtmlSlideCacheDir,
  htmlSlideCachePath,
  normalizeHtmlSlide,
  resolveChromeExecutable,
  wrapHtmlSlideDocument,
} from "../scenes/_html-cache.js";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

function collectHtmlSlides(timeline, width, height) {
  const slides = new Map();
  for (const track of timeline.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.scene !== "htmlSlide") {
        continue;
      }
      const html = normalizeHtmlSlide(clip.params?.html);
      const outPath = htmlSlideCachePath(html, width, height);
      if (!slides.has(outPath)) {
        slides.set(outPath, html);
      }
    }
  }
  return slides;
}

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [path] = positional;
  if (!path) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe bake-html <timeline.json>" } }, flags);
    return 3;
  }

  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const timeline = loaded.value;
  const width = timeline.project?.width || 1920;
  const height = timeline.project?.height || 1080;
  const slides = collectHtmlSlides(timeline, width, height);
  if (slides.size === 0) {
    emit({ ok: true, value: { baked: 0, rendered: 0, cached: 0, message: "no htmlSlide clips found" } }, flags);
    return 0;
  }

  const chromePath = resolveChromeExecutable();
  if (!chromePath) {
    emit({
      ok: false,
      error: {
        code: "CHROME_NOT_FOUND",
        message: "cannot find a Chrome executable for htmlSlide baking",
        hint: "set NEXTFRAME_CHROME or install Google Chrome in /Applications",
      },
    }, flags);
    return 2;
  }

  ensureHtmlSlideCacheDir();
  let browser;
  let rendered = 0;
  let cached = 0;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
      defaultViewport: { width, height },
    });

    for (const [outPath, html] of slides) {
      if (existsSync(outPath) && !flags.force) {
        cached += 1;
        continue;
      }
      const page = await browser.newPage();
      try {
        await page.setContent(wrapHtmlSlideDocument(html, width, height), { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
        await page.screenshot({ path: outPath, type: "png", captureBeyondViewport: false });
      } finally {
        await page.close();
      }
      rendered += 1;
      if (!flags.quiet) {
        process.stderr.write(`  baked ${rendered + cached}/${slides.size}\r`);
      }
    }
  } catch (err) {
    emit({
      ok: false,
      error: {
        code: "BAKE_HTML_FAILED",
        message: err.message,
      },
    }, flags);
    return 2;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!flags.quiet) {
      process.stderr.write("\n");
    }
  }

  emit({ ok: true, value: { baked: slides.size, rendered, cached } }, flags);
  return 0;
}
