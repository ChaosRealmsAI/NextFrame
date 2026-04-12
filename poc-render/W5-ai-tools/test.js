import assert from "node:assert/strict";

import {
  apply_patch,
  ascii_gantt,
  assert_at,
  describe_frame,
  find_clips,
  get_clip,
  record_step,
  render_ascii,
  reset_step_log,
  step_log,
} from "./tools.js";

function buildTimeline() {
  return {
    version: "1.0",
    duration: 12,
    tracks: ["v1", "v2", "gfx"],
    canvas: {
      width: 1920,
      height: 1080,
      fps: 30,
    },
    markers: [
      { id: "cold-open", t: 0 },
    ],
    chapters: [
      { id: "intro", start: 0, end: 6 },
      { id: "cta", start: 9, end: 12 },
    ],
    clips: [
      {
        id: "clip-1",
        sceneId: "auroraGradient",
        track: "v1",
        start: 0,
        duration: 6,
        params: {
          hueA: 268,
          hueB: 198,
          hueC: 322,
          intensity: 1.1,
          grain: 0.05,
        },
      },
      {
        id: "clip-lower",
        sceneId: "lowerThirdVelvet",
        track: "v2",
        start: 9,
        duration: 2.5,
        params: {
          title: "NOW SHIPPING",
          subtitle: "Scene tools online",
          hueA: 22,
          hueB: 320,
          holdEnd: 1.8,
          fadeOut: 0.5,
        },
      },
    ],
  };
}

reset_step_log();

let timeline = buildTimeline();

record_step("THINK", {
  message: "I need to add a headline clip after aurora ends",
});

const auroraIds = find_clips(timeline, { sceneId: "auroraGradient" });
assert.deepEqual(auroraIds, ["clip-1"]);

const lowerIds = find_clips(timeline, { sceneId: "lowerThirdVelvet", track: "v2" });
assert.deepEqual(lowerIds, ["clip-lower"]);

const fetchedAurora = get_clip(timeline, "clip-1");
assert.equal(fetchedAurora?.sceneId, "auroraGradient");

const introFrame = describe_frame(timeline, 1.25);
assert.equal(introFrame.chapter?.id, "intro");
assert.equal(introFrame.active_clips[0]?.id, "clip-1");

const addHeadline = apply_patch(timeline, {
  op: "addClip",
  track: "v1",
  clip: {
    id: "clip-headline",
    sceneId: "kineticHeadline",
    start: { after: "clip-1", gap: 0.5 },
    duration: 2.5,
    params: {
      text: "NextFrame",
      subtitle: "Tool surface online",
      hueStart: 180,
      hueEnd: 320,
      stagger: 0.12,
      size: 0.14,
    },
  },
});
assert.equal(addHeadline.ok, true, addHeadline.errors.join("; "));
timeline = addHeadline.newTimeline;

const moveHeadline = apply_patch(timeline, {
  op: "moveClip",
  clipId: "clip-headline",
  start: "clip-1.end+0.5",
});
assert.equal(moveHeadline.ok, true, moveHeadline.errors.join("; "));
timeline = moveHeadline.newTimeline;

const setHeadlineDur = apply_patch(timeline, {
  op: "setDur",
  clipId: "clip-headline",
  dur: { until: "clip-lower", edge: "start" },
});
assert.equal(setHeadlineDur.ok, true, setHeadlineDur.errors.join("; "));
timeline = setHeadlineDur.newTimeline;

const tweakHeadline = apply_patch(timeline, {
  op: "setParam",
  clipId: "clip-headline",
  key: "subtitle",
  value: "Tool surface online now",
});
assert.equal(tweakHeadline.ok, true, tweakHeadline.errors.join("; "));
timeline = tweakHeadline.newTimeline;

const addMarker = apply_patch(timeline, {
  op: "addMarker",
  id: "headline-start",
  t: { at: "clip-headline", edge: "start" },
});
assert.equal(addMarker.ok, true, addMarker.errors.join("; "));
timeline = addMarker.newTimeline;

const addChapter = apply_patch(timeline, {
  op: "addChapter",
  id: "headline-beat",
  start: { at: "clip-headline", edge: "start" },
  end: { at: "clip-headline", edge: "end" },
});
assert.equal(addChapter.ok, true, addChapter.errors.join("; "));
timeline = addChapter.newTimeline;

const addTemp = apply_patch(timeline, {
  op: "addClip",
  track: "gfx",
  clip: {
    id: "clip-temp",
    sceneId: "lowerThirdVelvet",
    start: 10,
    duration: 1,
    params: {
      title: "TEMP",
      subtitle: "to be removed",
      hueA: 10,
      hueB: 300,
      holdEnd: 0.7,
      fadeOut: 0.2,
    },
  },
});
assert.equal(addTemp.ok, true, addTemp.errors.join("; "));
timeline = addTemp.newTimeline;

const removeTemp = apply_patch(timeline, {
  op: "removeClip",
  clipId: "clip-temp",
});
assert.equal(removeTemp.ok, true, removeTemp.errors.join("; "));
timeline = removeTemp.newTimeline;

const headlineIds = find_clips(timeline, { textContent: "NextFrame" });
assert.deepEqual(headlineIds, ["clip-headline"]);

const headlineClip = get_clip(timeline, "clip-headline");
assert.equal(headlineClip?.start, 6.5);
assert.equal(headlineClip?.duration, 2.5);

const headlineFrame = describe_frame(timeline, 7.1);
assert.equal(headlineFrame.chapter?.id, "headline-beat");
assert.equal(headlineFrame.active_clips.some((clip) => clip.id === "clip-headline"), true);

const visibilityAssertion = assert_at(timeline, 7.1, "clip-headline.visible == true");
assert.equal(visibilityAssertion.pass, true, visibilityAssertion.message);

const functionAssertion = assert_at(
  timeline,
  9.2,
  ({ clipsById, chapter }) => clipsById["clip-lower"]?.visible === true && chapter?.id === "cta",
);
assert.equal(functionAssertion.pass, true, functionAssertion.message);

const gantt = ascii_gantt(timeline);
assert.equal(gantt.includes("clip-headline"), true);

const asciiFrame = render_ascii(timeline, 8.0);
assert.equal(asciiFrame.includes("NextFrame"), true);

console.log(gantt);
console.log("");
console.log(asciiFrame);
console.log("");
console.log("STEP LOG");
console.log(JSON.stringify(step_log, null, 2));
console.log("");
console.log("All 7 tool functions returned sensible results.");
