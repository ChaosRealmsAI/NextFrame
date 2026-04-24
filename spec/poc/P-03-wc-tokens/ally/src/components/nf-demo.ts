const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--fg);
      font-family: var(--font);
    }

    .wrap {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
      min-height: 96px;
    }

    .box {
      display: grid;
      place-items: center;
      min-height: 96px;
      background: var(--accent);
      color: #0a0a0d;
      font: 700 13px/1 var(--mono);
      border: 1px solid rgba(255, 255, 255, 0.24);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }

    .tabs {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      min-width: 0;
    }

    .tab {
      border: 1px solid var(--bd);
      background: rgba(255, 255, 255, 0.04);
      color: var(--fg-3);
      font: 600 13px/1.2 var(--font);
      padding: 11px 12px;
    }

    .tab.cur {
      color: var(--fg);
      background: rgba(167, 139, 250, 0.12);
      border-color: var(--accent-b);
    }
  </style>
  <div class="wrap">
    <div class="box">accent</div>
    <div class="tabs">
      <div class="tab cur">Shadow tab current</div>
      <div class="tab">Shadow tab idle</div>
    </div>
  </div>
`;

export class NFDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
  }
}

if (!customElements.get("nf-demo")) {
  customElements.define("nf-demo", NFDemo);
}
