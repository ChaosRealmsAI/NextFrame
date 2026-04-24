import { makeSheet, NfBase } from "../_base.js";

const sheet = makeSheet(`
  :host {
    display: block;
    height: 36px;
    font-family: var(--font);
  }
  .tl-row {
    height: 36px; display: flex;
    border-bottom: 1px solid var(--bd-2);
  }
  .tl-head-col {
    width: 100px; flex-shrink: 0;
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px;
    font-size: 10.5px; font-weight: 500;
    color: var(--fg-2);
    border-right: 1px solid var(--bd-2);
    background: rgba(0, 0, 0, 0.18);
    letter-spacing: 0.06em;
  }
  .stripe {
    width: 8px; height: 8px;
    flex-shrink: 0;
    background: var(--gray-l);
  }
  :host([kind="scene"]) .stripe { background: var(--accent); }
  :host([kind="component"]) .stripe { background: var(--accent-l); }
  :host([kind="text"]) .stripe { background: var(--amber); }
  :host([kind="subtitle"]) .stripe { background: var(--amber); }
  :host([kind="overlay"]) .stripe { background: var(--teal); }
  :host([kind="audio"]) .stripe { background: var(--teal); }
  :host([kind="trans"]) .stripe,
  :host([kind="transition"]) .stripe { background: var(--gray-l); }
  .tl-lane {
    flex: 1;
    position: relative;
  }
`);

const LABELS: Record<string, string> = {
  scene: "画面",
  component: "组件",
  text: "文字",
  overlay: "叠加",
  audio: "音频",
  subtitle: "字幕",
  trans: "转场",
  transition: "转场",
};

export class NfTrack extends NfBase {
  static get observedAttributes(): string[] {
    return ["kind", "label"];
  }

  constructor() {
    super(sheet);
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private render(): void {
    const kind = this.getAttribute("kind") ?? "scene";
    const label = this.getAttribute("label") ?? LABELS[kind] ?? "轨道";
    this.root.innerHTML = `
      <div class="tl-row">
        <div class="tl-head-col"><div class="stripe"></div><span>${label}</span></div>
        <div class="tl-lane"><slot name="clips"></slot></div>
      </div>
    `;
  }
}
