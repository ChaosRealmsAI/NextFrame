import { makeSheet, NfBase } from "../_base.js";
import type { AnchorHoverDetail, ClipSelectDetail, PlayheadMoveDetail, TimelineClipSelectDetail } from "../events.js";
import { getEpisode, getMockData, pct } from "../storage.js";

const TEXT_CLIPS = [
  { id: "title", label: "title", start: 1, end: 5 },
  { id: "sub-1", label: "sub 1", start: 5.4, end: 11.7 },
  { id: "sub-2", label: "sub 2", start: 12.6, end: 29.4 },
  { id: "sub-3", label: "sub 3", start: 30.6, end: 47.4 },
  { id: "cta", label: "CTA", start: 55.5, end: 59.7 },
];

const TRANS_CLIPS = [
  { id: "flip", label: "flip", start: 4.5, end: 5.5 },
  { id: "in-1", label: "in", start: 11.58, end: 12.42 },
  { id: "in-2", label: "in", start: 29.58, end: 30.42 },
  { id: "fade", label: "fade", start: 54.3, end: 55.62 },
];

const sheet = makeSheet(`
  :host {
    height: 250px;
    flex-shrink: 0;
    display: block;
    font-family: var(--font);
  }
  .timeline {
    height: 250px; flex-shrink: 0;
    display: flex; flex-direction: column;
    background: rgba(0, 0, 0, 0.3);
    border-top: 1px solid var(--bd);
  }
  .tl-top {
    height: 32px; flex-shrink: 0;
    display: flex; align-items: center; gap: 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--bd);
    background: rgba(0, 0, 0, 0.2);
  }
  .tl-top .t {
    font-size: 10px; font-weight: 600;
    color: var(--fg-3); letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .tl-top .anchors {
    display: flex; gap: 12px;
    font-family: var(--mono); font-size: 10px;
    color: var(--fg-4); letter-spacing: 0.04em;
  }
  .tl-top .anchors span b { color: var(--accent-l); font-weight: 500; }
  .tl-top .zoom {
    margin-left: auto;
    font-family: var(--mono); font-size: 10px;
    color: var(--fg-4); letter-spacing: 0.06em;
  }
  .tl-ruler {
    height: 26px; flex-shrink: 0;
    position: relative;
    padding-left: 100px;
    border-bottom: 1px solid var(--bd-2);
    background: rgba(0, 0, 0, 0.15);
  }
  .tick {
    position: absolute; bottom: 0;
    width: 1px; height: 5px;
    background: rgba(255, 255, 255, 0.15);
  }
  .tick.maj { height: 9px; background: rgba(255, 255, 255, 0.28); }
  .tick .n {
    position: absolute; bottom: 10px; left: 3px;
    font-family: var(--mono); font-size: 9px;
    color: var(--amber); opacity: 0.7;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .tl-body {
    flex: 1; position: relative; overflow: hidden;
  }
  .playhead {
    position: absolute; top: 0; bottom: 0;
    width: 1px;
    background: var(--fg);
    z-index: 10; pointer-events: none;
  }
  .playhead::before {
    content: ""; position: absolute; top: -3px; left: 50%;
    transform: translateX(-50%);
    width: 7px; height: 7px;
    background: var(--fg);
  }
`);

export class NfTimeline extends NfBase {
  static get observedAttributes(): string[] {
    return ["duration", "current-time", "zoom"];
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
    const data = getMockData();
    const episode = getEpisode();
    const duration = Number(this.getAttribute("duration") ?? episode.duration);
    const currentTime = Number(this.getAttribute("current-time") ?? (data.source === "ipc" ? 0 : 12));
    const sceneClips = episode.clips.filter((clip) => clip.kind === "scene");
    const textClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "text") : TEXT_CLIPS;
    const transClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "trans" || clip.kind === "transition") : TRANS_CLIPS;
    const audioClips = data.source === "ipc"
      ? episode.clips.filter((clip) => clip.kind === "audio")
      : episode.clips.filter((clip) => clip.id === "bgm-electric").slice(0, 1);
    const anchors = Object.entries(episode.anchors);
    const trackCount = data.source === "ipc" ? new Set(episode.clips.map((clip) => clip.kind)).size : 4;
    const clipCount = data.source === "ipc" ? episode.clips.length : 7;
    this.root.innerHTML = `
      <div class="timeline">
        <div class="tl-top">
          <div class="t">时间轴 · ${trackCount} 轨 · ${clipCount} 片段</div>
          <div class="anchors">
            ${anchors.map(([name, time]) => `<span><b>${name}</b> ${time.toFixed(1)}</span>`).join("")}
          </div>
          <div class="zoom">${this.getAttribute("zoom") ?? "1"}× · fit</div>
        </div>
        <div class="tl-ruler">
          ${Array.from({ length: 13 }, (_, index) => {
            const value = index * 5;
            const major = index % 2 === 1 ? "maj" : "";
            return `<div class="tick ${major}" style="left:calc(100px + ${pct(value, duration)});"><span class="n">${value}</span></div>`;
          }).join("")}
        </div>
        <div class="tl-body">
          <nf-track kind="scene" label="画面">
            ${sceneClips.map((clip) => {
              const mockActive = data.source !== "ipc" && clip.id === "feat-2";
              return `<nf-clip slot="clips" id="${clip.id}" kind="scene" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${mockActive ? "feat 2 · 18s" : clip.label}" ${mockActive ? "active" : ""}></nf-clip>`;
            }).join("")}
          </nf-track>
          <nf-track kind="text" label="文字">
            ${textClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="text" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${clip.label}"></nf-clip>`).join("")}
          </nf-track>
          <nf-track kind="trans" label="转场">
            ${transClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="trans" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${clip.label}"></nf-clip>`).join("")}
          </nf-track>
          <nf-track kind="audio" label="音频">
            ${audioClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="audio" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${data.source === "ipc" ? clip.label : "bgm · -6dB"}"></nf-clip>`).join("")}
          </nf-track>
          <div class="playhead" style="left: calc(100px + ${pct(currentTime, duration)});"></div>
          ${anchors.map(([name, time]) => `<nf-anchor name="${name}" time="${time}" duration="${duration}"></nf-anchor>`).join("")}
        </div>
      </div>
    `;
    this.bind(duration);
  }

  private bind(duration: number): void {
    this.root.querySelector(".tl-ruler")?.addEventListener("click", (event) => {
      const pointer = event as MouseEvent;
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = Math.max(0, pointer.clientX - rect.left - 100);
      const width = Math.max(1, rect.width - 100);
      const time = Math.min(duration, x / width * duration);
      this.setAttribute("current-time", time.toFixed(3));
      this.emit<PlayheadMoveDetail>("playhead-move", { time });
    });
    this.root.addEventListener("clip-click", (event) => {
      const detail = (event as CustomEvent<ClipSelectDetail>).detail;
      this.emit<TimelineClipSelectDetail>("clip-select", {
        track: detail.kind,
        "clip-id": detail.id,
      });
    });
    this.root.addEventListener("anchor-hover", (event) => {
      const detail = (event as CustomEvent<AnchorHoverDetail>).detail;
      this.emit<AnchorHoverDetail>("anchor-hover", detail);
    });
  }
}
