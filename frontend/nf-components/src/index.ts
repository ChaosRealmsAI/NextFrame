import { NfAnchor } from "./components/anchor.js";
import { NfClip } from "./components/clip.js";
import { NfClips } from "./components/clips.js";
import { NfInspector } from "./components/inspector.js";
import { NfLog } from "./components/log.js";
import { NfTimeline } from "./components/timeline.js";
import { NfTopbar } from "./components/topbar.js";
import { NfTrack } from "./components/track.js";
import type { ClipSelectDetail, FieldEditDetail, TimelineClipSelectDetail } from "./events.js";
import {
  exportEpisode,
  exportStatus,
  getMockData,
  loadProjectData,
  openExport,
  patchClip,
  updateClipLabel,
  updateClipPosition,
  type NfClip as NfDataClip,
  type NfMockData,
} from "./storage.js";

export const NF_COMPONENTS_VERSION = "0.2.0-w4";

let selectedClipId = "";

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
  const route = routeFromUrl();

  clips?.addEventListener("clip-select", (event) => {
    const detail = (event as CustomEvent<ClipSelectDetail>).detail;
    selectClip(detail.id);
  });

  timeline?.addEventListener("clip-select", (event) => {
    const detail = (event as CustomEvent<TimelineClipSelectDetail>).detail;
    selectClip(detail["clip-id"]);
  });

  inspector?.addEventListener("field-edit", (event) => {
    const detail = (event as CustomEvent<FieldEditDetail>).detail;
    if (detail.field === "label") {
      const clipId = inspector.getAttribute("clip-id");
      if (!clipId || typeof detail.value !== "string") return;
      inspector.setAttribute("save-status", "saving");
      void updateClipLabel(route.project, route.episode, clipId, detail.value)
        .then(() => loadProjectData(route.project, route.episode, { explicitRoute: true }))
        .then((data) => applyData(data, clipId))
        .then(() => inspector.setAttribute("save-status", "saved"))
        .catch((error) => {
          inspector.setAttribute("save-status", "failed");
          inspector.setAttribute("save-error", error instanceof Error ? error.message : String(error));
        });
    }
    if (detail.field === "label-preview") {
      const clipId = inspector.getAttribute("clip-id");
      if (!clipId || typeof detail.value !== "string") return;
      const clip = patchClip(clipId, { label: detail.value }, { notify: false });
      if (clip) applyShellChrome(getMockData(), clip);
    }
    if (detail.field === "position") {
      const clipId = inspector.getAttribute("clip-id");
      const position = positionValue(detail.value);
      if (!clipId || !position) return;
      inspector.setAttribute("save-status", "saving");
      void updateClipPosition(route.project, route.episode, clipId, position)
        .then(() => loadProjectData(route.project, route.episode, { explicitRoute: true }))
        .then((data) => applyData(data, clipId))
        .then(() => inspector.setAttribute("save-status", "saved"))
        .catch((error) => {
          inspector.setAttribute("save-status", "failed");
          inspector.setAttribute("save-error", error instanceof Error ? error.message : String(error));
        });
    }
    if (detail.field === "position-preview") {
      const clipId = inspector.getAttribute("clip-id");
      const position = positionValue(detail.value);
      if (!clipId || !position) return;
      const clip = patchClip(clipId, { position }, { notify: false });
      if (clip) applyShellChrome(getMockData(), clip);
    }
    if (detail.field === "export") {
      startExportFlow(route.project, route.episode, inspector);
    }
    if (detail.field === "open-export") {
      const path = typeof detail.value === "string" && detail.value.length > 0
        ? detail.value
        : inspector.getAttribute("export-path") ?? "";
      if (!path) return;
      inspector.setAttribute("export-open-status", "opening");
      void openExport(path)
        .then(() => inspector.setAttribute("export-open-status", "opened"))
        .catch((error) => {
          inspector.setAttribute("export-open-status", "failed");
          inspector.setAttribute("export-error", error instanceof Error ? error.message : String(error));
        });
    }
  });

  wirePreviewDrag(route.project, route.episode);
}

function startExportFlow(project: string, episode: string, inspector: Element): void {
  inspector.setAttribute("export-status", "running");
  inspector.removeAttribute("export-open-status");
  inspector.removeAttribute("export-error");
  void exportEpisode(project, episode)
    .then((started) => {
      inspector.setAttribute("export-path", started.out);
      pollExport(started.job_id, inspector);
    })
    .catch((error) => {
      inspector.setAttribute("export-status", "failed");
      inspector.setAttribute("export-error", error instanceof Error ? error.message : String(error));
    });
}

function pollExport(jobId: string, inspector: Element): void {
  window.setTimeout(() => {
    void exportStatus(jobId)
      .then((status) => {
        inspector.setAttribute("export-status", status.status);
        inspector.setAttribute("export-path", status.out);
        if (status.error) inspector.setAttribute("export-error", status.error);
        if (status.status === "running") {
          pollExport(jobId, inspector);
        }
      })
      .catch((error) => {
        inspector.setAttribute("export-status", "failed");
        inspector.setAttribute("export-error", error instanceof Error ? error.message : String(error));
      });
  }, 1000);
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

function applyData(data: NfMockData, preferredClipId = selectedClipId): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const selected = data.source === "ipc"
    ? episode.clips.find((clip) => clip.id === preferredClipId) ?? episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0]
    : episode.clips.find((clip) => clip.id === "feat-2") ?? episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0];
  document.querySelector("nf-topbar")?.setAttribute("project-id", data.project.id);
  document.querySelector("nf-topbar")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-clips")?.setAttribute("episode-id", episode.id);
  document.querySelector("nf-timeline")?.setAttribute("duration", String(episode.duration));
  if (selected) {
    selectedClipId = selected.id;
    selectClip(selected.id, selected);
  }
  applyShellChrome(data, selected);
}

function selectClip(clipId: string, clip?: NfDataClip): void {
  selectedClipId = clipId;
  document.querySelector("nf-clips")?.setAttribute("selected-id", clipId);
  document.querySelector("nf-inspector")?.setAttribute("clip-id", clipId);
  document.querySelector("nf-timeline")?.setAttribute("selected-id", clipId);
  const selected = clip ?? getMockData().episodes[0]?.clips.find((item) => item.id === clipId);
  if (selected) {
    document.querySelector("nf-timeline")?.setAttribute("current-time", String(selected.start));
    applyShellChrome(getMockData(), selected);
  }
}

function applyShellChrome(data: NfMockData, selected: NfDataClip | undefined): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const currentTime = data.source === "ipc" ? selected?.start ?? 0 : 12.45;
  const pct = episode.duration > 0 ? Math.min(100, Math.max(0, currentTime / episode.duration * 100)) : 0;
  setText("[data-nf-preview-time]", `${formatTime(currentTime)} · T=${(episode.duration > 0 ? currentTime / episode.duration : 0).toFixed(4)}`);
  setText("[data-nf-preview-clip]", selected?.label ?? episode.id);
  setText("[data-nf-preview-title]", selected?.label ?? episode.name);
  setText("[data-nf-preview-subtitle]", selected?.id ?? episode.id);
  const position = selected?.position ?? { x: 50, y: 50 };
  const copy = document.querySelector<HTMLElement>("[data-nf-preview-copy]");
  copy?.style.setProperty("--nf-title-x", `${position.x}%`);
  copy?.style.setProperty("--nf-title-y", `${position.y}%`);
  setText("[data-nf-current-time]", formatTime(currentTime));
  setText("[data-nf-total-time]", ` / ${formatTime(episode.duration)}`);
  document.querySelector<HTMLElement>("[data-nf-scrub-fill]")?.style.setProperty("width", `${pct}%`);
  document.querySelector<HTMLElement>("[data-nf-scrub-head]")?.style.setProperty("left", `${pct}%`);
}

function wirePreviewDrag(project: string, episode: string): void {
  const copy = document.querySelector<HTMLElement>("[data-nf-preview-copy]");
  const frame = document.querySelector<HTMLElement>("[data-nf-preview-frame]");
  const inspector = document.querySelector("nf-inspector");
  if (!copy || !frame || !inspector) return;

  let dragging = false;
  const moveTo = (event: PointerEvent): { x: number; y: number } => {
    const rect = frame.getBoundingClientRect();
    const x = clampPercent((event.clientX - rect.left) / Math.max(1, rect.width) * 100);
    const y = clampPercent((event.clientY - rect.top) / Math.max(1, rect.height) * 100);
    copy.style.setProperty("--nf-title-x", `${x}%`);
    copy.style.setProperty("--nf-title-y", `${y}%`);
    return { x, y };
  };

  copy.addEventListener("pointerdown", (event) => {
    if (!selectedClipId) return;
    dragging = true;
    copy.setPointerCapture(event.pointerId);
    copy.classList.add("dragging");
    moveTo(event);
  });
  copy.addEventListener("pointermove", (event) => {
    if (!dragging || !selectedClipId) return;
    const position = moveTo(event);
    patchClip(selectedClipId, { position }, { notify: false });
  });
  copy.addEventListener("pointerup", (event) => {
    if (!dragging || !selectedClipId) return;
    dragging = false;
    copy.classList.remove("dragging");
    const position = moveTo(event);
    patchClip(selectedClipId, { position }, { notify: true });
    inspector.setAttribute("save-status", "saving");
    void updateClipPosition(project, episode, selectedClipId, position)
      .then(() => loadProjectData(project, episode, { explicitRoute: true }))
      .then((data) => applyData(data, selectedClipId))
      .then(() => inspector.setAttribute("save-status", "saved"))
      .catch((error) => {
        inspector.setAttribute("save-status", "failed");
        inspector.setAttribute("save-error", error instanceof Error ? error.message : String(error));
      });
  });
  copy.addEventListener("pointercancel", () => {
    dragging = false;
    copy.classList.remove("dragging");
  });
}

function positionValue(value: string | Record<string, unknown>): { x: number; y: number } | undefined {
  if (typeof value === "string") return undefined;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x: clampPercent(x), y: clampPercent(y) };
}

function clampPercent(value: number): number {
  return Math.min(95, Math.max(5, value));
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
