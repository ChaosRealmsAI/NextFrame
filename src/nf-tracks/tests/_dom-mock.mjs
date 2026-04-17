// Minimal DOM mock for node-based Track tests.
// Installs globalThis.document with just enough surface area for the 4
// official tracks' render() implementations.

class FakeElement {
  constructor(tag, namespace) {
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespace ?? null;
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.textContent = "";
    this.dataset = {};
    this.muted = false;
    this.loop = false;
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
}

export function installDomMock() {
  if (globalThis.document && globalThis.__nfDomMockInstalled) return;
  globalThis.document = {
    createElement(tag) {
      return new FakeElement(tag);
    },
    createElementNS(ns, tag) {
      return new FakeElement(tag, ns);
    },
  };
  globalThis.HTMLElement = FakeElement;
  globalThis.__nfDomMockInstalled = true;
}

export function isFakeElement(value) {
  return value instanceof FakeElement;
}
