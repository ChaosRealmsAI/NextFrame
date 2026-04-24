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
  exportEpisode,
  exportStatus,
  getMockData,
  loadProjectData,
  openExport,
  patchClip,
  synthesizeVoice,
  updateClipLabel,
  updateClipPosition,
  voiceStatus,
  type NfClip as NfDataClip,
  type NfMockData,
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
    if (detail.field === "export") {
      startExportFlow(route.project, route.episode, inspector);
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

  wirePreviewDrag(route.project, route.episode);
  wirePlaybackControls();
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
    maybeAutoGenerateVoice(data.project.id, episode.id, selected);
  }
  applyShellChrome(data, selected, selected?.start ?? 0);
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
  const accent = validColor(scene?.accent_color) ? scene!.accent_color! : "#5eead4";
  const bg = validColor(scene?.bg_color) ? scene!.bg_color! : "#07080d";
  frame.style.setProperty("--nf-preview-accent", accent);
  frame.style.setProperty("--nf-preview-bg", bg);
  renderPreviewLayers(data, time, accent);
}

function renderPreviewLayers(data: NfMockData, time: number, fallbackAccent: string): void {
  const root = document.querySelector<HTMLElement>("[data-nf-preview-layers]");
  if (!root) return;
  const textLayers = activeClipsAt(data, time, "text").map((clip) => renderTextPreview(clip, fallbackAccent));
  const subtitles = activeClipsAt(data, time, "subtitle").map((clip) => renderSubtitlePreview(clip, time, fallbackAccent));
  const overlays = activeClipsAt(data, time, "overlay").map((clip) => renderOverlayPreview(clip, fallbackAccent));
  const audio = activeClipsAt(data, time, "audio").map(renderAudioIndicator);
  root.innerHTML = [...textLayers, ...subtitles, ...overlays, ...audio].join("");
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
  const spans = words.map((word) => {
    const state = localMs >= word.start_ms && localMs < word.end_ms
      ? "active"
      : word.end_ms <= localMs
        ? "read"
        : "";
    return `<span class="${state}">${escapeHtml(word.text)}</span>`;
  }).join("");
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
