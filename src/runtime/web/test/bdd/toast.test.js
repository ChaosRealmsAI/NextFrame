import { clearToasts, toast } from "../../src/toast.js";
import { describe, expect, it } from "./runner.js";

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.tokens = new Set();
  }

  add(...tokens) {
    for (const token of tokens) {
      if (token) {
        this.tokens.add(token);
      }
    }
  }

  remove(...tokens) {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
  }

  contains(token) {
    return this.tokens.has(token);
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this.tokens.has(token)) {
        this.tokens.delete(token);
        return false;
      }

      this.tokens.add(token);
      return true;
    }

    if (force) {
      this.tokens.add(token);
      return true;
    }

    this.tokens.delete(token);
    return false;
  }

  toString() {
    return [...this.tokens].join(" ");
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
    this.style = new FakeStyle();
    this.textContent = "";
    this.classList = new FakeClassList(this);
    this._className = "";
    this._id = "";
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this._className = String(value ?? "");
    this.classList = new FakeClassList(this);
    for (const token of this._className.split(/\s+/).filter(Boolean)) {
      this.classList.add(token);
    }
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

  getBoundingClientRect() {
    const index = this.parentElement ? this.parentElement.children.indexOf(this) : 0;
    return {
      top: index * 48,
      bottom: index * 48 + 40,
      height: 40,
    };
  }

  animate(keyframes, options) {
    this.lastAnimation = { keyframes, options };
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
  const frames = new Map();

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
    advance(ms) {
      const target = now + ms;

      while (true) {
        let nextTimerId = null;
        let nextTime = Infinity;

        for (const [id, timer] of timers) {
          if (timer.time < nextTime) {
            nextTime = timer.time;
            nextTimerId = id;
          }
        }

        if (nextTimerId == null || nextTime > target) {
          break;
        }

        now = nextTime;
        const timer = timers.get(nextTimerId);
        timers.delete(nextTimerId);
        timer?.fn();
      }

      now = target;
    },
  };
}

describe("Toast notifications", () => {
  it("injects the root once, keeps newest toasts on top, and caps the stack at five", () => {
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const doc = createFakeDocument();
    const fakeWindow = createFakeWindow();

    globalThis.document = doc;
    globalThis.window = fakeWindow;

    try {
      for (const label of ["One", "Two", "Three", "Four", "Five", "Six"]) {
        toast(label, { duration: 10_000 });
      }
      fakeWindow.flushAnimationFrames();

      const root = doc.getElementById("toast-root");
      expect(root).toBeTruthy();
      expect(doc.head.children.length).toBe(1);
      expect(root.children.length).toBe(5);
      expect(root.children.map((child) => child.textContent)).toEqual([
        "Six",
        "Five",
        "Four",
        "Three",
        "Two",
      ]);
      expect(root.children[0].dataset.type).toBe("info");
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });

  it("auto-dismisses toasts and clears the full stack with exit timing", () => {
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const doc = createFakeDocument();
    const fakeWindow = createFakeWindow();

    globalThis.document = doc;
    globalThis.window = fakeWindow;

    try {
      toast("Short", { type: "success", duration: 100 });
      fakeWindow.flushAnimationFrames();

      const root = doc.getElementById("toast-root");
      expect(root.children.length).toBe(1);
      expect(root.children[0].dataset.type).toBe("success");
      expect(root.children[0].dataset.state).toBe("visible");

      fakeWindow.advance(100);
      expect(root.children[0].dataset.state).toBe("exiting");

      fakeWindow.advance(299);
      expect(root.children.length).toBe(1);

      fakeWindow.advance(1);
      expect(doc.getElementById("toast-root")).toBe(null);

      toast("Keep", { duration: 10_000 });
      toast("Remove", { type: "warn", duration: 10_000 });
      fakeWindow.flushAnimationFrames();

      const refreshedRoot = doc.getElementById("toast-root");
      expect(refreshedRoot.children.length).toBe(2);
      expect(refreshedRoot.children[0].dataset.type).toBe("warn");

      clearToasts();
      expect(refreshedRoot.children[0].dataset.state).toBe("exiting");
      expect(refreshedRoot.children[1].dataset.state).toBe("exiting");

      fakeWindow.advance(300);
      expect(doc.getElementById("toast-root")).toBe(null);
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });
});
