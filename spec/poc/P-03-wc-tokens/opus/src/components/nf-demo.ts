/**
 * <nf-demo>
 *   Test A: tokens 穿透 via :root CSS custom property
 *   Test B: 主文档 `* { color: red !important }` 不应穿入 shadow
 *
 * Shadow DOM uses var(--accent) + var(--fg) inherited from :root.
 */
export class NfDemo extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 16px;
          margin: 8px 0;
          border: 1px solid var(--bd, #444);
          background: var(--panel, #111);
        }
        .box {
          padding: 18px 22px;
          background: var(--accent);
          color: #0a0a0d;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .tabs { display: flex; gap: 8px; }
        .tab {
          padding: 6px 12px;
          color: var(--fg-3);
          background: transparent;
          border: 1px solid var(--bd);
        }
        .tab.cur {
          color: var(--accent);
          border-color: var(--accent);
        }
        .label {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--fg-3);
          margin-top: 12px;
        }
      </style>
      <div class="box" part="box">Accent box · var(--accent)</div>
      <div class="tabs">
        <span class="tab cur" part="tab-cur">Tab · cur</span>
        <span class="tab">Tab · idle</span>
      </div>
      <div class="label">shadow DOM · tokens 穿透测试</div>
    `;
  }
}

customElements.define("nf-demo", NfDemo);
