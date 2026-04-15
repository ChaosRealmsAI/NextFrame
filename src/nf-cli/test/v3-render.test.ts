import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");
const FIXTURE = resolve(HERE, "fixtures", "minimal-v3.json");

const HAS_CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean).some((path) => existsSync(path));

const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

// frame/preview/render commands need napi-canvas which may not be installed
const HAS_NAPI_CANVAS = (() => {
  const r = spawnSync("node", ["-e", "import('./src/targets/napi-canvas.js')"], { cwd: ROOT, stdio: "ignore", timeout: 5000 });
  return r.status === 0;
})();

function runCli(args: any, expectedStatus = 0) {
  const result = spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

const maybeBuildTest = test;
const maybeFrameTest = HAS_CHROME && HAS_NAPI_CANVAS ? test : test.skip;
const maybeRenderTest = HAS_CHROME && HAS_FFMPEG && HAS_NAPI_CANVAS ? test : test.skip;

maybeBuildTest("v3-render build generates HTML from timeline", () => {
  const dir = mkdtempSync(join(tmpdir(), "nextframe-v3-render-"));
  try {
    const htmlPath = join(dir, "timeline.html");
    runCli(["build", FIXTURE, `--output=${htmlPath}`]);
    assert.equal(existsSync(htmlPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

maybeFrameTest("v3-render frame/preview use browser runtime", () => {
  const dir = mkdtempSync(join(tmpdir(), "nextframe-v3-render-"));
  try {
    const pngPath = join(dir, "frame.png");

    runCli(["frame", FIXTURE, "0.5", pngPath]);
    assert.equal(existsSync(pngPath), true);

    const preview = JSON.parse(runCli(["preview", FIXTURE, "--times=0,0.5", `--out=${dir}`, "--json"]).stdout);
    assert.equal(preview.ok, true);
    assert.equal(preview.value.screenshots.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

maybeRenderTest("v3-render browser target writes mp4", () => {
  const dir = mkdtempSync(join(tmpdir(), "nextframe-v3-mp4-"));
  try {
    const outPath = join(dir, "out.mp4");
    runCli(["render", FIXTURE, outPath, "--target=browser", "--fps=4", "--crf=28"]);
    assert.equal(existsSync(outPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
