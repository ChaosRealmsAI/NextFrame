/**
 * <nf-perf>
 *   Test D: adoptedStyleSheets 方案 — shared CSSStyleSheet 挂 shadowRoot
 *   对照组是 nf-demo（每组件 <style> 内联 + 继承 :root vars）
 */

// Shared sheet — 只 parse 一次
const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(`
  :host {
    display: block;
    padding: 16px;
    margin: 4px 0;
    border: 1px solid var(--bd, #444);
    background: var(--panel, #111);
  }
  .box {
    padding: 12px 16px;
    background: var(--accent);
    color: #0a0a0d;
    font-weight: 600;
  }
  .label {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--fg-3);
    margin-top: 8px;
  }
`);

export class NfPerf extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sharedSheet];
    root.innerHTML = `
      <div class="box" part="box">Perf · adoptedStyleSheets</div>
      <div class="label">shared CSSStyleSheet · 单 parse</div>
    `;
  }
}

customElements.define("nf-perf", NfPerf);
