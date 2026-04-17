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
