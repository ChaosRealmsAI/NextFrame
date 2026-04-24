import { makeSheet, NfBase } from "../_base.js";
import type { ClipKind, ClipSelectDetail } from "../events.js";

const sheet = makeSheet(`
  :host {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: var(--nf-left, 0%);
    width: var(--nf-width, 8%);
    display: block;
    cursor: pointer;
  }
  .clip {
    height: 100%;
    padding: 0 9px;
    display: flex; align-items: center;
    font-size: 10.5px; font-weight: 600;
    color: var(--fg);
    background: rgba(167, 139, 250, 0.38);
    border: 1px solid var(--accent);
    overflow: hidden;
    transition: background 0.15s, transform 0.1s;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
    white-space: nowrap;
  }
  .clip:hover { background: rgba(167, 139, 250, 0.55); }
  :host([active]) .clip {
    background: rgba(167, 139, 250, 0.7);
    border-color: var(--accent-l);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  }
  :host([kind="text"]) .clip {
    background: rgba(224, 183, 108, 0.35);
    border-color: var(--amber);
    color: var(--fg);
  }
  :host([kind="text"]) .clip:hover { background: rgba(224, 183, 108, 0.5); }
  :host([kind="component"]) .clip {
    background: rgba(98, 245, 210, 0.28);
    border-color: var(--accent-l);
    color: var(--fg);
  }
  :host([kind="component"]) .clip:hover { background: rgba(98, 245, 210, 0.42); }
  :host([kind="subtitle"]) .clip {
    background: rgba(251, 191, 36, 0.28);
    border-color: var(--amber);
    color: var(--fg);
  }
  :host([kind="subtitle"]) .clip:hover { background: rgba(251, 191, 36, 0.42); }
  :host([kind="overlay"]) .clip {
    background: rgba(123, 201, 181, 0.3);
    border-color: var(--teal);
    color: var(--fg);
  }
  :host([kind="overlay"]) .clip:hover { background: rgba(123, 201, 181, 0.44); }
  :host([kind="trans"]) .clip,
  :host([kind="transition"]) .clip {
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--gray-l);
    font-size: 9.5px;
    color: var(--fg);
  }
  :host([kind="trans"]),
  :host([kind="transition"]) {
    min-width: 14px;
  }
  :host([kind="trans"]) .clip:hover,
  :host([kind="transition"]) .clip:hover { background: rgba(255, 255, 255, 0.18); }
  :host([kind="audio"]) .clip {
    height: auto;
    background: rgba(123, 201, 181, 0.28);
    border-color: var(--teal);
    color: var(--fg);
    position: relative;
  }
  :host([kind="audio"]) .clip:hover { background: rgba(123, 201, 181, 0.38); }
  .wave {
    position: absolute; inset: 5px 8px;
    display: flex; align-items: center; gap: 1.5px;
    pointer-events: none;
  }
  .wave b {
    flex: 1;
    background: rgba(255, 255, 255, 0.18);
  }
  .wave b:nth-child(3n) { height: 48%; }
  .wave b:nth-child(3n+1) { height: 26%; }
  .wave b:nth-child(3n+2) { height: 72%; }
  .wave b:nth-child(5n+1) { height: 38%; }
  .wave b:nth-child(7n+1) { height: 66%; }
  .lbl {
    position: relative; z-index: 2;
    background: rgba(0, 0, 0, 0.5);
    padding: 1px 5px;
    font-size: 9.5px;
    font-family: var(--mono);
  }
`);

export class NfClip extends NfBase {
  static get observedAttributes(): string[] {
    return ["id", "start", "end", "label", "kind", "duration", "active"];
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
    const start = Number(this.getAttribute("start") ?? 0);
    const end = Number(this.getAttribute("end") ?? start + 1);
    const duration = Number(this.getAttribute("duration") ?? 60);
    const left = start / duration * 100;
    const width = (end - start) / duration * 100;
    this.style.setProperty("--nf-left", `${left}%`);
    this.style.setProperty("--nf-width", `${width}%`);
    const kind = (this.getAttribute("kind") ?? "scene") as ClipKind;
    const label = escapeHtml(this.getAttribute("label") ?? this.getAttribute("id") ?? "clip");
    this.root.innerHTML = `
      <div class="clip">
        ${kind === "audio" ? `${this.wave()}<span class="lbl">${label}</span>` : label}
      </div>
    `;
    this.root.querySelector(".clip")?.addEventListener("click", () => {
      this.emit<ClipSelectDetail>("clip-click", {
        id: this.getAttribute("id") ?? "",
        kind,
        duration: end - start,
      });
    });
  }

  private wave(): string {
    return `<div class="wave">${Array.from({ length: 75 }, () => "<b></b>").join("")}</div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
