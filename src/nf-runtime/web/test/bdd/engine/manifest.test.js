import { SCENE_MANIFEST } from "../../../src/scenes/index.js";
import { describe, expect, it } from "../runner.js";

describe("BDD critical scenarios", () => {
  it("INS-02 SCENE_MANIFEST exposes 21 scenes with parameter schemas", () => {
    expect(SCENE_MANIFEST.length).toBe(21, "Expected the built-in scene manifest to list twenty-one built-in scenes");
    expect(
      SCENE_MANIFEST.every((scene) => {
        if (!scene || typeof scene.id !== "string" || typeof scene.name !== "string") {
          return false;
        }

        const params = scene.params;
        return params
          && typeof params === "object"
          && Object.keys(params).length > 0
          && Object.values(params).every((param) => {
            return param
              && typeof param.type === "string"
              && Object.prototype.hasOwnProperty.call(param, "default");
          });
      }),
    ).toBeTruthy("Expected every scene manifest entry to include a typed params schema with defaults");
  });
});
