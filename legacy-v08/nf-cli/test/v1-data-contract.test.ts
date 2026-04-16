import test from "node:test";
import assert from "node:assert/strict";

import { validateTimelineLegacy as validateLegacy, validateTimelineV3 as validateV3 } from "../src/lib/timeline-validate.js";

test("legacy validator requires version and clip contract fields", () => {
  const result = validateLegacy({
    schema: "nextframe/v0.1",
    duration: 5,
    background: "#000000",
    project: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        id: "track-1",
        kind: "video",
        clips: [
          { id: "clip-1", start: 0, params: {} },
        ],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error: { code: string }) => error.code === "MISSING_VERSION"));
  assert.ok(result.errors.some((error: { code: string }) => error.code === "MISSING_SCENE"));
  assert.ok(result.errors.some((error: { code: string }) => error.code === "MISSING_DUR"));
});

test("v0.3 validator requires version and params and flags legacy input", async () => {
  const missingVersion = await validateV3({
    schema: "nextframe/v0.3",
    width: 640,
    height: 360,
    fps: 30,
    duration: 5,
    layers: [
      { id: "hero", scene: "headlineCenter", start: 0, dur: 5 },
    ],
  });
  assert.equal(missingVersion.ok, false);
  assert.ok(missingVersion.errors.some((error) => error.code === "MISSING_FIELD" && error.message === "version is required"));

  const missingParams = await validateV3({
    version: "0.3",
    schema: "nextframe/v0.3",
    width: 640,
    height: 360,
    fps: 30,
    duration: 5,
    layers: [
      { id: "hero", scene: "headlineCenter", start: 0, dur: 5 },
    ],
  });
  assert.equal(missingParams.ok, false);
  assert.ok(missingParams.errors.some((error) => error.code === "MISSING_PARAMS"));

  const legacy = await validateV3({ version: "0.1", tracks: [] });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.errors[0].code, "LEGACY_FORMAT");
});
