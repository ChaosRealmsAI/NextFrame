const rootTemplate = document.createElement("template");

rootTemplate.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--fg);
      font-family: var(--font);
    }

    .chip {
      height: 22px;
      min-width: 56px;
      background: var(--accent);
      border: 1px solid rgba(255, 255, 255, 0.24);
      color: #0a0a0d;
      font: 700 11px/20px var(--mono);
      text-align: center;
    }
  </style>
  <div class="chip">root</div>
`;

const adoptedCss = `
  :host {
    display: block;
    color: var(--fg);
    font-family: var(--font);
  }

  .chip {
    height: 22px;
    min-width: 56px;
    background: var(--accent);
    border: 1px solid rgba(255, 255, 255, 0.24);
    color: #0a0a0d;
    font: 700 11px/20px var(--mono);
    text-align: center;
  }
`;

const adoptedTemplate = document.createElement("template");
adoptedTemplate.innerHTML = `<div class="chip">adopt</div>`;

let sharedSheet: CSSStyleSheet | null = null;

function getSharedSheet() {
  if (!("adoptedStyleSheets" in Document.prototype) || !("replaceSync" in CSSStyleSheet.prototype)) {
    return null;
  }

  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(adoptedCss);
  }

  return sharedSheet;
}

export class NFPerfRoot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(rootTemplate.content.cloneNode(true));
  }
}

export class NFPerfAdopted extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });
    const sheet = getSharedSheet();

    if (sheet) {
      shadowRoot.adoptedStyleSheets = [sheet];
    } else {
      const fallback = document.createElement("style");
      fallback.textContent = adoptedCss;
      shadowRoot.append(fallback);
    }

    shadowRoot.append(adoptedTemplate.content.cloneNode(true));
  }
}

if (!customElements.get("nf-perf-root")) {
  customElements.define("nf-perf-root", NFPerfRoot);
}

if (!customElements.get("nf-perf-adopted")) {
  customElements.define("nf-perf-adopted", NFPerfAdopted);
}

export function adoptedStyleSheetsSupported() {
  return Boolean(getSharedSheet());
}
