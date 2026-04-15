import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { TOOLS } from "../src/ai/tools.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "fixtures", "minimal-v3.json");

function makeTimeline() {
  return structuredClone(JSON.parse(readFileSync(FIXTURE, "utf8")));
}

test("v3-ai list/get/validate operate on v0.3", async () => {
  const listed = TOOLS.list_scenes.handler();
  assert.equal(listed.ok, true);
  const scenes = await listed.value;
  assert.ok(scenes.length >= 10, `expected >= 10 scenes, got ${scenes.length}`);

  const scene = TOOLS.get_scene.handler({ id: "headlineCenter" });
  assert.equal(scene.ok, true);
  const sceneVal = await scene.value;
  assert.equal(sceneVal!.id, "headlineCenter");

  const legacy = await TOOLS.validate_timeline.handler({ timeline: { tracks: [] } });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.errors[0].code, "LEGACY_FORMAT");
});

test("v3-ai describe/find/apply/assert cover active layer semantics", () => {
  const timeline = makeTimeline();

  const describe = TOOLS.describe_frame.handler({ timeline, t: 0.5 });
  assert.equal(describe.ok, true);
  assert.deepEqual(describe.value.active.map((layer) => layer.id), ["bg", "hero"]);

  const found = TOOLS.find_layers.handler({ timeline, scene: "codeTerminal", at: 0.5 });
  assert.equal(found.ok, true);
  assert.equal(found.value[0].id, "hero");

  const applied = TOOLS.apply_patch.handler({
    timeline,
    ops: [
      { op: "move-layer", layerId: "hero", start: 0.2 },
      { op: "set-prop", layerId: "hero", key: "opacity", value: 0.4 },
    ],
  });
  assert.equal(applied.ok, true);
  const appliedValue = applied.value as Record<string, unknown>;
  assert.equal(appliedValue.applied, 2);
  const appliedTimeline = appliedValue.timeline as Record<string, unknown>;
  assert.equal((appliedTimeline.layers as Record<string, unknown>[])[1].start, 0.2);
  assert.equal((appliedTimeline.layers as Record<string, unknown>[])[1].opacity, 0.4);

  const assertion = TOOLS.assert_at.handler({
    timeline,
    t: 0.5,
    checks: [
      { type: "layer_visible", layerId: "bg" },
      { type: "scene_active", scene: "codeTerminal" },
      { type: "layer_count", min: 2 },
    ],
  });
  assert.equal(assertion.ok, true);
  assert.equal((assertion.value as { failed: unknown[] }).failed.length, 0);
});
