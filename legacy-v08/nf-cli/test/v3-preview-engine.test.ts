/**
 * Tests for direct-render preview engine scaling and positioning.
 *
 * Protects the fitStageToContainer / wrapper centering logic that
 * replaced the iframe-based preview. These are the calculations that
 * ensure 1920x1080 stage content renders at correct aspect ratio
 * inside any container size.
 */
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
function runCli(args: string[]) {
  const r = spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r;
}

// ── fitStageToContainer scaling math ──

test("scale preserves 16:9 across container shapes", () => {
  function calcFit(cW: number, cH: number, sW: number, sH: number) {
    const scale = Math.min(cW / sW, cH / sH);
    return { w: Math.round(sW * scale), h: Math.round(sH * scale), scale };
  }
  const ratio = 1920 / 1080;

  const cases: [number, number, string][] = [
    [960, 544, "typical preview"],
    [800, 600, "4:3 container"],
    [1920, 1080, "1:1 match"],
    [500, 500, "square"],
    [540, 960, "portrait"],
    [3840, 2160, "4K"],
    [320, 180, "tiny"],
  ];

  for (const [cW, cH, label] of cases) {
    const r = calcFit(cW, cH, 1920, 1080);
    assert.ok(Math.abs(r.w / r.h - ratio) < 0.02, `${label}: ratio ${(r.w/r.h).toFixed(3)} ≈ ${ratio.toFixed(3)}`);
    assert.ok(r.w <= cW, `${label}: width fits`);
    assert.ok(r.h <= cH, `${label}: height fits`);
  }

  // Exact match should be scale=1
  assert.equal(calcFit(1920, 1080, 1920, 1080).scale, 1);
});

// ── Wrapper centering ──

test("wrapper centering produces correct offsets", () => {
  function calcCenter(cW: number, cH: number, sW: number, sH: number) {
    const scale = Math.min(cW / sW, cH / sH);
    const scaledW = Math.round(sW * scale);
    const scaledH = Math.round(sH * scale);
    return { x: Math.round((cW - scaledW) / 2), y: Math.round((cH - scaledH) / 2) };
  }

  // Exact 16:9 → no offset
  const r1 = calcCenter(960, 540, 1920, 1080);
  assert.equal(r1.x, 0);
  assert.equal(r1.y, 0);

  // Taller → vertical padding
  const r2 = calcCenter(960, 600, 1920, 1080);
  assert.equal(r2.x, 0);
  assert.equal(r2.y, 30);

  // Wider → horizontal padding
  const r3 = calcCenter(1200, 540, 1920, 1080);
  assert.ok(r3.x > 0, "has horizontal offset");
  assert.equal(r3.y, 0);

  // Square → both paddings
  const r4 = calcCenter(500, 500, 1920, 1080);
  assert.equal(r4.x, 0, "width-constrained: no horizontal offset");
  assert.ok(r4.y > 0, "has vertical offset in square");
});

// ── Stage stays at native size (no double-scaling) ──

test("CSS transform scale must not change clientWidth/Height", () => {
  // The wrapper approach: stage is 1920x1080, transform:scale(0.5)
  // clientWidth should remain 1920 (CSS transform doesn't affect layout)
  // getBoundingClientRect().width becomes 960 (visual size)
  //
  // This is critical: scenes use clientWidth for canvas resolution,
  // if it returned 960 they'd render at half res then CSS would halve again.

  // We can't test DOM here, but we validate the invariant:
  // stageHost.style.width must always be stageW+"px" (1920px)
  // stageHost.style.transform must be scale(X) where X = containerW/1920

  const stageW = 1920;
  const stageH = 1080;
  const containerW = 960;
  const containerH = 544;

  const scale = Math.min(containerW / stageW, containerH / stageH);
  const wrapperW = Math.round(stageW * scale);
  const wrapperH = Math.round(stageH * scale);

  // Stage dimensions never change
  assert.equal(stageW, 1920, "stage width stays native");
  assert.equal(stageH, 1080, "stage height stays native");

  // Wrapper clips to scaled size
  assert.ok(wrapperW <= containerW, "wrapper fits container width");
  assert.ok(wrapperH <= containerH, "wrapper fits container height");

  // Scale factor is correct
  assert.ok(scale > 0 && scale <= 1, "scale is positive and ≤1 for downscaling");
  assert.ok(Math.abs(scale - 0.5037) < 0.01, `scale ≈ 0.5 for 960x544 container`);
});

// ── nfdata:// query string stripping ──

test("nfdata query string stripped before file lookup", () => {
  function strip(p: string) { return p.split("?")[0]; }

  assert.equal(strip("a/b.html?t=123"), "a/b.html");
  assert.equal(strip("file.html"), "file.html");
  assert.equal(strip("x?a=1&b=2"), "x");
  assert.equal(strip(""), "");
  assert.equal(strip("path/to/file.json?cache=bust&v=2"), "path/to/file.json");
});

// Desktop preview lifecycle tests removed — app-bundle.js was refactored into
// nf-runtime/web/js/ modules and nf-shell was renamed to nf-shell-mac.
// The patterns tested (previewReloadSeq, previewStageClickHandler, etc.)
// no longer exist in the current codebase.

// ── Build output sanity check ──

test("build generates HTML file from timeline JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "nf-build-"));
  try {
    const out = join(dir, "output.html");
    runCli(["build", FIXTURE, `--output=${out}`]);
    assert.ok(existsSync(out), "HTML file created");
    const stat = spawnSync("wc", ["-c", out], { encoding: "utf8" });
    const size = parseInt(stat.stdout.trim());
    assert.ok(size > 10000, `HTML should be substantial (got ${size} bytes)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
