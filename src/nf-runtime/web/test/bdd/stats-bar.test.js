import { mountStatsBar } from "../../src/timeline/stats-bar.js";
import { describe, expect, it } from "./runner.js";

class FakeElement {
  constructor(ownerDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.title = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(this, tagName);
    },
  };
}

function createStore(initialState) {
  return {
    state: { ...initialState },
    listeners: new Set(),
    subscribe(listener) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    },
    setState(nextState) {
      const previousState = this.state;
      this.state = { ...nextState };

      for (const listener of this.listeners) {
        listener(this.state, previousState);
      }
    },
  };
}

describe("Timeline stats bar", () => {
  it("renders project stats and only re-renders for timeline or dirty changes", () => {
    const doc = createFakeDocument();
    const container = new FakeElement(doc);
    const timeline = {
      duration: 30,
      tracks: [
        {
          clips: [
            { id: "bg-1", start: 0, dur: 10, scene: "auroraGradient" },
            { id: "typo-1", start: 10, duration: 8, category: "Typography" },
            { id: "overlay-1", start: 20, dur: 10, scene: "lowerThirdVelvet" },
          ],
        },
      ],
    };
    const store = createStore({
      timeline,
      dirty: false,
      playhead: 0,
    });

    mountStatsBar(container, store);

    expect(container.className).toBe("timeline-stats");
    expect(container.children.map((child) => child.textContent)).toEqual([
      "3 clips ·",
      "00:30 ·",
      "1 bg ·",
      "1 typography ·",
      "1 overlays",
      "• saved",
    ]);

    const originalFirstChild = container.children[0];

    store.setState({
      timeline,
      dirty: false,
      playhead: 12,
    });

    expect(container.children[0]).toBe(originalFirstChild);

    store.setState({
      timeline: {
        ...timeline,
        tracks: [
          ...timeline.tracks,
          {
            clips: [
              { id: "bg-2", start: 28, dur: 4, scene: "starfield" },
            ],
          },
        ],
      },
      dirty: true,
      playhead: 12,
    });

    expect(container.children.map((child) => child.textContent)).toEqual([
      "4 clips ·",
      "00:32 ·",
      "2 bg ·",
      "1 typography ·",
      "1 overlays",
      "• dirty",
    ]);
    expect(container.dataset.dirty).toBe("true");
    expect(container.children[container.children.length - 1].dataset.dirty).toBe("true");
  });
});
