import { mountTitleBar } from "../../src/title-bar.js";
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
    title: "",
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

describe("Title bar", () => {
  it("renders Untitled initially and syncs dirty/file name changes", () => {
    const doc = createFakeDocument();
    const container = new FakeElement(doc);
    const store = createStore({
      filePath: null,
      dirty: false,
    });

    mountTitleBar(container, store);

    expect(container.children.length).toBe(1);
    expect(container.children[0].textContent).toBe("Untitled");
    expect(container.children[0].dataset.dirty).toBe("false");
    expect(doc.title).toBe("Untitled — NextFrame");

    store.setState({
      filePath: "/tmp/demo/project-alpha.nfproj",
      dirty: true,
    });

    expect(container.children[0].textContent).toBe("● project-alpha.nfproj");
    expect(container.children[0].dataset.dirty).toBe("true");
    expect(doc.title).toBe("project-alpha.nfproj • — NextFrame");
  });
});
