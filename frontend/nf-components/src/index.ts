import { NfAnchor } from "./components/anchor.js";
import { NfClip } from "./components/clip.js";
import { NfClips } from "./components/clips.js";
import { NfInspector } from "./components/inspector.js";
import { NfLog } from "./components/log.js";
import { NfTimeline } from "./components/timeline.js";
import { NfTopbar } from "./components/topbar.js";
import { NfTrack } from "./components/track.js";
import type { ClipSelectDetail, TimelineClipSelectDetail } from "./events.js";
import { loadProjectData, type NfClip as NfDataClip, type NfMockData } from "./storage.js";

export const NF_COMPONENTS_VERSION = "0.2.0-w4";

const DEFINITIONS: Array<[string, CustomElementConstructor]> = [
  ["nf-topbar", NfTopbar],
  ["nf-clips", NfClips],
  ["nf-log", NfLog],
  ["nf-timeline", NfTimeline],
  ["nf-track", NfTrack],
  ["nf-clip", NfClip],
  ["nf-anchor", NfAnchor],
  ["nf-inspector", NfInspector],
];

for (const [tag, ctor] of DEFINITIONS) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

function wireApp(): void {
  const clips = document.querySelector("nf-clips");
  const inspector = document.querySelector("nf-inspector");
  const timeline = document.querySelector("nf-timeline");

  clips?.addEventListener("clip-select", (event) => {
    const detail = (event as CustomEvent<ClipSelectDetail>).detail;
    inspector?.setAttribute("clip-id", detail.id);
  });

  timeline?.addEventListener("clip-select", (event) => {
    const detail = (event as CustomEvent<TimelineClipSelectDetail>).detail;
    clips?.setAttribute("selected-id", detail["clip-id"]);
    inspector?.setAttribute("clip-id", detail["clip-id"]);
  });
}

function routeFromUrl(): { project: string; episode: string; explicit: boolean } {
  const params = routeParams();
  const session = window.NEXTFRAME_SESSION;
  const project = params.get("project") || session?.project || "next-frame";
  const episode = params.get("episode") || session?.episode || "ep-01";
  return {
    project,
    episode,
    explicit: params.has("project") || params.has("episode") || session != null,
  };
}

function routeParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  if (params.has("project") || params.has("episode")) return params;
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash);
}

function applyRoute(project: string, episode: string): void {
  document.querySelector("nf-topbar")?.setAttribute("project-id", project);
  document.querySelector("nf-topbar")?.setAttribute("episode-id", episode);
  document.querySelector("nf-clips")?.setAttribute("episode-id", episode);
}

function applyData(data: NfMockData): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const selected = data.source === "ipc"
    ? episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0]
    : episode.clips.find((clip) => clip.id === "feat-2") ?? episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0];
  document.querySelector("nf-topbar")?.setAttribute("project-id", data.project.id);
  document.querySelector("nf-topbar")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-clips")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-timeline")?.setAttribute("duration", String(episode.duration));
  if (selected) {
    document.querySelector("nf-clips")?.setAttribute("selected-id", selected.id);
    document.querySelector("nf-inspector")?.setAttribute("clip-id", selected.id);
    document.querySelector("nf-timeline")?.setAttribute("current-time", String(data.source === "ipc" ? selected.start : 12.45));
  }
  applyShellChrome(data, selected);
}

function applyShellChrome(data: NfMockData, selected: NfDataClip | undefined): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const currentTime = data.source === "ipc" ? selected?.start ?? 0 : 12.45;
  const pct = episode.duration > 0 ? Math.min(100, Math.max(0, currentTime / episode.duration * 100)) : 0;
  setText("[data-nf-preview-time]", `${formatTime(currentTime)} · T=${(episode.duration > 0 ? currentTime / episode.duration : 0).toFixed(4)}`);
  setText("[data-nf-preview-clip]", selected?.label ?? episode.id);
  setText("[data-nf-current-time]", formatTime(currentTime));
  setText("[data-nf-total-time]", ` / ${formatTime(episode.duration)}`);
  document.querySelector<HTMLElement>("[data-nf-scrub-fill]")?.style.setProperty("width", `${pct}%`);
  document.querySelector<HTMLElement>("[data-nf-scrub-head]")?.style.setProperty("left", `${pct}%`);
}

function setText(selector: string, text: string): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function startApp(): void {
  const route = routeFromUrl();
  applyRoute(route.project, route.episode);
  wireApp();
  void loadProjectData(route.project, route.episode, { explicitRoute: route.explicit }).then(applyData);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}

declare global {
  interface Window {
    NEXTFRAME_SESSION?: {
      project: string;
      episode: string;
    };
    __NF_W4__?: {
      tags: string[];
      defined: () => boolean;
    };
  }
}

window.__NF_W4__ = {
  tags: DEFINITIONS.map(([tag]) => tag),
  defined: () => DEFINITIONS.every(([tag]) => customElements.get(tag) != null),
};
