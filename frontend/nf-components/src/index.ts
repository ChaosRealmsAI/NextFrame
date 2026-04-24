import { NfAnchor } from "./components/anchor.js";
import { NfClip } from "./components/clip.js";
import { NfClips } from "./components/clips.js";
import { NfInspector } from "./components/inspector.js";
import { NfLog } from "./components/log.js";
import { NfTimeline } from "./components/timeline.js";
import { NfTopbar } from "./components/topbar.js";
import { NfTrack } from "./components/track.js";
import type { ClipSelectDetail, FieldEditDetail, PlayheadMoveDetail, TimelineClipSelectDetail } from "./events.js";
import {
  escapeHtml,
  exportCancel,
  exportComposition,
  exportEpisode,
  exportStatus,
  getMockData,
  loadCompositionData,
  loadProjectData,
  openExport,
  patchClip,
  patchCompositionTrackField,
  synthesizeVoice,
  updateCompositionTrackField,
  updateClipLabel,
  updateClipPosition,
  voiceStatus,
  type NfClip as NfDataClip,
  type NfRuntimeSource,
  type NfMockData,
  type NfExportProgress,
  type NfTtsSpec,
} from "./storage.js";

export const NF_COMPONENTS_VERSION = "0.2.0-w4";

let selectedClipId = "";
let currentPreviewTime = 0;
let playbackRaf = 0;
let playbackStartedAt = 0;
let playbackStartTime = 0;
let playing = false;
const previewAudio = new Map<string, HTMLAudioElement>();
const previewAudioSrc = new Map<string, string>();
const autoVoiceStarted = new Set<string>();
let compositionSource: NfRuntimeSource | null = null;
const compositionComponents = new Map<string, NfComponentApi>();
const mountedComposition = new Map<string, { root: HTMLElement; api: NfComponentApi }>();

interface NfComponentContext {
  timeMs: number;
  localTimeMs: number;
  progress: number;
  durationMs: number;
  params: Record<string, unknown>;
  style: Record<string, unknown>;
  track: Record<string, unknown>;
  theme: Record<string, unknown>;
  viewport: Record<string, unknown>;
  mode: string;
}

interface NfComponentApi {
  mount?: (root: HTMLElement, ctx: NfComponentContext) => void;
  update?: (root: HTMLElement, ctx: NfComponentContext) => void;
  destroy?: (root: HTMLElement) => void;
}

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

  timeline?.addEventListener("playhead-move", (event) => {
    const detail = (event as CustomEvent<PlayheadMoveDetail>).detail;
    stopPlayback({ keepButtonState: false });
    seekPreviewTime(detail.time, { syncTimeline: false });
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
      if (clip) applyShellChrome(getMockData(), clip, currentPreviewTime);
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
      if (clip) applyShellChrome(getMockData(), clip, currentPreviewTime);
    }
    if (detail.field === "composition-preview") {
      const patch = compositionFieldValue(detail.value);
      if (!route.composition || !compositionSource || !patch) return;
      patchCompositionTrackField(patch.track, patch.field, patch.value);
      patchCompositionSourceField(compositionSource, patch.track, patch.field, patch.value);
      renderCurrentCompositionPreview();
      inspector.setAttribute("save-status", "dirty");
    }
    if (detail.field === "composition-save") {
      const patch = compositionFieldValue(detail.value);
      if (!route.composition || !compositionSource || !patch) return;
      saveCompositionField(route.project, route.composition, patch.track, patch.field, patch.value);
    }
    if (detail.field === "export") {
      startExportFlow(route.project, route.episode, inspector, route.composition);
    }
    if (detail.field === "export-profile" && typeof detail.value === "string") {
      inspector.setAttribute("export-profile", detail.value);
      inspector.removeAttribute("export-progress");
    }
    if (detail.field === "export-cancel") {
      const jobId = typeof detail.value === "string" && detail.value.length > 0
        ? detail.value
        : inspector.getAttribute("export-job-id") ?? "";
      if (!jobId) return;
      inspector.setAttribute("export-status", "cancelling");
      void exportCancel(jobId)
        .then((cancelled) => {
          inspector.setAttribute("export-status", cancelled.status);
          inspector.setAttribute("export-progress", JSON.stringify({ stage: cancelled.cancelled ? "cancelled" : cancelled.status, percent: 0 }));
        })
        .catch((error) => {
          inspector.setAttribute("export-status", "failed");
          inspector.setAttribute("export-error", error instanceof Error ? error.message : String(error));
        });
    }
    if (detail.field === "voice") {
      const clipId = inspector.getAttribute("clip-id");
      const voice = voiceValue(detail.value);
      if (!clipId || !voice) return;
      startVoiceFlow(route.project, route.episode, clipId, voice, inspector);
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

  wirePreviewDrag(route.project, route.episode, route.composition);
  wirePlaybackControls();
}

function saveCompositionField(project: string, composition: string, track: string, field: string, value: unknown): void {
  const inspector = document.querySelector("nf-inspector");
  if (!compositionSource || !inspector) return;
  patchCompositionTrackField(track, field, value);
  patchCompositionSourceField(compositionSource, track, field, value);
  renderCurrentCompositionPreview();
  inspector.setAttribute("save-status", "saving");
  void updateCompositionTrackField(project, composition, track, field, value)
    .then((loaded) => applyComposition(loaded.source, loaded.data, track))
    .then(() => inspector.setAttribute("save-status", "saved"))
    .catch((error) => {
      inspector.setAttribute("save-status", "failed");
      inspector.setAttribute("save-error", error instanceof Error ? error.message : String(error));
    });
}

function saveCompositionFieldFromRoute(track: string, field: string, value: unknown): void {
  const route = routeFromUrl();
  if (!route.composition) return;
  saveCompositionField(route.project, route.composition, track, field, value);
}

function startVoiceFlow(project: string, episode: string, clipId: string, voice: NfTtsSpec & { text: string }, inspector: Element): void {
  inspector.setAttribute("voice-status", "running");
  inspector.removeAttribute("voice-error");
  inspector.removeAttribute("voice-audio");
  void synthesizeVoice(project, episode, clipId, voice.text, voice)
    .then((started) => {
      inspector.setAttribute("voice-audio", started.audio);
      pollVoice(started.job_id, project, episode, clipId, inspector);
    })
    .catch((error) => {
      inspector.setAttribute("voice-status", "failed");
      inspector.setAttribute("voice-error", error instanceof Error ? error.message : String(error));
    });
}

function pollVoice(jobId: string, project: string, episode: string, clipId: string, inspector: Element): void {
  window.setTimeout(() => {
    void voiceStatus(jobId)
      .then((status) => {
        inspector.setAttribute("voice-status", status.status);
        inspector.setAttribute("voice-audio", status.audio);
        if (status.error) inspector.setAttribute("voice-error", status.error);
        if (status.status === "running") {
          pollVoice(jobId, project, episode, clipId, inspector);
          return;
        }
        if (status.status === "succeeded") {
          void loadProjectData(project, episode, { explicitRoute: true })
            .then((data) => applyData(data, clipId))
            .catch((error) => {
              inspector.setAttribute("voice-status", "failed");
              inspector.setAttribute("voice-error", error instanceof Error ? error.message : String(error));
            });
        }
      })
      .catch((error) => {
        inspector.setAttribute("voice-status", "failed");
        inspector.setAttribute("voice-error", error instanceof Error ? error.message : String(error));
      });
  }, 1000);
}

function voiceValue(value: string | Record<string, unknown>): (NfTtsSpec & { text: string }) | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? { text } : undefined;
  }
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (!text) return undefined;
  return {
    text,
    voice: typeof value.voice === "string" ? value.voice : undefined,
    backend: typeof value.backend === "string" ? value.backend : undefined,
    rate: typeof value.rate === "string" ? value.rate : undefined,
  };
}

function startExportFlow(project: string, episode: string, inspector: Element, composition?: string): void {
  inspector.setAttribute("export-status", "running");
  inspector.removeAttribute("export-open-status");
  inspector.removeAttribute("export-error");
  inspector.removeAttribute("export-job-id");
  inspector.setAttribute("export-progress", JSON.stringify({ stage: "queued", percent: 0 }));
  const profile = inspector.getAttribute("export-profile") || "final";
  const options = { profile };
  const start = composition ? exportComposition(project, composition, options) : exportEpisode(project, episode, options);
  void start
    .then((started) => {
      inspector.setAttribute("export-job-id", started.job_id);
      inspector.setAttribute("export-path", started.out);
      if (started.profile) inspector.setAttribute("export-profile", started.profile);
      setExportProgress(inspector, started.progress);
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
        if (status.profile) inspector.setAttribute("export-profile", status.profile);
        setExportProgress(inspector, status.progress);
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

function setExportProgress(inspector: Element, progress?: NfExportProgress): void {
  if (!progress) return;
  inspector.setAttribute("export-progress", JSON.stringify(progress));
}

function routeFromUrl(): { project: string; episode: string; composition?: string; explicit: boolean } {
  const params = routeParams();
  const session = window.NEXTFRAME_SESSION;
  const project = params.get("project") || session?.project || "next-frame";
  const composition = params.get("composition") || session?.composition || undefined;
  const episode = params.get("episode") || session?.episode || composition || "ep-01";
  return {
    project,
    episode,
    explicit: params.has("project") || params.has("episode") || params.has("composition") || session != null,
    ...(composition ? { composition } : {}),
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
    maybeAutoGenerateVoice(data.project.id, episode.id, selected);
  }
  applyShellChrome(data, selected, selected?.start ?? 0);
}

function applyComposition(source: NfRuntimeSource, data: NfMockData, preferredClipId = selectedClipId): void {
  compositionSource = source;
  compileCompositionComponents(source);
  installCompositionTheme(source);
  applyData(data, preferredClipId);
}

function maybeAutoGenerateVoice(project: string, episode: string, clip: NfDataClip): void {
  if (clip.kind !== "scene" || !clip.tts?.text) return;
  if (hasGeneratedAudioForClip(clip.id)) return;
  const key = `${project}/${episode}/${clip.id}`;
  if (autoVoiceStarted.has(key)) return;
  const inspector = document.querySelector("nf-inspector");
  if (!inspector) return;
  autoVoiceStarted.add(key);
  startVoiceFlow(project, episode, clip.id, { ...clip.tts, text: clip.tts.text }, inspector);
}

function hasGeneratedAudioForClip(clipId: string): boolean {
  const episode = getMockData().episodes[0];
  const expectedAudioId = `voice-${clipId}`;
  return episode?.clips.some((clip) => {
    if (clip.kind !== "audio" || !clip.src) return false;
    return clip.id === expectedAudioId || clip.tts?.audio_clip === expectedAudioId || clip.tts?.text != null;
  }) ?? false;
}

function selectClip(clipId: string, clip?: NfDataClip): void {
  stopPlayback({ keepButtonState: false });
  selectedClipId = clipId;
  document.querySelector("nf-clips")?.setAttribute("selected-id", clipId);
  document.querySelector("nf-inspector")?.setAttribute("clip-id", clipId);
  document.querySelector("nf-timeline")?.setAttribute("selected-id", clipId);
  document.querySelector("nf-timeline")?.setAttribute("data-selected-track-id", clipId);
  const selected = clip ?? getMockData().episodes[0]?.clips.find((item) => item.id === clipId);
  if (selected) {
    currentPreviewTime = selected.start;
    document.querySelector("nf-timeline")?.setAttribute("current-time", String(currentPreviewTime));
    applyShellChrome(getMockData(), selected, currentPreviewTime);
  }
}

function wirePlaybackControls(): void {
  document.querySelector<HTMLElement>("[data-nf-play]")?.addEventListener("click", () => {
    if (playing) {
      stopPlayback({ keepButtonState: false });
    } else {
      startPlayback();
    }
  });
  document.querySelectorAll<HTMLElement>("[data-nf-skip]").forEach((button) => {
    button.addEventListener("click", () => {
      stopPlayback({ keepButtonState: false });
      const direction = button.dataset.nfSkip === "next" ? "next" : "prev";
      seekPreviewTime(adjacentClipTime(direction), { syncTimeline: true });
    });
  });
}

function startPlayback(): void {
  const episode = getMockData().episodes[0];
  if (!episode || episode.duration <= 0) return;
  if (currentPreviewTime >= episode.duration - 0.001) currentPreviewTime = 0;
  playing = true;
  playbackStartedAt = performance.now();
  playbackStartTime = currentPreviewTime;
  updatePlayButton();
  syncPreviewAudio(getMockData(), currentPreviewTime);
  playbackRaf = window.requestAnimationFrame(playbackTick);
}

function playbackTick(now: number): void {
  if (!playing) return;
  const episode = getMockData().episodes[0];
  if (!episode) {
    stopPlayback({ keepButtonState: false });
    return;
  }
  const elapsed = (now - playbackStartedAt) / 1000;
  const nextTime = Math.min(episode.duration, playbackStartTime + elapsed);
  seekPreviewTime(nextTime, { syncTimeline: true });
  if (nextTime >= episode.duration) {
    stopPlayback({ keepButtonState: false });
    return;
  }
  playbackRaf = window.requestAnimationFrame(playbackTick);
}

function stopPlayback(options: { keepButtonState: boolean }): void {
  if (playbackRaf) {
    window.cancelAnimationFrame(playbackRaf);
    playbackRaf = 0;
  }
  playing = false;
  pausePreviewAudio();
  if (!options.keepButtonState) updatePlayButton();
}

function updatePlayButton(): void {
  const button = document.querySelector<HTMLElement>("[data-nf-play]");
  if (!button) return;
  button.textContent = playing ? "Ⅱ" : "▶";
  button.setAttribute("aria-label", playing ? "pause preview" : "play preview");
}

function seekPreviewTime(time: number, options: { syncTimeline: boolean }): void {
  if (compositionSource) {
    const data = getMockData();
    const episode = data.episodes[0];
    if (!episode) return;
    const safeTime = Math.min(episode.duration, Math.max(0, time));
    currentPreviewTime = safeTime;
    if (options.syncTimeline) {
      document.querySelector("nf-timeline")?.setAttribute("current-time", safeTime.toFixed(3));
    }
    applyShellChrome(data, getClipById(selectedClipId) ?? episode.clips[0], safeTime);
    return;
  }
  const data = getMockData();
  const episode = data.episodes[0];
  if (!episode) return;
  const safeTime = Math.min(episode.duration, Math.max(0, time));
  const activeScene = activeClipAt(data, safeTime, "scene") ?? episode.clips.find((clip) => clip.kind === "scene") ?? episode.clips[0];
  if (activeScene && activeScene.id !== selectedClipId) {
    selectedClipId = activeScene.id;
    document.querySelector("nf-clips")?.setAttribute("selected-id", activeScene.id);
    document.querySelector("nf-inspector")?.setAttribute("clip-id", activeScene.id);
    document.querySelector("nf-timeline")?.setAttribute("selected-id", activeScene.id);
  }
  if (options.syncTimeline) {
    document.querySelector("nf-timeline")?.setAttribute("current-time", safeTime.toFixed(3));
  }
  applyShellChrome(data, activeScene, safeTime);
}

function getClipById(id: string): NfDataClip | undefined {
  return getMockData().episodes[0]?.clips.find((clip) => clip.id === id || clip.track_id === id);
}

function adjacentClipTime(direction: "next" | "prev"): number {
  const episode = getMockData().episodes[0];
  if (!episode) return 0;
  const sceneStarts = episode.clips
    .filter((clip) => clip.kind === "scene")
    .map((clip) => clip.start)
    .sort((a, b) => a - b);
  if (sceneStarts.length === 0) return 0;
  if (direction === "next") {
    return sceneStarts.find((time) => time > currentPreviewTime + 0.05) ?? sceneStarts[0] ?? 0;
  }
  return sceneStarts.slice().reverse().find((time) => time < currentPreviewTime - 0.05)
    ?? sceneStarts.at(-1)
    ?? 0;
}

function applyShellChrome(data: NfMockData, selected: NfDataClip | undefined, time?: number): void {
  const episode = data.episodes[0];
  if (!episode) return;
  const currentTime = Number.isFinite(time) ? Math.max(0, time ?? 0) : data.source === "ipc" ? selected?.start ?? 0 : 12.45;
  currentPreviewTime = currentTime;
  const activeScene = activeClipAt(data, currentTime, "scene") ?? selected;
  const pct = episode.duration > 0 ? Math.min(100, Math.max(0, currentTime / episode.duration * 100)) : 0;
  setText("[data-nf-preview-time]", `${formatTime(currentTime)} · T=${(episode.duration > 0 ? currentTime / episode.duration : 0).toFixed(4)}`);
  setText("[data-nf-preview-clip]", activeScene?.label ?? selected?.label ?? episode.id);
  setText("[data-nf-preview-title]", activeScene?.label ?? selected?.label ?? episode.name);
  setText("[data-nf-preview-subtitle]", activeScene?.subtitle ?? activeScene?.id ?? selected?.id ?? episode.id);
  const position = activeScene?.position ?? selected?.position ?? { x: 50, y: 50 };
  const copy = document.querySelector<HTMLElement>("[data-nf-preview-copy]");
  copy?.style.setProperty("--nf-title-x", `${position.x}%`);
  copy?.style.setProperty("--nf-title-y", `${position.y}%`);
  applyPreviewFrame(data, currentTime, activeScene ?? selected);
  syncPreviewAudio(data, currentTime);
  setText("[data-nf-current-time]", formatTime(currentTime));
  setText("[data-nf-total-time]", ` / ${formatTime(episode.duration)}`);
  document.querySelector<HTMLElement>("[data-nf-scrub-fill]")?.style.setProperty("width", `${pct}%`);
  document.querySelector<HTMLElement>("[data-nf-scrub-head]")?.style.setProperty("left", `${pct}%`);
}

function activeClipAt(data: NfMockData, time: number, kind?: NfDataClip["kind"]): NfDataClip | undefined {
  const episode = data.episodes[0];
  return episode?.clips.find((clip) => {
    if (kind && clip.kind !== kind) return false;
    return time >= clip.start && time < clip.end;
  });
}

function activeClipsAt(data: NfMockData, time: number, kind: NfDataClip["kind"]): NfDataClip[] {
  const episode = data.episodes[0];
  return episode?.clips.filter((clip) => clip.kind === kind && time >= clip.start && time < clip.end) ?? [];
}

function applyPreviewFrame(data: NfMockData, time: number, scene: NfDataClip | undefined): void {
  const frame = document.querySelector<HTMLElement>("[data-nf-preview-frame]");
  if (!frame) return;
  frame.classList.toggle("v2-composition", compositionSource != null);
  const accent = validColor(scene?.accent_color) ? scene!.accent_color! : "#5eead4";
  const bg = validColor(scene?.bg_color) ? scene!.bg_color! : "#07080d";
  frame.style.setProperty("--nf-preview-accent", accent);
  frame.style.setProperty("--nf-preview-bg", bg);
  renderPreviewLayers(data, time, accent);
}

function renderPreviewLayers(data: NfMockData, time: number, fallbackAccent: string): void {
  const root = document.querySelector<HTMLElement>("[data-nf-preview-layers]");
  if (!root) return;
  if (compositionSource) {
    renderCompositionPreview(root, compositionSource, time);
    syncPreviewAudio(data, time);
    return;
  }
  const textLayers = activeClipsAt(data, time, "text").map((clip) => renderTextPreview(clip, fallbackAccent));
  const subtitles = activeClipsAt(data, time, "subtitle").map((clip) => renderSubtitlePreview(clip, time, fallbackAccent));
  const overlays = activeClipsAt(data, time, "overlay").map((clip) => renderOverlayPreview(clip, fallbackAccent));
  const audio = activeClipsAt(data, time, "audio").map(renderAudioIndicator);
  root.innerHTML = [...textLayers, ...subtitles, ...overlays, ...audio].join("");
}

function compileCompositionComponents(source: NfRuntimeSource): void {
  compositionComponents.clear();
  for (const [id, code] of Object.entries(source.components ?? {})) {
    try {
      compositionComponents.set(id, loadComponentApi(code));
    } catch (error) {
      console.error("NextFrame component load failed", id, error);
    }
  }
}

function loadComponentApi(code: string): NfComponentApi {
  const names: string[] = [];
  const rewritten = code.replace(
    /^(\s*)export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
    (_match, indent: string, name: string) => {
      names.push(name);
      return `${indent}function ${name}(`;
    },
  );
  const body = [
    "\"use strict\";",
    "const module = { exports: {} };",
    "const exports = module.exports;",
    rewritten,
    ";const __nfExports = {};",
    ...names.map((name) => `if (typeof ${name} === 'function') __nfExports.${name} = ${name};`),
    "if (module.exports && Object.keys(module.exports).length > 0) return module.exports;",
    "return __nfExports;",
  ].join("\n");
  return new Function(body)() as NfComponentApi;
}

function installCompositionTheme(source: NfRuntimeSource): void {
  const css = source.theme?.css ?? "";
  let style = document.getElementById("nf-theme-v2");
  if (!style) {
    style = document.createElement("style");
    style.id = "nf-theme-v2";
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function renderCompositionPreview(root: HTMLElement, source: NfRuntimeSource, timeSeconds: number): void {
  const timeMs = timeSeconds * 1000;
  const active = activeCompositionTracks(source, timeMs);
  const activeKeys = new Set(active.map((item) => item.key));
  const viewport = compositionViewport(source);
  const rootRect = root.getBoundingClientRect();
  const scale = Math.min(
    rootRect.width / viewport.w,
    rootRect.height / viewport.h,
  );
  const scaledWidth = viewport.w * scale;
  const scaledHeight = viewport.h * scale;
  const left = (rootRect.width - scaledWidth) / 2;
  const top = (rootRect.height - scaledHeight) / 2;
  for (const [key, mounted] of Array.from(mountedComposition.entries())) {
    if (activeKeys.has(key)) continue;
    try { mounted.api.destroy?.(mounted.root); } catch (error) { console.error(error); }
    mounted.root.remove();
    mountedComposition.delete(key);
  }

  for (const item of active) {
    const api = compositionComponents.get(item.component);
    if (!api) continue;
    let mounted = mountedComposition.get(item.key);
    if (!mounted) {
      const el = document.createElement("div");
      el.dataset.nfComponentRoot = "true";
      el.dataset.nfComponentRoot = item.trackId;
      el.dataset.nfComponentTrack = item.trackId;
      el.dataset.nfComponent = item.component;
      el.style.position = "absolute";
      el.style.zIndex = String(item.z);
      el.style.overflow = "hidden";
      el.style.pointerEvents = "auto";
      root.appendChild(el);
      mounted = { root: el, api };
      mountedComposition.set(item.key, mounted);
      try { api.mount?.(el, item.ctx); } catch (error) { console.error(error); }
    }
    mounted.root.style.left = `${left}px`;
    mounted.root.style.top = `${top}px`;
    mounted.root.style.width = `${viewport.w}px`;
    mounted.root.style.height = `${viewport.h}px`;
    mounted.root.style.transformOrigin = "top left";
    mounted.root.style.transform = `scale(${scale})`;
    mounted.root.style.zIndex = String(item.z);
    try { api.update?.(mounted.root, item.ctx); } catch (error) { console.error(error); }
  }
  renderCompositionSubtitles(root, source, timeMs, {
    left,
    top,
    width: scaledWidth,
    height: scaledHeight,
  });
}

function renderCurrentCompositionPreview(): void {
  const layers = document.querySelector<HTMLElement>("[data-nf-preview-layers]");
  if (!layers || !compositionSource) return;
  renderCompositionPreview(layers, compositionSource, currentPreviewTime);
}

function compositionViewport(source: NfRuntimeSource): { w: number; h: number } {
  const raw = source.viewport ?? {};
  const w = typeof raw.w === "number" && Number.isFinite(raw.w) && raw.w > 0 ? raw.w : 1920;
  const h = typeof raw.h === "number" && Number.isFinite(raw.h) && raw.h > 0 ? raw.h : 1080;
  return { w, h };
}

function activeCompositionTracks(source: NfRuntimeSource, timeMs: number): Array<{
  key: string;
  trackId: string;
  component: string;
  z: number;
  ctx: NfComponentContext;
}> {
  const viewport = recordValue(source.viewport ?? { w: 1920, h: 1080, ratio: "16:9" });
  const theme = recordValue(source.theme ?? {});
  const out = [];
  for (const track of source.tracks ?? []) {
    if (track.kind !== "component") continue;
    const trackId = track.id ?? "component";
    const z = Number.isFinite(track.z) ? Number(track.z) : 10;
    for (const clip of track.clips ?? []) {
      const begin = Number(clip.begin ?? 0);
      const end = Number(clip.end ?? 0);
      if (!Number.isFinite(begin) || !Number.isFinite(end) || timeMs < begin || timeMs >= end) continue;
      const clipParams = recordValue(clip.params);
      const component = typeof clipParams.component === "string" ? clipParams.component : "";
      if (!component) continue;
      const span = Math.max(1, end - begin);
      out.push({
        key: `component:${trackId}:${component}`,
        trackId,
        component,
        z,
        ctx: {
          timeMs,
          localTimeMs: timeMs - begin,
          progress: Math.max(0, Math.min(1, (timeMs - begin) / span)),
          durationMs: span,
          params: recordValue(clipParams.params),
          style: recordValue(clipParams.style),
          track: recordValue(clipParams.track),
          theme,
          viewport,
          mode: "preview",
        },
      });
    }
  }
  return out.sort((a, b) => a.z - b.z);
}

function renderCompositionSubtitles(
  root: HTMLElement,
  source: NfRuntimeSource,
  timeMs: number,
  box: { left: number; top: number; width: number; height: number },
): void {
  let layer = root.querySelector<HTMLElement>("[data-nf-composition-subtitles]");
  if (!layer) {
    layer = document.createElement("div");
    layer.dataset.nfCompositionSubtitles = "true";
    layer.style.position = "absolute";
    layer.style.pointerEvents = "none";
    root.appendChild(layer);
  }
  layer.style.left = `${box.left}px`;
  layer.style.top = `${box.top}px`;
  layer.style.width = `${box.width}px`;
  layer.style.height = `${box.height}px`;
  layer.style.zIndex = "999";

  const active = activeCompositionSubtitles(source, timeMs);
  if (active.length === 0) {
    layer.innerHTML = "";
    layer.removeAttribute("data-subtitle-active");
    return;
  }
  const html = active.map((item) => renderCompositionSubtitle(item.words, item.localTimeMs, item.style)).join("");
  layer.innerHTML = html;
  const activeText = active
    .map((item) => item.words.find((word) => item.localTimeMs >= word.start_ms && item.localTimeMs < word.end_ms)?.text)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (activeText) {
    layer.dataset.subtitleActive = activeText;
  } else {
    layer.removeAttribute("data-subtitle-active");
  }
}

function activeCompositionSubtitles(source: NfRuntimeSource, timeMs: number): Array<{
  words: Array<{ text: string; start_ms: number; end_ms: number }>;
  style: Record<string, unknown>;
  localTimeMs: number;
}> {
  const out = [];
  for (const track of source.tracks ?? []) {
    if (track.kind !== "subtitle") continue;
    for (const clip of track.clips ?? []) {
      const begin = Number(clip.begin ?? 0);
      const end = Number(clip.end ?? 0);
      if (!Number.isFinite(begin) || !Number.isFinite(end) || timeMs < begin || timeMs >= end) continue;
      const params = recordValue(clip.params);
      const sourceParams = recordValue(params.source);
      const words = compositionSubtitleWords(sourceParams.words);
      if (words.length === 0) continue;
      out.push({
        words,
        style: recordValue(params.style),
        localTimeMs: timeMs - begin,
      });
    }
  }
  return out;
}

function renderCompositionSubtitle(
  words: Array<{ text: string; start_ms: number; end_ms: number }>,
  localTimeMs: number,
  style: Record<string, unknown>,
): string {
  const activeColor = typeof style.active_color === "string" && validColor(style.active_color) ? style.active_color : "#fbbf24";
  const color = typeof style.color === "string" && validColor(style.color) ? style.color : "#ffffff";
  const size = typeof style.size_px === "number" && Number.isFinite(style.size_px) ? Math.max(12, Math.min(72, style.size_px)) : 36;
  const padding = typeof style.padding === "number" && Number.isFinite(style.padding) ? Math.max(0, Math.min(240, style.padding)) : 52;
  const position = typeof style.position === "string" ? style.position : "bottom";
  const vertical = position === "top"
    ? `top:${padding}px;bottom:auto;transform:none;`
    : position === "middle"
      ? "top:50%;bottom:auto;transform:translateY(-50%);"
      : `bottom:${padding}px;top:auto;transform:none;`;
  const windowRange = subtitleVisibleWindow(words, localTimeMs);
  const spans = words.slice(windowRange.start, windowRange.end).map((word, index) => {
    const absoluteIndex = windowRange.start + index;
    const active = localTimeMs >= word.start_ms && localTimeMs < word.end_ms;
    const read = word.end_ms <= localTimeMs;
    const state = active ? "active" : read ? "read" : "unread";
    const wordColor = active ? activeColor : read ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.42)";
    return `<span data-nf-subtitle-word-idx="${absoluteIndex}" data-nf-subtitle-state="${state}" style="color:${wordColor};font-weight:${active ? 800 : 520};">${escapeHtml(word.text)}</span>`;
  }).join(" ");
  return `<div class="preview-subtitle-layer" data-subtitle-active data-nf-subtitle-window="${windowRange.start}-${windowRange.end}" style="left:32px;right:32px;${vertical}font-size:${size}px;color:${color};--nf-preview-accent:${activeColor};">${spans}</div>`;
}

function compositionSubtitleWords(value: unknown): Array<{ text: string; start_ms: number; end_ms: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const object = recordValue(item);
      const text = typeof object.text === "string" ? object.text : "";
      const start = typeof object.start_ms === "number" ? object.start_ms : Number.NaN;
      const end = typeof object.end_ms === "number" ? object.end_ms : Number.NaN;
      return text && Number.isFinite(start) && Number.isFinite(end) && end >= start
        ? { text, start_ms: start, end_ms: end }
        : undefined;
    })
    .filter((word): word is { text: string; start_ms: number; end_ms: number } => word !== undefined);
}

function subtitleVisibleWindow(
  words: Array<{ text: string; start_ms: number; end_ms: number }>,
  localTimeMs: number,
): { start: number; end: number } {
  const maxVisible = 9;
  if (words.length <= maxVisible) return { start: 0, end: words.length };
  const activeIndex = words.findIndex((word) => localTimeMs >= word.start_ms && localTimeMs < word.end_ms);
  let anchor = activeIndex;
  if (anchor < 0) {
    anchor = words.findIndex((word) => word.start_ms > localTimeMs);
    if (anchor < 0) anchor = words.length - 1;
  }
  let start = Math.max(0, anchor - 4);
  let end = start + maxVisible;
  if (end > words.length) {
    end = words.length;
    start = Math.max(0, end - maxVisible);
  }
  return { start, end };
}

function renderTextPreview(clip: NfDataClip, fallbackAccent: string): string {
  const style = clip.style === "label" || clip.style === "headline" ? clip.style : "caption";
  const size = Math.max(10, Math.min(44, clip.size_px ?? (style === "label" ? 14 : 20)));
  const color = validColor(clip.color) ? clip.color! : "#f7f4ed";
  const accent = validColor(clip.accent_color) ? clip.accent_color! : fallbackAccent;
  const align = clip.align === "left" || clip.align === "right" ? clip.align : "center";
  const x = clampPercent(clip.position.x);
  const y = clampPercent(clip.position.y);
  const tx = align === "left" ? "0" : align === "right" ? "-100%" : "-50%";
  return `
    <div class="preview-text-layer ${style}" style="left:${x}%;top:${y}%;transform:translate(${tx}, -50%);font-size:${size}px;color:${color};--nf-preview-accent:${accent};text-align:${align};">
      ${escapeHtml(clip.text ?? clip.label)}
    </div>
  `;
}

function renderOverlayPreview(clip: NfDataClip, fallbackAccent: string): string {
  const accent = validColor(clip.accent_color) ? clip.accent_color! : fallbackAccent;
  if (clip.variant === "progress") {
    const progress = Math.min(1, Math.max(0, clip.progress ?? 0.5));
    return `
      <div class="preview-overlay-progress" style="--nf-preview-accent:${accent};">
        <div class="meta"><span>${escapeHtml(clip.text ?? clip.label)}</span><span>${Math.round(progress * 100)}%</span></div>
        <div class="bar"><div class="fill" style="width:${(progress * 100).toFixed(2)}%;"></div></div>
      </div>
    `;
  }
  return `
    <div class="preview-overlay-layer badge" style="left:${clampPercent(clip.position.x)}%;top:${clampPercent(clip.position.y)}%;transform:none;--nf-preview-accent:${accent};">
      ${escapeHtml(clip.text ?? clip.label)}
    </div>
  `;
}

function renderSubtitlePreview(clip: NfDataClip, time: number, fallbackAccent: string): string {
  const words = clip.words ?? [];
  if (words.length === 0) return "";
  const localMs = Math.max(0, (time - clip.start) * 1000);
  const accent = validColor(clip.accent_color) ? clip.accent_color! : fallbackAccent;
  const windowRange = subtitleVisibleWindow(words, localMs);
  const spans = words.slice(windowRange.start, windowRange.end).map((word) => {
    const state = localMs >= word.start_ms && localMs < word.end_ms
      ? "active"
      : word.end_ms <= localMs
        ? "read"
        : "";
    return `<span class="${state}">${escapeHtml(word.text)}</span>`;
  }).join(" ");
  return `<div class="preview-subtitle-layer" style="--nf-preview-accent:${accent};">${spans}</div>`;
}

function renderAudioIndicator(clip: NfDataClip): string {
  const state = clip.src ? "AUDIO PREVIEW" : "AUDIO PLACEHOLDER";
  return `<div class="preview-audio-indicator">${escapeHtml(state)} · ${escapeHtml(clip.label)}</div>`;
}

function syncPreviewAudio(data: NfMockData, time: number): void {
  const active = activeClipsAt(data, time, "audio").filter((item) => item.src);
  const activeIds = new Set(active.map((clip) => clip.id));
  for (const [clipId, audio] of previewAudio) {
    if (!activeIds.has(clipId)) audio.pause();
  }
  for (const clip of active) {
    if (!clip.src) continue;
    let audio = previewAudio.get(clip.id);
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      previewAudio.set(clip.id, audio);
    }
    const src = playableAudioSrc(clip.src);
    const srcChanged = previewAudioSrc.get(clip.id) !== src;
    if (srcChanged) {
      audio.pause();
      audio.src = src;
      previewAudioSrc.set(clip.id, src);
    }
    audio.volume = Math.min(1, Math.max(0, clip.volume ?? 1));
    const targetTime = Math.max(0, time - clip.start + (clip.from_ms ?? 0) / 1000);
    const drift = Math.abs(audio.currentTime - targetTime);
    if (Number.isFinite(targetTime) && (srcChanged || !playing || drift > 1.25)) {
      audio.currentTime = targetTime;
    }
    if (playing) {
      void audio.play().catch(() => {
        // WebView audio may require a fresh user gesture; the next play click retries.
      });
    } else {
      audio.pause();
    }
  }
}

function pausePreviewAudio(): void {
  for (const audio of previewAudio.values()) audio.pause();
}

function playableAudioSrc(src: string): string {
  if (!src.startsWith("file://")) return src;
  try {
    const path = decodeURIComponent(new URL(src).pathname);
    return `nextframe://media/?path=${encodeURIComponent(path)}`;
  } catch {
    return src;
  }
}

function validColor(value: string | undefined): boolean {
  return value != null && /^#[0-9a-fA-F]{6}$/.test(value);
}

function wirePreviewDrag(project: string, episode: string, composition?: string): void {
  const copy = document.querySelector<HTMLElement>("[data-nf-preview-copy]");
  const frame = document.querySelector<HTMLElement>("[data-nf-preview-frame]");
  const layers = document.querySelector<HTMLElement>("[data-nf-preview-layers]");
  const inspector = document.querySelector("nf-inspector");
  if (!copy || !frame || !inspector) return;

  let dragging = false;
  let compositionDragTrack = "";
  const moveTo = (event: PointerEvent): { x: number; y: number } => {
    const rect = frame.getBoundingClientRect();
    const x = clampPercent((event.clientX - rect.left) / Math.max(1, rect.width) * 100);
    const y = clampPercent((event.clientY - rect.top) / Math.max(1, rect.height) * 100);
    copy.style.setProperty("--nf-title-x", `${x}%`);
    copy.style.setProperty("--nf-title-y", `${y}%`);
    return { x, y };
  };

  layers?.addEventListener("pointerdown", (event) => {
    if (!composition || !compositionSource) return;
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-nf-component-root]");
    if (!target) return;
    compositionDragTrack = target.dataset.nfComponentTrack ?? "";
    if (!compositionDragTrack) return;
    selectedClipId = compositionDragTrack;
    dragging = true;
    target.setPointerCapture(event.pointerId);
    target.classList.add("dragging");
    event.preventDefault();
  });
  layers?.addEventListener("pointermove", (event) => {
    if (!composition || !compositionSource || !dragging || !compositionDragTrack) return;
    const position = moveTo(event);
    patchCompositionParams(compositionSource, compositionDragTrack, position);
    renderCompositionPreview(layers, compositionSource, currentPreviewTime);
  });
  layers?.addEventListener("pointerup", (event) => {
    if (!composition || !compositionSource || !dragging || !compositionDragTrack) return;
    const target = event.target as HTMLElement;
    dragging = false;
    target.classList.remove("dragging");
    const position = moveTo(event);
    const track = compositionDragTrack;
    compositionDragTrack = "";
    patchCompositionParams(compositionSource, track, position);
    inspector.setAttribute("save-status", "saving");
    void updateCompositionTrackField(project, composition, track, "style.x", position.x)
      .then(() => updateCompositionTrackField(project, composition, track, "style.y", position.y))
      .then((loaded) => applyComposition(loaded.source, loaded.data, track))
      .then(() => inspector.setAttribute("save-status", "saved"))
      .catch((error) => {
        inspector.setAttribute("save-status", "failed");
        inspector.setAttribute("save-error", error instanceof Error ? error.message : String(error));
      });
  });

  copy.addEventListener("pointerdown", (event) => {
    if (compositionSource) return;
    if (!selectedClipId) return;
    dragging = true;
    copy.setPointerCapture(event.pointerId);
    copy.classList.add("dragging");
    moveTo(event);
  });
  copy.addEventListener("pointermove", (event) => {
    if (compositionSource) return;
    if (!dragging || !selectedClipId) return;
    const position = moveTo(event);
    patchClip(selectedClipId, { position }, { notify: false });
  });
  copy.addEventListener("pointerup", (event) => {
    if (compositionSource) return;
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

function patchCompositionParams(source: NfRuntimeSource, trackId: string, position: { x: number; y: number }): void {
  patchCompositionTrackField(trackId, "style.x", position.x);
  patchCompositionTrackField(trackId, "style.y", position.y);
  patchCompositionSourceField(source, trackId, "style.x", position.x);
  patchCompositionSourceField(source, trackId, "style.y", position.y);
  patchCompositionSourceField(source, trackId, "params.x", position.x);
  patchCompositionSourceField(source, trackId, "params.y", position.y);
}

function patchCompositionSourceField(source: NfRuntimeSource, trackId: string, field: string, value: unknown): void {
  for (const track of source.tracks ?? []) {
    if (track.id !== trackId) continue;
    for (const clip of track.clips ?? []) {
      const params = recordValue(clip.params);
      if (track.kind === "subtitle" && field === "params.words") {
        const nested = recordValue(params.source);
        nested.words = value;
        params.source = nested;
      } else if (track.kind === "subtitle" && field.startsWith("params.words.")) {
        const nested = recordValue(params.source);
        const words = Array.isArray(nested.words) ? nested.words : [];
        setFieldPath(words, field.slice("params.words.".length), value);
        nested.words = words;
        params.source = nested;
      } else if (field.startsWith("params.")) {
        const nested = recordValue(params.params);
        setFieldPath(nested, field.slice("params.".length), value);
        params.params = nested;
      } else if (field.startsWith("style.")) {
        const nested = recordValue(params.style);
        setFieldPath(nested, field.slice("style.".length), value);
        params.style = nested;
      } else if (field === "z") {
        track.z = Number(value);
      } else if (field.startsWith("time.")) {
        // Raw authoring time fields are saved through IPC; compiled source keeps numeric begin/end until reload.
      }
      clip.params = params;
    }
  }
}

function setFieldPath(target: Record<string, unknown> | unknown[], field: string, value: unknown): void {
  const parts = field.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, unknown> | unknown[] = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const nextPart = parts[index + 1]!;
    const fallback: Record<string, unknown> | unknown[] = numericPathPart(nextPart) == null ? {} : [];
    if (Array.isArray(current)) {
      const arrayIndex = numericPathPart(part);
      if (arrayIndex == null) return;
      if (current[arrayIndex] == null || typeof current[arrayIndex] !== "object") current[arrayIndex] = fallback;
      current = current[arrayIndex] as Record<string, unknown> | unknown[];
    } else {
      const next = current[part];
      if (next == null || typeof next !== "object") current[part] = fallback;
      current = current[part] as Record<string, unknown> | unknown[];
    }
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(current)) {
    const arrayIndex = numericPathPart(last);
    if (arrayIndex != null) current[arrayIndex] = value;
  } else {
    current[last] = value;
  }
}

function compositionFieldValue(value: string | Record<string, unknown>): { track: string; field: string; value: unknown } | undefined {
  if (typeof value === "string") return undefined;
  const track = typeof value.track === "string" ? value.track : "";
  const field = typeof value.field === "string" ? value.field : "";
  if (!track || !field) return undefined;
  return { track, field, value: value.value };
}

function positionValue(value: string | Record<string, unknown>): { x: number; y: number } | undefined {
  if (typeof value === "string") return undefined;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x: clampPercent(x), y: clampPercent(y) };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampPercent(value: number): number {
  return Math.min(95, Math.max(5, value));
}

function numericPathPart(value: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
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
  if (route.composition) {
    void loadCompositionData(route.project, route.composition, { explicitRoute: route.explicit })
      .then((loaded) => applyComposition(loaded.source, loaded.data));
  } else {
    void loadProjectData(route.project, route.episode, { explicitRoute: route.explicit }).then(applyData);
  }
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
      composition?: string;
    };
    __NF_W4__?: {
      tags: string[];
      defined: () => boolean;
    };
    __NF_COMPOSITION_FIELD__?: (track: string, field: string, value: unknown) => void;
  }
}

window.__NF_W4__ = {
  tags: DEFINITIONS.map(([tag]) => tag),
  defined: () => DEFINITIONS.every(([tag]) => customElements.get(tag) != null),
};
window.__NF_COMPOSITION_FIELD__ = saveCompositionFieldFromRoute;
