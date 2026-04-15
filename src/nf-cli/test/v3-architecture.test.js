import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../src/ai/tools.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
test("v3-architecture public entrypoints expose only v0.3 layer model", () => {
    const binSource = readFileSync(resolve(ROOT, "bin/nextframe.js"), "utf8");
    assert.match(binSource, /layer-add/);
    assert.match(binSource, /layer-list/);
    assert.doesNotMatch(binSource, /add-clip/);
    assert.doesNotMatch(binSource, /move-clip/);
    assert.doesNotMatch(binSource, /bake-browser/);
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
