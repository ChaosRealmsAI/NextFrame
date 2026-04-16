import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TOOLS } from "../src/ai/tools.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ENTRY = resolve(ROOT, "src", "index.ts");

test("v3-architecture public entrypoints expose only v0.3 layer model", () => {
  const entrySource = readFileSync(ENTRY, "utf8");
  assert.match(entrySource, /layer-add/);
  assert.match(entrySource, /layer-list/);
  assert.doesNotMatch(entrySource, /add-clip/);
  assert.doesNotMatch(entrySource, /move-clip/);
  assert.doesNotMatch(entrySource, /bake-browser/);

  const toolNames = Object.keys(TOOLS).sort();
  assert.deepEqual(toolNames, [
    "apply_patch",
    "assert_at",
    "describe_frame",
    "find_layers",
    "get_layer",
    "get_scene",
    "list_layers",
    "list_scenes",
    "validate_timeline",
  ]);
});
