import { NfAnchor } from "./components/anchor.js";
import { NfClip } from "./components/clip.js";
import { NfClips } from "./components/clips.js";
import { NfInspector } from "./components/inspector.js";
import { NfLog } from "./components/log.js";
import { NfTimeline } from "./components/timeline.js";
import { NfTopbar } from "./components/topbar.js";
import { NfTrack } from "./components/track.js";
import type { ClipSelectDetail, TimelineClipSelectDetail } from "./events.js";
import { loadProjectData, type NfMockData } from "./storage.js";

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
  const params = new URLSearchParams(window.location.search);
  const project = params.get("project") || "next-frame";
  const episode = params.get("episode") || "ep-01";
  return {
    project,
    episode,
    explicit: params.has("project") || params.has("episode"),
  };
}

function applyRoute(project: string, episode: string): void {
  document.querySelector("nf-topbar")?.setAttribute("project-id", project);
  document.querySelector("nf-topbar")?.setAttribute("episode-id", episode);
  document.querySelector("nf-clips")?.setAttribute("episode-id", episode);
}

function applyData(data: NfMockData): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const selected = episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0];
  document.querySelector("nf-topbar")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-clips")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-timeline")?.setAttribute("duration", String(episode.duration));
  if (selected) {
    document.querySelector("nf-clips")?.setAttribute("selected-id", selected.id);
    document.querySelector("nf-inspector")?.setAttribute("clip-id", selected.id);
  }
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
