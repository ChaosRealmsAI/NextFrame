#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAMPLE_PATH="$ROOT_DIR/poc/samples/welcome.nfproj"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nextframe-ai-demo.XXXXXX")"
TMP_TIMELINE="$TMP_DIR/welcome-from-ai.nfproj"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

TIMELINE_JSON="$(cat "$SAMPLE_PATH")"
printf '%s\n' "$TIMELINE_JSON" > "$TMP_TIMELINE"

node --input-type=module - "$ROOT_DIR" "$TMP_TIMELINE" "$SAMPLE_PATH" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [rootDir, generatedPath, samplePath] = process.argv.slice(2);
const { validateTimeline } = await import(path.join(rootDir, "src/nf-runtime/web/src/engine/index.js"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateBridgeEnvelope(payload, id) {
  assert(isPlainObject(payload), "Bridge response must be an object");
  assert(payload.id === id, `Bridge response id mismatch for ${id}`);
  assert(typeof payload.ok === "boolean", `Bridge response ${id} must include boolean ok`);
}

const generatedTimeline = readJson(generatedPath);
const sampleTimeline = readJson(samplePath);

for (const [label, timeline] of [
  ["generated", generatedTimeline],
  ["sample", sampleTimeline],
]) {
  const result = validateTimeline(timeline);
  assert(result.ok, `${label} timeline failed validateTimeline(): ${result.errors.join("; ")}`);
}

const tracks = sampleTimeline.tracks ?? [];
const totalClipCount = tracks.reduce((sum, track) => sum + (track.clips?.length ?? 0), 0);
const videoTracks = tracks.filter((track) => track?.kind === "video");
const audioTracks = tracks.filter((track) => track?.kind === "audio");
const shippedScenes = new Set([
  "auroraGradient",
  "kineticHeadline",
  "neonGrid",
  "starfield",
  "circleRipple",
  "countdown",
  "barChartReveal",
  "lineChart",
  "lowerThirdVelvet",
  "cornerBadge",
]);

assert(sampleTimeline.duration === 45, "welcome.nfproj must be 45 seconds long");
assert(videoTracks.length === 3, "welcome.nfproj must include 3 video tracks");
assert(audioTracks.length === 2, "welcome.nfproj must include 2 audio tracks");
assert(totalClipCount >= 8 && totalClipCount <= 12, "welcome.nfproj must include 8-12 clips total");

const seenVisualScenes = new Set();
for (const track of videoTracks) {
  for (const clip of track.clips ?? []) {
    if (typeof clip.scene === "string") {
      seenVisualScenes.add(clip.scene);
    }
  }
}

assert(seenVisualScenes.size === 10, "welcome.nfproj must demonstrate all 10 shipped scenes");
for (const sceneId of shippedScenes) {
  assert(seenVisualScenes.has(sceneId), `Missing shipped scene in welcome.nfproj: ${sceneId}`);
}

for (const track of audioTracks) {
  for (const clip of track.clips ?? []) {
    assert(clip.assetId === "demo-tone", "Audio clips must target the demo-tone asset");
    assert(
      clip.params?.src === "../../src/nf-runtime/web/assets/demo-audio.wav",
      "Audio clip params.src must point at ../../src/nf-runtime/web/assets/demo-audio.wav",
    );
  }
}

const sceneListRequest = {
  id: "scene-list-1",
  method: "scene.list",
  params: {},
};

const sceneListResponse = {
  id: "scene-list-1",
  ok: true,
  result: [
    { id: "auroraGradient", name: "Aurora Gradient", category: "Backgrounds" },
    { id: "kineticHeadline", name: "Kinetic Headline", category: "Typography" },
    { id: "neonGrid", name: "Neon Grid", category: "Shapes & Layout" },
    { id: "starfield", name: "Starfield", category: "Backgrounds" },
    { id: "circleRipple", name: "Circle Ripple", category: "Shapes & Layout" },
    { id: "countdown", name: "Countdown", category: "Typography" },
    { id: "barChartReveal", name: "Bar Chart Reveal", category: "Data Viz" },
    { id: "lineChart", name: "Line Chart", category: "Data Viz" },
    { id: "lowerThirdVelvet", name: "Lower Third Velvet", category: "Overlays" },
    { id: "cornerBadge", name: "Corner Badge", category: "Overlays" },
  ],
};

assert(sceneListRequest.method === "scene.list", "scene.list request method mismatch");
assert(isPlainObject(sceneListRequest.params), "scene.list params must be an object");
validateBridgeEnvelope(sceneListResponse, sceneListRequest.id);
assert(Array.isArray(sceneListResponse.result), "scene.list result must be an array");
assert(sceneListResponse.result.length === 10, "scene.list must expose 10 shipped scenes");

const emptyTimeline = {
  version: "1",
  duration: 45,
  background: "#050814",
  assets: sampleTimeline.assets,
  tracks: [
    { id: "v1", label: "V1", name: "Video 1", kind: "video", clips: [] },
    { id: "v2", label: "V2", name: "Video 2", kind: "video", clips: [] },
    { id: "v3", label: "V3", name: "Video 3", kind: "video", clips: [] },
    { id: "a1", label: "A1", name: "Audio 1", kind: "audio", clips: [] },
    { id: "a2", label: "A2", name: "Audio 2", kind: "audio", clips: [] },
  ],
};

assert(validateTimeline(emptyTimeline).ok, "The empty AI timeline template must validate");

const addClipRequest = {
  id: "timeline-add-1",
  method: "timeline.addClip",
  params: {
    trackId: "v1",
    clip: {
      id: "welcome-aurora",
      scene: "auroraGradient",
      start: 0,
      dur: 6,
      params: {
        hueA: 232,
        hueB: 154,
        hueC: 312,
        intensity: 1.26,
        grain: 0.05,
      },
    },
  },
};

const addClipResponse = {
  id: "timeline-add-1",
  ok: true,
  result: {
    trackId: "v1",
    clipId: "welcome-aurora",
  },
};

assert(addClipRequest.method === "timeline.addClip", "timeline.addClip request method mismatch");
assert(addClipRequest.params.trackId === "v1", "timeline.addClip trackId mismatch");
assert(addClipRequest.params.clip.scene === "auroraGradient", "timeline.addClip clip.scene mismatch");
assert(typeof addClipRequest.params.clip.start === "number", "timeline.addClip clip.start must be numeric");
assert(typeof addClipRequest.params.clip.dur === "number", "timeline.addClip clip.dur must be numeric");
validateBridgeEnvelope(addClipResponse, addClipRequest.id);
assert(addClipResponse.result.clipId === "welcome-aurora", "timeline.addClip response clipId mismatch");

const loadRequest = {
  id: "timeline-load-1",
  method: "timeline.load",
  params: {
    path: "samples/welcome.nfproj",
  },
};

const loadResponse = {
  id: "timeline-load-1",
  ok: true,
  result: sampleTimeline,
};

assert(loadRequest.method === "timeline.load", "timeline.load request method mismatch");
assert(typeof loadRequest.params.path === "string" && loadRequest.params.path.length > 0, "timeline.load path is required");
validateBridgeEnvelope(loadResponse, loadRequest.id);
assert(validateTimeline(loadResponse.result).ok, "timeline.load response must be a valid timeline");

const saveRequest = {
  id: "timeline-save-1",
  method: "timeline.save",
  params: {
    path: generatedPath,
    timeline: generatedTimeline,
  },
};

const saveResponse = {
  id: "timeline-save-1",
  ok: true,
  result: {
    path: generatedPath,
    bytesWritten: fs.readFileSync(generatedPath, "utf8").length,
  },
};

assert(saveRequest.method === "timeline.save", "timeline.save request method mismatch");
assert(typeof saveRequest.params.path === "string" && saveRequest.params.path.length > 0, "timeline.save path is required");
assert(validateTimeline(saveRequest.params.timeline).ok, "timeline.save payload must be a valid timeline");
validateBridgeEnvelope(saveResponse, saveRequest.id);
assert(saveResponse.result.bytesWritten > 0, "timeline.save bytesWritten must be positive");

const exportRequest = {
  id: "export-start-1",
  method: "export.start",
  params: {
    outputPath: path.join(rootDir, "exports", "welcome.mp4"),
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 45,
  },
};

const exportResponse = {
  id: "export-start-1",
  ok: true,
  result: {
    ok: false,
    error: "recorder_not_found",
  },
};

assert(exportRequest.method === "export.start", "export.start request method mismatch");
assert(exportRequest.params.width > 0, "export.start width must be positive");
assert(exportRequest.params.height > 0, "export.start height must be positive");
assert(exportRequest.params.fps > 0, "export.start fps must be positive");
assert(exportRequest.params.duration > 0, "export.start duration must be positive");
validateBridgeEnvelope(exportResponse, exportRequest.id);
assert(typeof exportResponse.result.ok === "boolean", "export.start result.ok must be boolean");
assert(typeof exportResponse.result.error === "string", "export.start result.error must be a string");

console.log("Validated samples/welcome.nfproj and AI demo bridge payload shapes.");
console.log(`Temp timeline: ${generatedPath}`);
NODE
