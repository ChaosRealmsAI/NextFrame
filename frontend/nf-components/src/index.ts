import { NfAnchor } from "./components/anchor.js";
import { NfClip } from "./components/clip.js";
import { NfClips } from "./components/clips.js";
import { NfInspector } from "./components/inspector.js";
import { NfLog } from "./components/log.js";
import { NfTimeline } from "./components/timeline.js";
import { NfTopbar } from "./components/topbar.js";
import { NfTrack } from "./components/track.js";
import type { ClipSelectDetail, TimelineClipSelectDetail } from "./events.js";
import { loadMockData } from "./storage.js";

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    wireApp();
    void loadMockData();
  }, { once: true });
} else {
  wireApp();
  void loadMockData();
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
