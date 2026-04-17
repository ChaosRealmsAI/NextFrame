import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSource } from "./parser.js";
import { resolveAnchors } from "./anchor.js";
import { bundle } from "./bundler.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/bundler.test.js → repo/src/nf-tracks/official
const tracksDir = resolve(here, "../../nf-tracks/official");

test("bundler: outputs resolved JSON + track scripts", () => {
  const src = JSON.stringify({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    anchors: { t_intro: 0 },
    tracks: [
      {
        kind: "text",
        id: "t1",
        keyframes: [
          { t: "t_intro", content: "Hello", x: 0.5, y: 0.5, fontSize: 64, color: "#fff" },
        ],
      },
    ],
  });
  const ast = parseSource(src);
  const resolved = resolveAnchors(ast);
  const html = bundle(resolved, { tracksDir });
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("__nfResolved"));
  assert.ok(html.includes('id="nf-root"'));
  assert.ok(html.includes("__nfTracks"));
  // Track IIFE must carry the kind key.
  assert.ok(html.includes('"text"'));
  // The original describe() function body should be present.
  assert.ok(html.includes("function describe"));
});

test("bundler: missing track emits warning comment", () => {
  const src = JSON.stringify({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    tracks: [{ kind: "does-not-exist", id: "x", keyframes: [] }],
  });
  const ast = parseSource(src);
  const resolved = resolveAnchors(ast);
  const html = bundle(resolved, { tracksDir });
  assert.ok(html.includes("bundler-warnings"));
});

test("bundler: inline a local asset as data: URL", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "nf-bundler-"));
  const pngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x5b, 0x6e, 0x1c, 0x7b, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const assetPath = join(dir, "pixel.png");
  writeFileSync(assetPath, pngBytes);
  const src = JSON.stringify({
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    tracks: [
      {
        kind: "text",
        keyframes: [{ content: "logo", x: 0, y: 0, src: "pixel.png" }],
      },
    ],
  });
  const ast = parseSource(src);
  const resolved = resolveAnchors(ast);
  const html = bundle(resolved, { tracksDir, assetBase: dir });
  assert.ok(html.includes("data:image/png;base64,"));
});
