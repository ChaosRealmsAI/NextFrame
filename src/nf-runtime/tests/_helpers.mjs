// Shared test helpers — DOM mock + RAF mock + bridge mock.

class FakeElement {
  constructor(tag, namespace) {
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespace ?? null;
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.textContent = "";
    this.dataset = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren() {
    this.children = [];
  }
  getElementById(id) {
    for (const c of this.children) {
      if (c.attributes && c.attributes.id === id) return c;
      if (typeof c.getElementById === "function") {
        const hit = c.getElementById(id);
        if (hit) return hit;
      }
    }
    return null;
  }
}

export function installDom() {
  const body = new FakeElement("body");
  const doc = {
    body,
    createElement(tag) { return new FakeElement(tag); },
    createElementNS(ns, tag) { return new FakeElement(tag, ns); },
    getElementById(id) { return body.getElementById(id); },
  };
  globalThis.document = doc;
  return { document: doc, body };
}

export function uninstallDom() {
  delete globalThis.document;
}

// Mock RAF — callbacks queued and drained via flush().
export function installRaf() {
  const queue = [];
  let nextId = 1;
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    const i = queue.findIndex((e) => e.id === id);
    if (i !== -1) queue.splice(i, 1);
  };
  const flush = () => {
    const batch = queue.splice(0);
    for (const { cb } of batch) cb();
  };
  return { flush, queue };
}

export function uninstallRaf() {
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
}

// Mock bridge — records sent messages, allows pushing events.
export function installBridge({ withReply = true } = {}) {
  const sent = [];
  const handlers = [];
  const handler = {
    postMessage(msg) {
      const parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
      sent.push(parsed);
      if (withReply) return Promise.resolve({ ok: true, echo: parsed });
      return undefined;
    },
  };
  globalThis.webkit = { messageHandlers: { nfBridge: handler, __nfBridge: handler } };
  return {
    sent,
    push(message) {
      if (typeof globalThis.__nfBridgeReceive === "function") {
        globalThis.__nfBridgeReceive(message);
      }
    },
    uninstall() {
      delete globalThis.webkit;
      delete globalThis.__nfBridgeReceive;
    },
  };
}

export function uninstallBridge() {
  delete globalThis.webkit;
  delete globalThis.__nfBridgeReceive;
}

export function buildResolved() {
  return {
    viewport: { ratio: "16:9", w: 1920, h: 1080 },
    tracks: [
      {
        id: "t1",
        component: "textish",
        keyframes: [{ t: 0, text: "hello" }],
        props: { color: "white" },
      },
      {
        id: "t2",
        component: "textish",
        keyframes: [{ t: 0, text: "world" }],
        props: { color: "gray" },
      },
    ],
  };
}

export function buildTracks() {
  const textish = {
    render(t, keyframes, viewport) {
      const dom = new FakeElement("div");
      dom.setAttribute("data-t", String(t));
      dom.setAttribute("data-vw", String(viewport.w));
      dom.textContent = keyframes[0]?.text ?? "";
      return { dom };
    },
  };
  return { textish };
}

// Tracked time source for play-mode tests.
export function makeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (dtMs) => { now += dtMs; },
    set: (v) => { now = v; },
  };
}

// Install engine + trackHost as peer globals.
export function installEngineAndTracks(tracks) {
  globalThis.__nfEngine = {
    getStateAt(t, resolved) {
      const viewport = (resolved && resolved.viewport) || { ratio: "16:9", w: 1920, h: 1080 };
      return { t, viewport, tracks: (resolved && resolved.tracks) || [], selected: null, data: {} };
    },
  };
  globalThis.__nfTrackHost = {
    renderTracks(state, list) {
      const nodes = [];
      const audio = [];
      for (const tr of list || []) {
        const impl = tracks[tr.component];
        if (!impl) continue;
        const out = impl.render(state.t, tr.keyframes || [], state.viewport);
        if (out && out.dom) nodes.push(out.dom);
        if (out && out.audio) audio.push(out.audio);
      }
      return { nodes, audio };
    },
  };
  globalThis.__nfTracks = tracks;
}

export function uninstallEngineAndTracks() {
  delete globalThis.__nfEngine;
  delete globalThis.__nfTrackHost;
  delete globalThis.__nfTracks;
  delete globalThis.__nfResolved;
}

export function resetAll() {
  uninstallDom();
  uninstallRaf();
  uninstallBridge();
  uninstallEngineAndTracks();
  delete globalThis.__nfRuntime;
  delete globalThis.__nfDiagnose;
  delete globalThis.__nfEditorDiagnose;
  delete globalThis.__nfTick;
}
