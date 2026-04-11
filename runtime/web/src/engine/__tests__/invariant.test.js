import { SCENES, registerScene, renderAt } from "../index.js";

const TEST_SCENE_ID = "spec/frame-pure-rect";

function createTimeline() {
  return {
    version: 1,
    duration: 10,
    background: "#000000",
    tracks: [
      {
        id: "track-1",
        kind: "video",
        clips: [
          {
            id: "clip-1",
            start: 0,
            dur: 10,
            scene: TEST_SCENE_ID,
          },
        ],
      },
    ],
  };
}

function createCanvasContext() {
  // R27 will provide the document/canvas bridge for headless execution.
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Expected document.createElement('canvas') to provide a 2D context");
  }

  return ctx;
}

function readPixel(ctx, x, y) {
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `Expected ${expectedJson} but received ${actualJson}`);
  }
}

function runSpec(name, fn) {
  fn();
  return name;
}

function registerTestScene() {
  const previous = SCENES.get(TEST_SCENE_ID);

  registerScene(TEST_SCENE_ID, (t, params, ctx) => {
    const x = 100 + t * 10;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(x, 20, 10, 10);
  });

  return () => {
    if (previous) {
      SCENES.set(TEST_SCENE_ID, previous);
      return;
    }

    SCENES.delete(TEST_SCENE_ID);
  };
}

if (typeof document !== "undefined") {
  runSpec("renders the expected pixel when sampling t=5 directly", () => {
    const restoreScene = registerTestScene();

    try {
      const ctx = createCanvasContext();
      renderAt(ctx, createTimeline(), 5);

      assertDeepEqual(readPixel(ctx, 150, 25), [255, 0, 0, 255]);
    } finally {
      restoreScene();
    }
  });

  runSpec("rendering t=2 and then t=5 still lands the rect at x=150", () => {
    const restoreScene = registerTestScene();

    try {
      const ctx = createCanvasContext();
      const timeline = createTimeline();

      renderAt(ctx, timeline, 2);
      renderAt(ctx, timeline, 5);

      assertDeepEqual(readPixel(ctx, 150, 25), [255, 0, 0, 255]);
    } finally {
      restoreScene();
    }
  });

  runSpec("rendering t=5 after other frames matches a direct t=5 render", () => {
    const restoreScene = registerTestScene();

    try {
      const timeline = createTimeline();
      const directCtx = createCanvasContext();
      const replayCtx = createCanvasContext();

      renderAt(directCtx, timeline, 5);
      renderAt(replayCtx, timeline, 2);
      renderAt(replayCtx, timeline, 5);

      assertDeepEqual(readPixel(replayCtx, 150, 25), readPixel(directCtx, 150, 25));
    } finally {
      restoreScene();
    }
  });
}
