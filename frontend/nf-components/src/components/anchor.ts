import { makeSheet, NfBase } from "../_base.js";
import type { AnchorHoverDetail } from "../events.js";

const sheet = makeSheet(`
  :host {
    position: absolute;
    bottom: 0;
    left: calc(100px + var(--nf-left, 0%));
    transform: translateX(-50%);
    width: 0;
    height: 0;
    z-index: 12;
    pointer-events: auto;
  }
  .tri {
    width: 0; height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 8px solid var(--amber);
  }
  :host([color="accent"]) .tri { border-bottom-color: var(--accent); }
  .tri::after {
    content: attr(data-l);
    position: absolute; bottom: 9px; left: 50%;
    transform: translateX(-50%);
    font-family: var(--mono); font-size: 8.5px;
    color: var(--amber);
    white-space: nowrap; letter-spacing: 0.04em;
    padding: 1px 5px;
    background: rgba(10, 10, 14, 0.85);
    border: 1px solid var(--amber-b);
  }
  :host([color="accent"]) .tri::after {
    color: var(--accent-l);
    border-color: var(--accent-b);
  }
`);

export class NfAnchor extends NfBase {
  static get observedAttributes(): string[] {
    return ["name", "time", "color", "duration"];
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
    const time = Number(this.getAttribute("time") ?? 0);
    const duration = Number(this.getAttribute("duration") ?? 60);
    this.style.setProperty("--nf-left", `${time / duration * 100}%`);
    const name = this.getAttribute("name") ?? "anchor";
    this.root.innerHTML = `<div class="tri" data-l="${name}" title="${name} · ${time.toFixed(2)}s"></div>`;
    this.root.querySelector(".tri")?.addEventListener("mouseenter", () => {
      this.emit<AnchorHoverDetail>("anchor-hover", { name, time });
    });
  }
}
