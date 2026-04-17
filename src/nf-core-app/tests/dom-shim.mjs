// Minimal DOM shim for unit tests. Zero deps.
//
// Covers what track-host + tracks need:
//   - Element: tagName, attributes (setAttribute/getAttribute/removeAttribute)
//   - style: cssText + named props (position, left, top, etc.)
//   - parent/child: appendChild, removeChild, firstChild, childNodes, ownerDocument
//   - document: createElement, createElementNS, getElementById
//   - window: requestAnimationFrame / cancelAnimationFrame (setTimeout-backed)
//
// NOT a general-purpose DOM. Do not import into production code.

class Style {
  constructor() {
    this._props = new Map();
  }
  get cssText() {
    const parts = [];
    for (const [k, v] of this._props.entries()) parts.push(`${k}: ${v};`);
    return parts.join(" ");
  }
  set cssText(v) {
    this._props.clear();
    if (typeof v !== "string") return;
    const segs = v.split(";");
    for (const seg of segs) {
      const idx = seg.indexOf(":");
      if (idx < 0) continue;
      const k = seg.slice(0, idx).trim();
      const val = seg.slice(idx + 1).trim();
      if (k) this._props.set(k, val);
    }
  }
}

function makeStyleProxy() {
  const style = new Style();
  return new Proxy(style, {
    get(target, prop) {
      if (prop === "cssText") return target.cssText;
      if (typeof prop === "string" && prop in target) return target[prop];
      if (typeof prop === "symbol") return target[prop];
      const kebab = String(prop).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      return target._props.get(kebab) ?? "";
    },
    set(target, prop, value) {
      if (prop === "cssText") { target.cssText = value; return true; }
      if (typeof prop === "symbol") { target[prop] = value; return true; }
      const kebab = String(prop).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      target._props.set(kebab, String(value));
      return true;
    },
  });
}

class Attr {
  constructor(name, value) { this.name = name; this.value = value; }
}

class AttrList {
  constructor() { this._map = new Map(); }
  get length() { return this._map.size; }
  item(i) {
    let idx = 0;
    for (const [name, value] of this._map.entries()) {
      if (idx === i) return new Attr(name, value);
      idx++;
    }
    return null;
  }
  *[Symbol.iterator]() {
    for (const [name, value] of this._map.entries()) yield new Attr(name, value);
  }
}

// AttrList indexable access
function attrAt(list, i) { return list.item(i); }

class Element {
  constructor(doc, tagName, ns) {
    this.ownerDocument = doc;
    this.tagName = String(tagName || "").toUpperCase();
    this.namespaceURI = ns || null;
    this._attrs = new Map();
    this.style = makeStyleProxy();
    this.childNodes = [];
    this.parentNode = null;
    this.textContent = "";
    // HTMLMediaElement-ish mirrors
    this.muted = false;
    this.loop = false;
  }
  get attributes() {
    const list = new AttrList();
    for (const [k, v] of this._attrs.entries()) list._map.set(k, v);
    // Make list array-indexable for consumers that iterate by [i]:
    return new Proxy(list, {
      get(target, prop) {
        if (prop === "length") return target.length;
        if (typeof prop === "string" && /^\d+$/.test(prop)) return attrAt(target, Number(prop));
        if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target);
        return target[prop];
      },
    });
  }
  setAttribute(name, value) { this._attrs.set(String(name), String(value)); }
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  removeAttribute(name) { this._attrs.delete(name); }
  hasAttribute(name) { return this._attrs.has(name); }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(child) {
    if (!child) return child;
    if (child.parentNode) child.parentNode.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  replaceChild(newCh, oldCh) {
    const idx = this.childNodes.indexOf(oldCh);
    if (idx < 0) return oldCh;
    this.childNodes[idx] = newCh;
    if (newCh) newCh.parentNode = this;
    oldCh.parentNode = null;
    return oldCh;
  }
  querySelector(sel) {
    // Only supports `[data-track-id="X"]` pattern — enough for tests.
    const m = sel.match(/^\[data-track-id="(.+)"\]$/);
    if (m) {
      for (const ch of this.childNodes) {
        if (ch.getAttribute && ch.getAttribute("data-track-id") === m[1]) return ch;
      }
    }
    return null;
  }
}

class NFDocument {
  constructor() {
    this._byId = new Map();
    this.body = this.createElement("body");
    this.body.ownerDocument = this;
  }
  createElement(tag) { return new Element(this, tag, null); }
  createElementNS(ns, tag) { return new Element(this, tag, ns); }
  getElementById(id) { return this._byId.get(id) || null; }
  registerId(el, id) {
    if (el && id) {
      el.setAttribute("id", id);
      this._byId.set(id, el);
    }
  }
}

export function createWindow() {
  const doc = new NFDocument();
  const rafQueue = [];
  const win = {
    document: doc,
    requestAnimationFrame(cb) {
      const id = setTimeout(() => cb(performance.now()), 0);
      return id;
    },
    cancelAnimationFrame(id) { clearTimeout(id); },
    __nfTracks: undefined,
    __nfApp: undefined,
    __nfTick: undefined,
  };
  // Track-host / track modules read globalThis.document.
  // Make sure the mount element is created but NOT auto-attached; caller does.
  return { win, doc };
}

export function mountRoot(doc, id = "nf-root") {
  const el = doc.createElement("div");
  doc.registerId(el, id);
  doc.body.appendChild(el);
  return el;
}

// Install the shim onto globalThis so Track modules (text.js etc.) can see
// globalThis.document when imported directly.
export function installGlobalShim() {
  const { win, doc } = createWindow();
  globalThis.document = doc;
  globalThis.window = win;
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
  return { win, doc };
}
