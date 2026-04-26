import { makeSheet, NfBase } from "../_base.js";
import type { AnchorHoverDetail, ClipSelectDetail, PlayheadMoveDetail, TimelineClipSelectDetail, TimelineTrackSelectDetail } from "../events.js";
import { ALL_COMPOSITION_CLIP_ID, getEpisode, getMockData, pct, type NfClip } from "../storage.js";

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
    flex: 1; position: relative; overflow: auto;
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
    return ["duration", "current-time", "zoom", "selected-id"];
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

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    // Updating current-time only nudges the playhead; full re-render would rebuild
    // .tl-ruler mid-drag and detach pointermove/pointerup handlers, breaking scrubbing.
    if (name === "current-time") {
      const duration = Number(this.getAttribute("duration") ?? 0);
      const time = Number(this.getAttribute("current-time") ?? 0);
      const pct = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;
      const head = this.root.querySelector<HTMLElement>(".playhead");
      if (head) head.style.left = `${pct}%`;
      return;
    }
    this.render();
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
    const selectedId = this.getAttribute("selected-id") ?? sceneClips[0]?.id ?? episode.clips[0]?.id ?? "";
    const selectedCompositionClip = selectedId === ALL_COMPOSITION_CLIP_ID
      ? undefined
      : episode.composition_clips?.find((clip) => clip.id === selectedId)
        ?? episode.composition_clips?.[0];
    const clipFirstRows = selectedCompositionClip?.tracks ?? [];
    const allCompositionRows = selectedId === ALL_COMPOSITION_CLIP_ID && episode.composition_clips
      ? episode.composition_clips.map((clip) => ({
        id: clip.id,
        label: clip.label,
        kind: "scene",
        items: [compositionClipItem(clip)],
      }))
      : [];
    const v2Rows = data.source === "ipc" && episode.clips.some((clip) => clip.kind === "component")
      ? v2TrackRows(episode.clips)
      : [];
    const textClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "text") : TEXT_CLIPS;
    const subtitleClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "subtitle") : [];
    const overlayClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "overlay") : [];
    const transClips = data.source === "ipc" ? episode.clips.filter((clip) => clip.kind === "trans" || clip.kind === "transition") : TRANS_CLIPS;
    const audioClips = data.source === "ipc"
      ? episode.clips.filter((clip) => clip.kind === "audio")
      : episode.clips.filter((clip) => clip.id === "bgm-electric").slice(0, 1);
    const anchors = Object.entries(selectedCompositionClip?.anchors ?? episode.anchors);
    const trackCount = allCompositionRows.length > 0
      ? allCompositionRows.length
      : clipFirstRows.length > 0
      ? clipFirstRows.length
      : v2Rows.length > 0
      ? v2Rows.length
      : data.source === "ipc"
        ? new Set(episode.clips.map((clip) => clip.kind)).size
        : 4;
    const clipCount = allCompositionRows.length > 0
      ? allCompositionRows.length
      : clipFirstRows.length > 0
      ? clipFirstRows.reduce((sum, row) => sum + row.items.length, 0)
      : data.source === "ipc" ? episode.clips.length : 7;
    const renderedTrackIds = allCompositionRows.length > 0
      ? allCompositionRows.map((row) => row.id)
      : clipFirstRows.length > 0
      ? clipFirstRows.map((row) => row.id)
      : v2Rows.length > 0
      ? v2Rows.map((row) => row.id)
      : ["scene", "text", "subtitle", "overlay", "trans", "audio"];
    this.dataset.trackCount = String(trackCount);
    this.dataset.trackIds = renderedTrackIds.join(",");
    this.dataset.mode = allCompositionRows.length > 0 ? "clip-all" : clipFirstRows.length > 0 ? "clip-first" : "flat";
    this.dataset.selectedClipId = selectedCompositionClip?.id ?? "";
    this.root.innerHTML = `
      <div class="timeline">
        <div class="tl-top">
          <div class="t">${selectedCompositionClip ? `${escapeAttr(selectedCompositionClip.label)} · ` : ""}时间轴 · ${trackCount} 轨 · ${clipCount} 组件</div>
          <div class="anchors">
            ${anchors.map(([name, time]) => `<span><b>${name}</b> ${time.toFixed(1)}</span>`).join("")}
          </div>
          <div class="zoom">${this.getAttribute("zoom") ?? "1"}× · fit</div>
        </div>
        <div class="tl-ruler">
          ${Array.from({ length: 13 }, (_, index) => {
            const value = index * 5;
            const major = index % 2 === 1 ? "maj" : "";
            return `<div class="tick ${major}" style="left:${pct(value, duration)};"><span class="n">${value}</span></div>`;
          }).join("")}
        </div>
        <div class="tl-body">
          ${allCompositionRows.length > 0 ? allCompositionRows.map((row) => `
            <nf-track kind="${row.kind}" label="${escapeAttr(row.label)}" track-id="${escapeAttr(row.id)}" data-track-id="${escapeAttr(row.id)}">
              ${row.items.map((clip) => `<nf-clip slot="clips" id="${clip.id}" data-track-id="${escapeAttr(row.id)}" kind="${clip.kind}" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
          `).join("") : clipFirstRows.length > 0 ? clipFirstRows.map((row) => `
            <nf-track kind="${row.kind}" label="${escapeAttr(row.label)}" track-id="${escapeAttr(row.id)}" data-track-id="${escapeAttr(row.id)}" ${row.id === selectedId ? "selected" : ""}>
              ${row.items.map((clip) => `<nf-clip slot="clips" id="${clip.id}" data-track-id="${escapeAttr(row.id)}" kind="${clip.kind}" start="${clip.start}" end="${clip.end}" duration="${selectedCompositionClip ? selectedCompositionClip.end - selectedCompositionClip.start : duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
          `).join("") : v2Rows.length > 0 ? v2Rows.map((row) => `
            <nf-track kind="${row.kind}" label="${escapeAttr(row.label)}" track-id="${escapeAttr(row.id)}" data-track-id="${escapeAttr(row.id)}" ${row.id === selectedId ? "selected" : ""}>
              ${row.clips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" data-track-id="${escapeAttr(row.id)}" kind="${clip.kind}" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId || row.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
          `).join("") : `
            <nf-track kind="scene" label="画面">
              ${sceneClips.map((clip) => {
                const mockActive = data.source !== "ipc" && clip.id === "feat-2";
                const active = clip.id === selectedId || mockActive;
                return `<nf-clip slot="clips" id="${clip.id}" kind="scene" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(mockActive ? "feat 2 · 18s" : clip.label)}" ${active ? "active" : ""}></nf-clip>`;
              }).join("")}
            </nf-track>
            <nf-track kind="text" label="文字">
              ${textClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="text" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
            <nf-track kind="subtitle" label="字幕">
              ${subtitleClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="subtitle" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
            <nf-track kind="overlay" label="叠加">
              ${overlayClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="overlay" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
            <nf-track kind="trans" label="转场">
              ${transClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="trans" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(clip.label)}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
            <nf-track kind="audio" label="音频">
              ${audioClips.map((clip) => `<nf-clip slot="clips" id="${clip.id}" kind="audio" start="${clip.start}" end="${clip.end}" duration="${duration}" label="${escapeAttr(data.source === "ipc" ? clip.label : "bgm · -6dB")}" ${clip.id === selectedId ? "active" : ""}></nf-clip>`).join("")}
            </nf-track>
          `}
          <div class="playhead" style="left:${pct(currentTime, duration)};"></div>
          ${anchors.map(([name, time]) => `<nf-anchor name="${name}" time="${time}" duration="${duration}"></nf-anchor>`).join("")}
        </div>
      </div>
    `;
    this.bind(duration);
  }

  private bind(duration: number): void {
    const ruler = this.root.querySelector<HTMLElement>(".tl-ruler");
    if (ruler) {
      ruler.style.cursor = "ew-resize";
      let dragging = false;
      const seekFromX = (clientX: number) => {
        const rect = ruler.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const width = Math.max(1, rect.width);
        const time = Math.min(duration, (x / width) * duration);
        this.setAttribute("current-time", time.toFixed(3));
        this.emit<PlayheadMoveDetail>("playhead-move", { time });
      };
      const onMove = (event: MouseEvent) => {
        if (!dragging) return;
        seekFromX(event.clientX);
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      ruler.addEventListener("mousedown", (event) => {
        dragging = true;
        seekFromX((event as MouseEvent).clientX);
        // listen on document so the drag survives leaving the ruler element
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        event.preventDefault();
      });
    }
    this.root.addEventListener("clip-click", (event) => {
      const detail = (event as CustomEvent<ClipSelectDetail>).detail;
      if (this.dataset.mode === "clip-all") {
        this.emit<TimelineClipSelectDetail>("clip-select", {
          track: detail.kind,
          "clip-id": detail.id,
        });
        return;
      }
      if (this.dataset.mode === "clip-first") {
        const clipId = this.dataset.selectedClipId;
        if (!clipId) return;
        this.emit<TimelineClipSelectDetail>("clip-select", {
          track: detail.kind,
          "clip-id": clipId,
        });
        return;
      }
      this.emit<TimelineClipSelectDetail>("clip-select", {
        track: detail.kind,
        "clip-id": detail.id,
      });
    });
    this.root.addEventListener("track-select", (event) => {
      const detail = (event as CustomEvent<TimelineTrackSelectDetail>).detail;
      if (this.dataset.mode === "clip-first") {
        const clipId = this.dataset.selectedClipId;
        if (!clipId) return;
        this.emit<TimelineClipSelectDetail>("clip-select", {
          track: detail.track,
          "clip-id": clipId,
        });
        return;
      }
      this.emit<TimelineClipSelectDetail>("clip-select", {
        track: detail.track,
        "clip-id": detail["track-id"],
      });
    });
    this.root.addEventListener("anchor-hover", (event) => {
      const detail = (event as CustomEvent<AnchorHoverDetail>).detail;
      this.emit<AnchorHoverDetail>("anchor-hover", detail);
    });
  }
}

function compositionClipItem(clip: NonNullable<ReturnType<typeof getEpisode>["composition_clips"]>[number]): NfClip {
  return {
    id: clip.id,
    label: clip.label,
    kind: "scene",
    track: 0,
    start: clip.start,
    end: clip.end,
    effects: [],
    position: { x: 50, y: 50 },
    track_id: clip.id,
  };
}

function v2TrackRows(clips: ReturnType<typeof getEpisode>["clips"]): Array<{
  id: string;
  label: string;
  kind: string;
  clips: ReturnType<typeof getEpisode>["clips"];
}> {
  const map = new Map<string, ReturnType<typeof getEpisode>["clips"]>();
  for (const clip of clips) {
    const id = clip.track_id ?? clip.id;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(clip);
  }
  return Array.from(map.entries())
    .map(([id, rowClips]) => ({
      id,
      label: rowLabel(id, rowClips[0]),
      kind: rowClips[0]?.kind ?? "component",
      clips: rowClips.sort((a, b) => a.start - b.start),
    }))
    .sort((a, b) => (a.clips[0]?.track ?? 0) - (b.clips[0]?.track ?? 0));
}

function rowLabel(id: string, clip: ReturnType<typeof getEpisode>["clips"][number] | undefined): string {
  const component = clip?.component ? ` · ${clip.component}` : "";
  return `${id}${component}`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
