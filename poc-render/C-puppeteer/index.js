const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const puppeteer = require("puppeteer");

const WIDTH = 1920;
const HEIGHT = 1080;
const OUTPUT_PATH = path.join(__dirname, "frame_t5.png");
const SCENE_PATH = path.resolve(__dirname, "../auroraGradient.js");
const CHROME_CANDIDATES = [
  (() => {
    try {
      return puppeteer.executablePath();
    } catch {
      return undefined;
    }
  })(),
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const DEFAULT_PARAMS = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};

function parseTimeArg(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error("Usage: node index.js <t_seconds>");
  }
  return value;
}

function buildHtml({ sceneModuleUrl, t, params }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        background: #000;
      }

      canvas {
        display: block;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
      }
    </style>
  </head>
  <body>
    <canvas id="frame" width="${WIDTH}" height="${HEIGHT}"></canvas>
    <script type="module">
      import { auroraGradient } from "${sceneModuleUrl}";

      const canvas = document.getElementById("frame");
      const ctx = canvas.getContext("2d");
      auroraGradient(${JSON.stringify(t)}, ${JSON.stringify(params)}, ctx);
      window.__FRAME_READY__ = true;
    </script>
  </body>
</html>`;
}

function resolveExecutablePath() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function main() {
  const t = parseTimeArg(process.argv[2]);
  const sceneSource = fs.readFileSync(SCENE_PATH, "utf8");
  const sceneModuleUrl = `data:text/javascript;base64,${Buffer.from(sceneSource).toString("base64")}`;
  const executablePath = resolveExecutablePath();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const startedAt = performance.now();

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
    });

    await page.setContent(buildHtml({ sceneModuleUrl, t, params: DEFAULT_PARAMS }), {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__FRAME_READY__ === true);

    await page.screenshot({
      path: OUTPUT_PATH,
      fullPage: false,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
  } finally {
    await browser.close();
  }

  const elapsedMs = performance.now() - startedAt;
  console.log(`Rendered ${path.basename(OUTPUT_PATH)} in ${elapsedMs.toFixed(2)}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
