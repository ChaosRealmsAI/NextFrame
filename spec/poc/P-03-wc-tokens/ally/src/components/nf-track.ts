const template = document.createElement("template");

template.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--fg);
      font-family: var(--font);
    }

    .track {
      display: grid;
      grid-template-columns: 12px minmax(0, 1fr) auto;
      align-items: center;
      min-height: 48px;
      overflow: hidden;
      border: 1px solid var(--bd);
      background: rgba(255, 255, 255, 0.035);
    }

    .stripe {
      align-self: stretch;
      background: var(--gray);
    }

    .name {
      min-width: 0;
      padding: 0 14px;
      color: var(--fg);
      font: 700 13px/1.2 var(--font);
      text-transform: uppercase;
    }

    .chip {
      margin-right: 10px;
      border: 1px solid var(--bd);
      color: var(--fg-3);
      font: 600 12px/1 var(--mono);
      padding: 7px 9px;
      min-width: 64px;
      text-align: center;
    }

    :host([kind="scene"]) .stripe {
      background: var(--accent);
    }

    :host([kind="text"]) .stripe {
      background: var(--amber);
    }

    :host([kind="audio"]) .stripe {
      background: var(--teal);
    }
  </style>
  <div class="track">
    <div class="stripe"></div>
    <div class="name"></div>
    <div class="chip"></div>
  </div>
`;

export class NFTrack extends HTMLElement {
  static observedAttributes = ["kind"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  private render() {
    const kind = this.getAttribute("kind") ?? "unknown";
    const name = this.shadowRoot?.querySelector<HTMLElement>(".name");
    const chip = this.shadowRoot?.querySelector<HTMLElement>(".chip");

    if (name) {
      name.textContent = `${kind} track`;
    }

    if (chip) {
      chip.textContent = kind;
    }
  }
}

if (!customElements.get("nf-track")) {
  customElements.define("nf-track", NFTrack);
}
