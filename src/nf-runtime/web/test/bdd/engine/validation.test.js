import { validateTimeline } from "../../../src/engine/index.js";
import { createDefaultTimeline } from "../../../src/store.js";
import { describe, expect, it } from "../runner.js";

describe("BDD critical scenarios", () => {
  it("FILE-03 validateTimeline rejects malformed timelines and accepts valid ones", () => {
    const validTimeline = createDefaultTimeline();
    const validResult = validateTimeline(validTimeline);
    expect(validResult).toEqual({ ok: true, errors: [] });

    const invalidResult = validateTimeline({
      version: 1,
      duration: -1,
      tracks: [
        {
          id: "",
          kind: "",
          clips: [
            {
              id: "",
              start: -2,
              dur: 0,
            },
          ],
        },
      ],
    });

    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
    expect(
      invalidResult.errors.some((error) => error.includes("timeline.duration"))
        && invalidResult.errors.some((error) => error.includes("scene or assetId")),
    ).toBeTruthy("Expected validateTimeline() to report both structural and clip payload errors");
  });
});
