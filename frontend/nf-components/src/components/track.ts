import { makeSheet, NfBase } from "../_base.js";
import type { ClipKind, TimelineTrackSelectDetail } from "../events.js";

const sheet = makeSheet(`
  :host {
    display: block;
    height: 36px;
    font-family: var(--font);
  }
  .tl-row {
    height: 36px; display: flex;
    border-bottom: 1px solid var(--bd-2);
    cursor: pointer;
  }
  :host([selected]) .tl-row {
    background: rgba(167, 139, 250, 0.08);
  }
  .tl-lane {
    flex: 1;
    position: relative;
  }
`);

export class NfTrack extends NfBase {
  static get observedAttributes(): string[] {
    return ["kind", "label", "track-id", "selected"];
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
    const trackId = this.getAttribute("track-id") ?? "";
    this.root.innerHTML = `
      <div class="tl-row" data-track-id="${escapeAttr(trackId)}">
        <div class="tl-lane"><slot name="clips"></slot></div>
      </div>
    `;
    this.root.querySelector(".tl-row")?.addEventListener("click", (event) => {
      if (!trackId) return;
      if ((event.target as Element | null)?.closest("slot")) return;
      this.emit<TimelineTrackSelectDetail>("track-select", {
        track: kind as ClipKind,
        "track-id": trackId,
      });
    });
  }
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
