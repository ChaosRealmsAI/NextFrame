import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, existsSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  assertSceneContract,
  assertNoDuplicateIds,
  SceneContractError,
} from "../src/scenes/_contract.js";
import { REGISTRY, SCENE_IDS, META_TABLE } from "../src/scenes/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

// scene-contract-1: valid scene (vignette) loads automatically through registry.
test("scene-contract-1: valid scene loads through registry with full META", () => {
  const entry = REGISTRY.get("vignette");
  assert.ok(entry, "vignette must be registered");
  assert.equal(typeof entry.render, "function");
  assert.equal(typeof entry.describe, "function");
  const meta = entry.META;
  for (const k of ["id", "category", "description", "duration_hint", "params"]) {
    assert.ok(meta[k] !== undefined, `META.${k} must be set`);
  }
});

// scene-contract-2: missing describe fails assertSceneContract with scene id named.
test("scene-contract-2: missing describe throws SceneContractError naming the scene", () => {
  const brokenEntry = {
    id: "brokenScene",
    render: () => {},
    META: { id: "brokenScene", category: "x", description: "x", duration_hint: 5, params: [] },
  };
  let caught = null;
  try {
    assertSceneContract("brokenScene", brokenEntry);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof SceneContractError, "must throw SceneContractError");
  assert.match(caught.message, /brokenScene/, "error must name the scene");
  assert.match(caught.message, /describe/, "error must point at describe");
});

// scene-contract-3: forbidden non-deterministic tokens not present in any scene file.
test("scene-contract-3: no forbidden tokens in scene source files", () => {
  const forbidden = ["Math.random(", "Date.now(", "performance.now("];
  for (const id of SCENE_IDS) {
    const src = readFileSync(resolve(ROOT, `src/scenes/${id}.js`), "utf8");
    for (const tok of forbidden) {
      assert.ok(!src.includes(tok), `${id}.js contains forbidden token ${tok}`);
    }
  }
});

// scene-contract-4: every scene publishes complete param metadata.
test("scene-contract-4: every META has category + description + numeric duration_hint + params", () => {
  for (const id of SCENE_IDS) {
    const meta = META_TABLE[id];
    assert.ok(meta, `META missing for ${id}`);
    assert.equal(typeof meta.category, "string", `${id}: category`);
    assert.equal(typeof meta.description, "string", `${id}: description`);
    assert.equal(typeof meta.duration_hint, "number", `${id}: duration_hint`);
    assert.ok(Array.isArray(meta.params), `${id}: params array`);
    for (const p of meta.params) {
      assert.ok(p.name, `${id}: param name`);
      assert.ok(p.type, `${id}: param type`);
      assert.ok("default" in p, `${id}: param default`);
    }
  }
});

// scene-contract-5: new scene auto-discovered once wired to registry.
test("scene-contract-5: vignette auto-discovered via SCENE_IDS + REGISTRY + CLI", () => {
  assert.ok(SCENE_IDS.includes("vignette"), "SCENE_IDS includes vignette");
  assert.ok(REGISTRY.has("vignette"), "REGISTRY has vignette");
  const run = spawnSync("node", [CLI, "scenes", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  const ids = out.value.map((s) => s.id);
  assert.ok(ids.includes("vignette"), "CLI scenes --json lists vignette");
});

// scene-contract-6: duplicate scene ids rejected immediately.
test("scene-contract-6: assertNoDuplicateIds throws on collision", () => {
  let caught = null;
  try {
    assertNoDuplicateIds(["a", "b", "c", "a"]);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof SceneContractError, "must throw SceneContractError");
  assert.match(caught.message, /duplicate/, "error mentions duplicate");
  assert.match(caught.message, /"a"/, "error points at the colliding id");
  // Clean list passes silently
  assertNoDuplicateIds(["x", "y", "z"]);
  // Live registry is clean
  assertNoDuplicateIds(SCENE_IDS);
});

// scene-contract-7: incomplete META (missing category) fails the contract.
test("scene-contract-7: META without category throws naming the missing field", () => {
  const entry = {
    id: "partialMeta",
    render: () => {},
    describe: () => ({}),
    META: { id: "partialMeta", description: "x", duration_hint: 5, params: [] },
  };
  let caught = null;
  try {
    assertSceneContract("partialMeta", entry);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof SceneContractError);
  assert.match(caught.message, /category/, "error names the missing field");
});

// Regression: the original v0.1.4 assertions stay in place.
test("scene contract helper throws SceneContractError on invalid entry", () => {
  assert.throws(() => assertSceneContract("broken", {}), SceneContractError);
});

test("vignette renders end-to-end through CLI frame", () => {
  const timelinePath = "/tmp/nextframe-vignette.timeline.json";
  const pngPath = "/tmp/nextframe-vignette.png";
  writeFileSync(
    timelinePath,
    JSON.stringify({
      schema: "nextframe/v0.1",
      duration: 2,
      background: "#101010",
      project: { width: 640, height: 360, aspectRatio: 16 / 9, fps: 30 },
      tracks: [
        { id: "v1", kind: "video", clips: [{ id: "bg", start: 0, dur: 2, scene: "auroraGradient", params: {} }] },
        { id: "v2", kind: "video", clips: [{ id: "fx", start: 0, dur: 2, scene: "vignette", params: { intensity: 0.75, hue: 240, radius: 0.8 } }] },
      ],
    }, null, 2),
  );
  const run = spawnSync("node", [CLI, "frame", timelinePath, "1.0", pngPath], { cwd: ROOT, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(existsSync(pngPath), "expected frame png");
  if (existsSync(pngPath)) unlinkSync(pngPath);
  unlinkSync(timelinePath);
});
