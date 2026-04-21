const RESET = `
  :host, *, *::before, *::after {
    box-sizing: border-box;
    border-radius: 0;
    margin: 0;
    padding: 0;
  }
  :host { display: block; }
`;

const sheetCache = new Map<string, CSSStyleSheet>();

export function makeSheet(componentCss: string): CSSStyleSheet {
  const cached = sheetCache.get(componentCss);
  if (cached) return cached;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(RESET + componentCss);
  sheetCache.set(componentCss, sheet);
  return sheet;
}

export abstract class NfBase extends HTMLElement {
  protected readonly root: ShadowRoot;

  protected constructor(componentSheet: CSSStyleSheet) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.adoptedStyleSheets = [componentSheet];
  }

  protected emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }
}
