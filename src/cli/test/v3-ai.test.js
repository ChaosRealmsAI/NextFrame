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

test("v3-ai list/get/validate operate on v0.3", () => {
  const listed = TOOLS.list_scenes.handler();
  assert.equal(listed.ok, true);
  assert.ok(listed.value.length >= 20);

  const scene = TOOLS.get_scene.handler({ id: "headline" });
  assert.equal(scene.ok, true);
  assert.equal(scene.value.id, "headline");

  const legacy = TOOLS.validate_timeline.handler({ timeline: { tracks: [] } });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.value.ok, false);
  assert.equal(legacy.value.errors[0].code, "LEGACY_FORMAT");
});

test("v3-ai describe/find/apply/assert cover active layer semantics", () => {
  const timeline = makeTimeline();

  const describe = TOOLS.describe_frame.handler({ timeline, t: 0.5 });
  assert.equal(describe.ok, true);
  assert.deepEqual(describe.value.active_layers.map((layer) => layer.id), ["bg", "hero"]);

  const found = TOOLS.find_layers.handler({ timeline, scene: "headline", at: 0.5 });
  assert.equal(found.ok, true);
  assert.equal(found.value[0].id, "hero");

  const applied = TOOLS.apply_layer_ops.handler({
    timeline,
    ops: [
      { op: "move_layer", layerId: "hero", start: 0.2 },
      { op: "set_layer_props", layerId: "hero", props: { opacity: 0.4 } },
    ],
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.value.applied, 2);
  assert.equal(applied.value.timeline.layers[1].start, 0.2);
  assert.equal(applied.value.timeline.layers[1].opacity, 0.4);

  const assertion = TOOLS.assert_frame.handler({
    timeline,
    t: 0.5,
    checks: [
      { type: "layer_visible", layerId: "bg" },
      { type: "scene_active", scene: "headline" },
      { type: "layer_count", min: 2 },
      { type: "chapter_active", chapter: "intro" },
    ],
  });
  assert.equal(assertion.ok, true);
  assert.equal(assertion.value.failed.length, 0);

  const gantt = TOOLS.gantt_ascii.handler({ timeline, width: 32 });
  assert.equal(gantt.ok, true);
  assert.match(gantt.value, /MARK/);
  assert.match(gantt.value, /hero/);
});
