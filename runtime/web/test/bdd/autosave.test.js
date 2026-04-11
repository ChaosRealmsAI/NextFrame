import { startAutosave } from "../../src/autosave.js";
import { describe, expect, it } from "./runner.js";

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }
}

class FakeElement {
  constructor(ownerDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.style = new FakeStyle();
    this.textContent = "";
    this.className = "";
    this._id = "";
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value ?? "");
    if (this._id) {
      this.attributes.set("id", this._id);
    } else {
      this.attributes.delete("id");
    }
  }

  get isConnected() {
    return this.parentElement != null;
  }

  append(...children) {
    for (const child of children) {
      this._insertAt(this.children.length, child);
    }
  }

  prepend(...children) {
    for (const child of [...children].reverse()) {
      this._insertAt(0, child);
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
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === "id") {
      this._id = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }

    this.eventListeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.eventListeners.get(type)?.delete(listener);
  }

  click() {
    this.dispatchEvent({ type: "click", target: this });
  }

  dispatchEvent(event) {
    for (const listener of this.eventListeners.get(event.type) ?? []) {
      listener(event);
    }
  }

  focus() {}

  getBoundingClientRect() {
    const index = this.parentElement ? this.parentElement.children.indexOf(this) : 0;
    return {
      top: index * 48,
      bottom: index * 48 + 40,
      height: 40,
    };
  }

  animate() {
    return { cancel() {} };
  }

  _insertAt(index, child) {
    if (child.parentElement) {
      child.remove();
    }

    child.parentElement = this;
    this.children.splice(index, 0, child);
  }
}

function createFakeDocument() {
  const doc = {
    head: null,
    body: null,
    createElement(tagName) {
      return new FakeElement(doc, tagName);
    },
    getElementById(id) {
      return findById(doc.head, id) || findById(doc.body, id);
    },
  };

  doc.head = new FakeElement(doc, "head");
  doc.body = new FakeElement(doc, "body");
  return doc;
}

function findById(root, id) {
  if (!root) {
    return null;
  }

  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const match = findById(child, id);
    if (match) {
      return match;
    }
  }

  return null;
}

function createFakeWindow() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const intervals = new Map();
  const frames = new Map();
  const listeners = new Map();

  function nextScheduledTime() {
    let candidate = Infinity;

    for (const timer of timers.values()) {
      candidate = Math.min(candidate, timer.time);
    }

    for (const interval of intervals.values()) {
      candidate = Math.min(candidate, interval.time);
    }

    return candidate;
  }

  return {
    setTimeout(fn, delay = 0) {
      const id = nextId++;
      timers.set(id, {
        fn,
        time: now + Math.max(0, Number(delay) || 0),
      });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, delay = 0) {
      const id = nextId++;
      const normalizedDelay = Math.max(1, Number(delay) || 0);
      intervals.set(id, {
        fn,
        delay: normalizedDelay,
        time: now + normalizedDelay,
      });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    requestAnimationFrame(fn) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    flushAnimationFrames() {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(now + 16);
      }
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }

      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    advance(ms) {
      const target = now + ms;

      while (true) {
        const scheduledTime = nextScheduledTime();
        if (!Number.isFinite(scheduledTime) || scheduledTime > target) {
          break;
        }

        now = scheduledTime;

        for (const [id, timer] of [...timers]) {
          if (timer.time === scheduledTime) {
            timers.delete(id);
            timer.fn();
          }
        }

        for (const interval of intervals.values()) {
          if (interval.time === scheduledTime) {
            interval.fn();
            interval.time += interval.delay;
          }
        }
      }

      now = target;
    },
  };
}

function createFakeStore(overrides = {}) {
  const listeners = new Set();
  const store = {
    state: {
      timeline: {
        version: "1",
        duration: 30,
        background: "#0b0b14",
        assets: [],
        tracks: [],
      },
      assets: [],
      assetBuffers: new Map(),
      filePath: null,
      playhead: 0,
      dirty: false,
      autosaveTimer: null,
      autosaveId: null,
      ...overrides,
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mutate(recipe) {
      const previousState = { ...this.state };
      recipe(this.state);
      for (const listener of listeners) {
        listener(this.state, previousState);
      }
      return this.state;
    },
  };

  return store;
}

describe("Autosave", () => {
  it("writes dirty projects every 30 seconds and shows an autosave toast", async () => {
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const doc = createFakeDocument();
    const fakeWindow = createFakeWindow();
    const store = createFakeStore({ dirty: true });
    const calls = [];
    const bridge = {
      call(method, params) {
        calls.push({ method, params });
        if (method === "autosave.list") {
          return Promise.resolve([]);
        }

        if (method === "autosave.write") {
          return Promise.resolve({ ok: true });
        }

        throw new Error(`Unexpected bridge call: ${method}`);
      },
    };

    globalThis.document = doc;
    globalThis.window = fakeWindow;

    try {
      startAutosave({ store, bridge });
      await Promise.resolve();

      fakeWindow.advance(30_000);
      await Promise.resolve();
      fakeWindow.flushAnimationFrames();

      expect(store.state.autosaveTimer).toBeTruthy();
      expect(String(store.state.autosaveId).startsWith("untitled-")).toBe(true);
      expect(calls.map((entry) => entry.method)).toEqual(["autosave.list", "autosave.write"]);
      expect(calls[1].params.projectId).toBe(store.state.autosaveId);

      const root = doc.getElementById("toast-root");
      expect(root).toBeTruthy();
      expect(root.children[0].textContent).toBe("Autosaved");
      expect(root.children[0].dataset.type).toBe("info");
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });

  it("offers recovery on startup and restores the recovered timeline into the store", async () => {
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const doc = createFakeDocument();
    const fakeWindow = createFakeWindow();
    const store = createFakeStore();
    const calls = [];
    const recoveredTimeline = {
      version: "1",
      duration: 42,
      tracks: [],
    };
    const bridge = {
      call(method, params) {
        calls.push({ method, params });
        if (method === "autosave.list") {
          return Promise.resolve([{ projectId: "path-%2FUsers%2Fdemo%2FRecovered.nfproj" }]);
        }

        if (method === "autosave.recover") {
          return Promise.resolve(recoveredTimeline);
        }

        if (method === "recent.add") {
          return Promise.resolve({ ok: true });
        }

        throw new Error(`Unexpected bridge call: ${method}`);
      },
    };

    globalThis.document = doc;
    globalThis.window = fakeWindow;

    try {
      startAutosave({ store, bridge });
      await Promise.resolve();
      await Promise.resolve();

      const backdrop = doc.body.children[0];
      expect(backdrop).toBeTruthy();
      const yesButton = backdrop.children[0].children[2].children[0];
      yesButton.click();

      await Promise.resolve();
      await Promise.resolve();
      fakeWindow.flushAnimationFrames();

      expect(store.state.filePath).toBe("/Users/demo/Recovered.nfproj");
      expect(store.state.autosaveId).toBe("path-%2FUsers%2Fdemo%2FRecovered.nfproj");
      expect(store.state.dirty).toBe(true);
      expect(store.state.timeline.duration).toBe(42);
      expect(calls.map((entry) => entry.method)).toEqual([
        "autosave.list",
        "autosave.recover",
        "recent.add",
      ]);
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });
});
