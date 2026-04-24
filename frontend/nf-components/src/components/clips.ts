import { makeSheet, NfBase } from "../_base.js";
import type { ClipSelectDetail } from "../events.js";
import { getEpisode, seconds } from "../storage.js";

const sheet = makeSheet(`
  :host {
    height: 252px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--bd);
    font-family: var(--font);
  }
  .panel-head {
    height: 38px; flex-shrink: 0;
    padding: 0 16px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid var(--bd);
    background: rgba(0, 0, 0, 0.22);
  }
  .panel-head .t {
    font-size: 10.5px; font-weight: 700;
    color: var(--fg); letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .panel-head .c {
    margin-left: auto;
    font-family: var(--mono); font-size: 10px;
    color: var(--amber-l); letter-spacing: 0.05em;
  }
  .clips-list {
    flex: 1; overflow-y: auto;
    padding: 8px 10px 12px;
    display: flex; flex-direction: column; gap: 4px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
  }
  .clips-list::-webkit-scrollbar { width: 3px; }
  .clips-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); }
  .clip-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--bd);
    color: var(--fg);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .clip-row:hover {
    background: rgba(255, 255, 255, 0.045);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .clip-row.active {
    background: rgba(167, 139, 250, 0.14);
    border-color: var(--accent-b);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .clip-row .mk {
    width: 3px; height: 14px;
    background: var(--accent);
    flex-shrink: 0;
  }
  .clip-row .mk.audio { background: var(--teal); }
  .clip-row .mk.overlay { background: var(--teal); }
  .clip-row .nm {
    font-size: 11.5px; font-weight: 600;
    color: var(--fg);
    flex: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .clip-row .dur {
    font-family: var(--mono); font-size: 10px;
    color: var(--amber); letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .clip-row.active .dur { color: var(--amber-l); }
`);

export class NfClips extends NfBase {
  static get observedAttributes(): string[] {
    return ["selected-id", "episode-id"];
  }

  constructor() {
    super(sheet);
  }

  connectedCallback(): void {
    this.render();
    document.addEventListener("nf-data-ready", this.handleDataReady);
  }

  disconnectedCallback(): void {
    document.removeEventListener("nf-data-ready", this.handleDataReady);
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private readonly handleDataReady = (): void => {
    this.render();
  };

  private render(): void {
    const episode = getEpisode(this.getAttribute("episode-id") ?? "ep-01");
    const selectedId = this.getAttribute("selected-id") ?? episode.clips.find((clip) => clip.kind === "scene")?.id ?? episode.clips[0]?.id;
    this.root.innerHTML = `
      <div class="panel-head">
        <span class="t">片段</span>
        <span class="c">${episode.clips.length} 条</span>
      </div>
      <div class="clips-list">
        ${episode.clips.map((clip) => `
          <div class="clip-row ${clip.id === selectedId ? "active" : ""}" data-id="${clip.id}">
            <div class="mk ${clip.kind === "audio" ? "audio" : clip.kind === "overlay" ? "overlay" : ""}"></div>
            <div class="nm">${escapeHtml(clip.label)}</div>
            <div class="dur">${seconds(clip.end - clip.start)}</div>
          </div>
        `).join("")}
      </div>
    `;
    this.root.querySelectorAll<HTMLElement>(".clip-row").forEach((row) => {
      row.addEventListener("click", () => {
        const clip = episode.clips.find((item) => item.id === row.dataset.id);
        if (!clip) return;
        this.setAttribute("selected-id", clip.id);
        this.emit<ClipSelectDetail>("clip-select", {
          id: clip.id,
          kind: clip.kind,
          duration: clip.end - clip.start,
        });
      });
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
