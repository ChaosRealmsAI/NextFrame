# AI Operation Walkthrough

Open the ready-made demo from `File > Open` and choose `samples/welcome.nfproj`. If you want an LLM to build the same project itself, give it the sequence below: discover scenes, keep a timeline JSON in memory, add clips, save, load, then export.

## 1. Discover available scenes

```js
await bridge.call("scene.list", {});
```

Request:

```json
{
  "id": "scene-list-1",
  "method": "scene.list",
  "params": {}
}
```

Response:

```json
{
  "id": "scene-list-1",
  "ok": true,
  "result": [
    { "id": "auroraGradient", "name": "Aurora Gradient", "category": "Backgrounds" },
    { "id": "kineticHeadline", "name": "Kinetic Headline", "category": "Typography" },
    { "id": "neonGrid", "name": "Neon Grid", "category": "Shapes & Layout" },
    { "id": "starfield", "name": "Starfield", "category": "Backgrounds" },
    { "id": "circleRipple", "name": "Circle Ripple", "category": "Shapes & Layout" },
    { "id": "countdown", "name": "Countdown", "category": "Typography" },
    { "id": "barChartReveal", "name": "Bar Chart Reveal", "category": "Data Viz" },
    { "id": "lineChart", "name": "Line Chart", "category": "Data Viz" },
    { "id": "lowerThirdVelvet", "name": "Lower Third Velvet", "category": "Overlays" },
    { "id": "cornerBadge", "name": "Corner Badge", "category": "Overlays" }
  ]
}
```

## 2. Create an empty timeline in memory

This is the JSON object the agent keeps mutating before it saves:

```json
{
  "version": "1",
  "duration": 45,
  "background": "#050814",
  "assets": [
    {
      "id": "demo-tone",
      "name": "Demo Audio",
      "path": "../runtime/web/assets/demo-audio.wav",
      "kind": "audio",
      "duration": 2
    }
  ],
  "tracks": [
    { "id": "v1", "label": "V1", "name": "Video 1", "kind": "video", "clips": [] },
    { "id": "v2", "label": "V2", "name": "Video 2", "kind": "video", "clips": [] },
    { "id": "v3", "label": "V3", "name": "Video 3", "kind": "video", "clips": [] },
    { "id": "a1", "label": "A1", "name": "Audio 1", "kind": "audio", "clips": [] },
    { "id": "a2", "label": "A2", "name": "Audio 2", "kind": "audio", "clips": [] }
  ]
}
```

## 3. Add a clip

```js
await bridge.call("timeline.addClip", {
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
      grain: 0.05
    }
  }
});
```

Request:

```json
{
  "id": "timeline-add-1",
  "method": "timeline.addClip",
  "params": {
    "trackId": "v1",
    "clip": {
      "id": "welcome-aurora",
      "scene": "auroraGradient",
      "start": 0,
      "dur": 6,
      "params": {
        "hueA": 232,
        "hueB": 154,
        "hueC": 312,
        "intensity": 1.26,
        "grain": 0.05
      }
    }
  }
}
```

Response:

```json
{
  "id": "timeline-add-1",
  "ok": true,
  "result": {
    "trackId": "v1",
    "clipId": "welcome-aurora"
  }
}
```

Repeat that call until the in-memory timeline matches `samples/welcome.nfproj`: 10 visual clips across `v1`/`v2`/`v3`, plus 2 audio clips on `a1`/`a2` with `assetId: "demo-tone"` and `params.src: "../runtime/web/assets/demo-audio.wav"`.

## 4. Load a project

```js
await bridge.call("timeline.load", { path: "samples/welcome.nfproj" });
```

Request:

```json
{
  "id": "timeline-load-1",
  "method": "timeline.load",
  "params": {
    "path": "samples/welcome.nfproj"
  }
}
```

Response:

```json
{
  "id": "timeline-load-1",
  "ok": true,
  "result": {
    "version": "1",
    "duration": 45,
    "background": "#050814",
    "assets": [
      {
        "id": "demo-tone",
        "name": "Demo Audio",
        "path": "../runtime/web/assets/demo-audio.wav",
        "kind": "audio",
        "duration": 2
      }
    ],
    "tracks": [
      { "id": "v1", "kind": "video", "clips": 5 },
      { "id": "v2", "kind": "video", "clips": 3 },
      { "id": "v3", "kind": "video", "clips": 2 },
      { "id": "a1", "kind": "audio", "clips": 1 },
      { "id": "a2", "kind": "audio", "clips": 1 }
    ]
  }
}
```

The actual bridge returns the full parsed JSON file. The shipped reference file is [samples/welcome.nfproj](/Users/Zhuanz/bigbang/NextFrame/.worktrees/R34-ai-demo/samples/welcome.nfproj).

## 5. Save the built project

```js
await bridge.call("timeline.save", {
  path: "samples/welcome-from-ai.nfproj",
  timeline
});
```

Request:

```json
{
  "id": "timeline-save-1",
  "method": "timeline.save",
  "params": {
    "path": "samples/welcome-from-ai.nfproj",
    "timeline": {
      "version": "1",
      "duration": 45,
      "background": "#050814",
      "assets": [
        {
          "id": "demo-tone",
          "name": "Demo Audio",
          "path": "../runtime/web/assets/demo-audio.wav",
          "kind": "audio",
          "duration": 2
        }
      ],
      "tracks": [
        {
          "id": "v1",
          "label": "V1",
          "name": "Video 1",
          "kind": "video",
          "clips": [
            { "id": "welcome-aurora", "start": 0, "dur": 10, "scene": "auroraGradient" },
            { "id": "welcome-grid", "start": 10, "dur": 8, "scene": "neonGrid" },
            { "id": "welcome-starfield", "start": 18, "dur": 9, "scene": "starfield" },
            { "id": "welcome-ripple", "start": 27, "dur": 8, "scene": "circleRipple" },
            { "id": "welcome-countdown", "start": 35, "dur": 10, "scene": "countdown" }
          ]
        },
        {
          "id": "v2",
          "label": "V2",
          "name": "Video 2",
          "kind": "video",
          "clips": [
            { "id": "welcome-headline", "start": 2, "dur": 6, "scene": "kineticHeadline" },
            { "id": "welcome-bars", "start": 11, "dur": 6, "scene": "barChartReveal" },
            { "id": "welcome-line", "start": 20, "dur": 6, "scene": "lineChart" }
          ]
        },
        {
          "id": "v3",
          "label": "V3",
          "name": "Video 3",
          "kind": "video",
          "clips": [
            { "id": "welcome-lower-third", "start": 29, "dur": 6, "scene": "lowerThirdVelvet" },
            { "id": "welcome-badge", "start": 37, "dur": 6, "scene": "cornerBadge" }
          ]
        },
        {
          "id": "a1",
          "label": "A1",
          "name": "Audio 1",
          "kind": "audio",
          "clips": [
            {
              "id": "welcome-tone-a",
              "start": 4,
              "dur": 2,
              "assetId": "demo-tone",
              "params": {
                "src": "../runtime/web/assets/demo-audio.wav",
                "volume": 0.16
              }
            }
          ]
        },
        {
          "id": "a2",
          "label": "A2",
          "name": "Audio 2",
          "kind": "audio",
          "clips": [
            {
              "id": "welcome-tone-b",
              "start": 24,
              "dur": 2,
              "assetId": "demo-tone",
              "params": {
                "src": "../runtime/web/assets/demo-audio.wav",
                "volume": 0.12
              }
            }
          ]
        }
      ]
    }
  }
}
```

Response:

```json
{
  "id": "timeline-save-1",
  "ok": true,
  "result": {
    "path": "samples/welcome-from-ai.nfproj",
    "bytesWritten": 2710
  }
}
```

## 6. Export

```js
await bridge.call("export.start", {
  outputPath: "exports/welcome.mp4",
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 45
});
```

Request:

```json
{
  "id": "export-start-1",
  "method": "export.start",
  "params": {
    "outputPath": "exports/welcome.mp4",
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "duration": 45
  }
}
```

Response:

```json
{
  "id": "export-start-1",
  "ok": true,
  "result": {
    "ok": false,
    "error": "recorder_not_found"
  }
}
```

That is the promptable loop: `scene.list` to inspect inventory, keep a timeline JSON in memory, issue `timeline.addClip` payloads until the composition is complete, `timeline.save` it to disk, `timeline.load` it back when needed, and finally `export.start` when the user asks for a render.
