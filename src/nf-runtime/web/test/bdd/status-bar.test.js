import { mountStatusBar } from "../../src/status-bar.js";
import { describe, expect, it } from "./runner.js";

class FakeElement {
  constructor(ownerDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = "";
    this.textContent = "";
    this.title = "";
    this.href = "";
    this.target = "";
    this.rel = "";
  }

  append(...children) {
    for (const child of children) {
      if (child.parentElement) {
        child.remove();
      }

      child.parentElement = this;
      this.children.push(child);
    }
  }

  remove() {
    if (!this.parentElement) {
      return;
    }

    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }

    this.parentElement = null;
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

function createFakeWindow() {
  let now = 100_000;
  let nextId = 1;
  const intervals = new Map();

  return {
    setInterval(fn, delay = 0) {
      const normalizedDelay = Math.max(1, Number(delay) || 0);
      const id = nextId++;
      intervals.set(id, {
        fn,
        delay: normalizedDelay,
        nextRunAt: now + normalizedDelay,
      });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    advance(ms) {
      const target = now + ms;

      while (true) {
        let nextRunAt = Infinity;

        for (const interval of intervals.values()) {
          nextRunAt = Math.min(nextRunAt, interval.nextRunAt);
        }

        if (!Number.isFinite(nextRunAt) || nextRunAt > target) {
          break;
        }

        now = nextRunAt;
        for (const interval of intervals.values()) {
          if (interval.nextRunAt === nextRunAt) {
            interval.fn();
            interval.nextRunAt += interval.delay;
          }
        }
      }

      now = target;
    },
    now() {
      return now;
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

describe("Status bar", () => {
  it("renders playhead, selection, tool, autosave status, and refreshes the relative save time every second", () => {
    const previousDateNow = Date.now;
    const previousWindow = globalThis.window;
    const fakeWindow = createFakeWindow();
    const doc = createFakeDocument();
    const container = new FakeElement(doc);
    const store = createStore({
      playhead: 12.45,
      selectedClipId: "clip-2",
      selection: {
        clipIds: ["clip-1", "clip-2"],
      },
      ui: {
        timelineTool: "blade",
      },
      lastSavedAt: 88_000,
      lastChangeAt: 88_000,
      dirty: false,
    });

    globalThis.window = fakeWindow;
    Date.now = () => fakeWindow.now();

    try {
      mountStatusBar(container, store);

      expect(container.children.length).toBe(1);
      expect(container.children[0].className).toBe("status-bar");
      expect(container.children[0].children.map((child) => child.textContent)).toEqual([
        "00:12.45",
        "2 clips selected",
        "Blade tool",
        "Saved 12s ago",
        "GitHub",
        "NextFrame v0.1",
      ]);
      expect(container.children[0].children[4].tagName).toBe("A");
      expect(container.children[0].children[4].href).toBe("https://github.com/");

      fakeWindow.advance(2_000);
      expect(container.children[0].children[3].textContent).toBe("Saved 14s ago");

      store.setState({
        playhead: 5,
        selectedClipId: "clip-2",
        selection: {
          clipIds: [],
        },
        ui: {
          timelineTool: "select",
        },
        lastSavedAt: 88_000,
        lastChangeAt: 101_000,
        dirty: true,
      });

      expect(container.children[0].children.map((child) => child.textContent)).toEqual([
        "00:05.00",
        "1 clip selected",
        "Move tool",
        "Unsaved changes",
        "GitHub",
        "NextFrame v0.1",
      ]);
      expect(container.children[0].children[3].dataset.state).toBe("dirty");
    } finally {
      Date.now = previousDateNow;
      globalThis.window = previousWindow;
    }
  });
});
