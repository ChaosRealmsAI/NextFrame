import type { ClipKind } from "./events.js";

export interface NfProject {
  id: string;
  name: string;
}

export interface NfEpisodeSummary {
  id: string;
  name: string;
}

export interface NfClip {
  id: string;
  label: string;
  kind: ClipKind;
  track: number;
  track_id?: string | undefined;
  component?: string | undefined;
  start: number;
  end: number;
  effects: string[];
  position: { x: number; y: number };
  layout?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  eyebrow?: string | undefined;
  description?: string | undefined;
  big_number?: string | undefined;
  sublabel?: string | undefined;
  text?: string | undefined;
  words?: NfSubtitleWord[] | undefined;
  variant?: string | undefined;
  progress?: number | undefined;
  accent_color?: string | undefined;
  bg_color?: string | undefined;
  style?: string | undefined;
  align?: string | undefined;
  color?: string | undefined;
  size_px?: number | undefined;
  src?: string | undefined;
  from_ms?: number | undefined;
  to_ms?: number | undefined;
  volume?: number | undefined;
  tts?: NfTtsSpec | undefined;
}

export interface NfSubtitleWord {
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface NfTtsSpec {
  text?: string | undefined;
  voice?: string | undefined;
  backend?: string | undefined;
  rate?: string | undefined;
  audio_clip?: string | undefined;
}

export interface NfLogEntry {
  time: string;
  actor: "AI" | "人";
  desc: string;
  cli: string;
  pending?: boolean;
  accent?: boolean;
}

export interface NfInspectorFields {
  position: { x: number; y: number };
  size: { w: number; h: number };
  timing: { start: number; duration: number; expression: string; startAnchor: string };
  keyframes: Array<{ t: number; value: string | number }>;
  effects: string[];
  color: string;
}

export interface NfEpisode {
  id: string;
  name: string;
  duration: number;
  anchors: Record<string, number>;
  clips: NfClip[];
  log: NfLogEntry[];
  inspector_fields: NfInspectorFields;
}

export interface NfMockData {
  project: NfProject;
  episodes: NfEpisode[];
  source?: "mock" | "ipc" | "fallback";
}

export const DEFAULT_MOCK: NfMockData = {
  source: "mock",
  project: { id: "next-frame", name: "NextFrame 产品介绍" },
  episodes: [
    {
      id: "ep-01",
      name: "产品介绍",
      duration: 60,
      anchors: {
        "intro-end": 5,
        "feat-1-end": 12,
        "feat-2-end": 30,
        "outro-start": 55,
      },
      clips: [
        { id: "intro", label: "intro", kind: "scene", track: 0, start: 0, end: 5, effects: ["fade-in"], position: { x: 50, y: 50 } },
        { id: "feat-1", label: "feat 1", kind: "scene", track: 0, start: 5, end: 12, effects: ["glass-flip"], position: { x: 50, y: 50 } },
        { id: "feat-2", label: "feat 2", kind: "scene", track: 0, start: 12, end: 30, effects: ["glass-flip", "blur · 8px", "scale · 1.05", "color-cinematic"], position: { x: 50, y: 50 } },
        { id: "feat-3", label: "feat 3", kind: "scene", track: 0, start: 30, end: 48, effects: ["push-in"], position: { x: 50, y: 50 } },
        { id: "outro", label: "outro", kind: "scene", track: 0, start: 55, end: 60, effects: ["fade"], position: { x: 50, y: 50 } },
        { id: "badge", label: "badge", kind: "overlay", track: 2, start: 0, end: 60, effects: ["brand"], position: { x: 8, y: 8 } },
        { id: "bgm-electric", label: "bgm-electric", kind: "audio", track: 3, start: 0, end: 58.2, effects: ["normalize · -14 LUFS"], position: { x: 50, y: 50 } },
        { id: "narration-v2", label: "narration-v2", kind: "audio", track: 3, start: 0, end: 60, effects: ["voice-clean"], position: { x: 50, y: 50 } },
      ],
      log: [
        { time: "12:03:00", actor: "AI", desc: "读取 <b>project.json</b> · 解析视频结构", cli: "nf read project.json --format=json", accent: true },
        { time: "12:03:01", actor: "AI", desc: "写入 <b>4 个时间锚点</b>", cli: "nf anchors --set intro-end=5 --set feat-1-end=12 --set feat-2-end=30", accent: true },
        { time: "12:03:02", actor: "AI", desc: "生成 <b>4 轨道 · 7 clips</b>", cli: "nf tracks --gen scene,text,trans,audio --anchors", accent: true },
        { time: "12:03:04", actor: "AI", desc: "编译项目 · 生成 bundle", cli: "nf build project.json" },
        { time: "12:03:07", actor: "AI", desc: "桌面端启动 · WebSocket 就绪", cli: "nf preview --port 7443 --mode live" },
        { time: "12:03:12", actor: "人", desc: "拖动 <b>feat-2</b> 右边界 · 16.4s -> <b>18.0s</b>", cli: "nf clip edit feat-2 --end 18.0s" },
        { time: "12:03:12", actor: "AI", desc: "联动锚点 <code>feat-2-end</code> 28.4 -> <b>30.0s</b> · 3 clips 重算", cli: "nf anchors --set feat-2-end=30.0 --cascade", accent: true },
        { time: "12:03:13", actor: "AI", desc: "增量 rebuild", cli: "nf build --incremental" },
        { time: "12:03:13", actor: "AI", desc: "frame pure 一致性校验", cli: "nf verify --modes play,preview,export" },
        { time: "12:03:18", actor: "人", desc: "playhead 移至 <code>12.450s</code>", cli: "nf cursor --set 12.450" },
        { time: "12:03:20", actor: "AI", desc: "建议 <b>feat-2</b> 应用 <code>color-cinematic</code> LUT", cli: "nf suggest --clip feat-2 --type color-grade", accent: true },
        { time: "12:03:22", actor: "人", desc: "接受建议 · 应用 LUT", cli: "nf clip apply feat-2 --effect color-cinematic" },
        { time: "12:03:24", actor: "AI", desc: "BGM 音量归一化 · LUFS -14 标准", cli: "nf audio normalize --clip bgm --lufs -14", accent: true },
        { time: "12:03:25", actor: "AI", desc: "导出视频 · 4K HEVC HDR10", cli: "nf export -o out.mp4 --codec hevc --quality 4K", pending: true },
      ],
      inspector_fields: {
        position: { x: 0, y: 0 },
        size: { w: 3840, h: 2160 },
        timing: { start: 12, duration: 18, expression: "feat-2-end - feat-1-end", startAnchor: "feat-1-end" },
        keyframes: [
          { t: 0.12, value: 0 },
          { t: 0.5, value: 1 },
          { t: 0.88, value: 0.92 },
        ],
        effects: ["glass-flip", "blur · 8px", "scale · 1.05"],
        color: "cinematic-night",
      },
    },
  ],
};

let cached: NfMockData = DEFAULT_MOCK;
let cachedComposition: Record<string, unknown> | null = null;
let ipcSeq = 1;

interface ShellIpc {
  postMessage: (message: string) => void;
}

interface WebkitIpc {
  messageHandlers?: {
    ipc?: ShellIpc;
  };
}

interface NfIpcErrorRecord {
  error?: string;
  detail?: string;
  hint?: string;
  exit_code?: number;
}

interface NfIpcResponse<T> {
  req_id: string;
  ok: boolean;
  data?: T;
  error?: NfIpcErrorRecord;
}

export interface NfExportStart {
  job_id: string;
  status: "running";
  out: string;
  profile?: string;
  progress?: NfExportProgress;
}

export interface NfExportStatus {
  job_id: string;
  status: "running" | "succeeded" | "failed";
  out: string;
  profile?: string;
  progress?: NfExportProgress;
  result?: unknown;
  error?: string | null;
}

export interface NfExportProgress {
  stage?: string;
  percent?: number;
  frames_encoded?: number;
  total_frames?: number;
  eta_seconds?: number | null;
}

export interface NfExportOptions {
  profile?: string;
  fps?: number;
  resolution?: string;
  parallel?: number;
}

export interface NfExportOpen {
  opened: boolean;
  path: string;
}

export interface NfRuntimeSource {
  meta?: Record<string, unknown>;
  viewport?: { w?: number; h?: number; ratio?: string };
  duration?: number;
  theme?: { id?: string; css?: string };
  components?: Record<string, string>;
  tracks?: NfRuntimeTrack[];
}

export interface NfRuntimeTrack {
  id?: string;
  kind?: string;
  z?: number;
  clips?: Array<{
    id?: string;
    begin?: number;
    end?: number;
    params?: Record<string, unknown>;
  }>;
}

export interface NfCompositionLoad {
  composition: Record<string, unknown>;
  source: NfRuntimeSource;
  warnings: string[];
  data: NfMockData;
}

export interface NfVoiceStart {
  job_id: string;
  status: "running";
  audio: string;
  timeline: string;
}

export interface NfVoiceStatus {
  job_id: string;
  status: "running" | "succeeded" | "failed";
  audio: string;
  timeline: string;
  result?: {
    audio_clip?: string;
    subtitle_clip?: string;
    duration_ms?: number;
  } | null;
  error?: string | null;
}

interface PendingIpc {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: number;
}

interface LoadProjectOptions {
  explicitRoute?: boolean;
}

interface RealProject {
  slug?: string;
  id?: string;
  name?: string;
  episodes?: unknown[];
}

interface RealEpisode {
  slug?: string;
  id?: string;
  name?: string;
  duration?: number;
  anchors?: Record<string, number>;
  clips?: unknown[];
  log?: unknown[];
}

const pendingIpc = new Map<string, PendingIpc>();

export function getMockData(): NfMockData {
  return cached;
}

export function getEpisode(episodeId = "ep-01"): NfEpisode {
  return cached.episodes.find((episode) => episode.id === episodeId) ?? cached.episodes[0]!;
}

export function getClip(id: string, episodeId = "ep-01"): NfClip | undefined {
  return getEpisode(episodeId).clips.find((clip) => clip.id === id);
}

export async function loadMockData(): Promise<NfMockData> {
  try {
    const response = await fetch(new URL("../mock.json", import.meta.url));
    if (!response.ok) throw new Error(`mock.json ${response.status}`);
    const loaded = await response.json() as NfMockData;
    cached = { ...loaded, source: "mock" };
  } catch {
    cached = DEFAULT_MOCK;
  }
  dispatchDataReady(cached);
  return cached;
}

export async function loadProjectData(
  projectSlug: string,
  episodeSlug: string,
  options: LoadProjectOptions = {},
): Promise<NfMockData> {
  cachedComposition = null;
  if (!shellIpc()) {
    const data = await loadMockData();
    if (options.explicitRoute) {
      showDataNotice("IPC 连接失败 · 已显示本地样例");
    }
    return data;
  }

  let project: RealProject;
  try {
    project = await shellRequest<RealProject>("projects.show", { project: projectSlug });
  } catch (error) {
    console.error("NextFrame project IPC failed", error);
    showDataNotice(`项目未找到 · 可 nf projects create --slug=${projectSlug}`);
    cached = fallbackData(projectSlug, episodeSlug, "fallback");
    dispatchDataReady(cached);
    return cached;
  }

  try {
    const episode = await shellRequest<RealEpisode>("episodes.show", {
      project: projectSlug,
      episode: episodeSlug,
    });
    cached = normalizeData(project, episode);
    dispatchDataReady(cached);
    return cached;
  } catch (error) {
    console.error("NextFrame episode IPC failed", error);
    showDataNotice("集不存在");
    cached = fallbackData(projectId(project, projectSlug), episodeSlug, "fallback", projectName(project, projectSlug));
    dispatchDataReady(cached);
    return cached;
  }
}

export async function loadCompositionData(
  projectSlug: string,
  compositionSlug: string,
  options: LoadProjectOptions = {},
): Promise<NfCompositionLoad> {
  if (!shellIpc()) {
    const data = await loadMockData();
    if (options.explicitRoute) showDataNotice("IPC 连接失败 · 已显示本地样例");
    return { composition: {}, source: {}, warnings: ["IPC unavailable"], data };
  }

  try {
    const project = await shellRequest<RealProject>("projects.show", { project: projectSlug });
    const loaded = await shellRequest<Omit<NfCompositionLoad, "data">>("compositions.show", {
      project: projectSlug,
      composition: compositionSlug,
    });
    const data = normalizeCompositionData(project, compositionSlug, loaded.source);
    cachedComposition = loaded.composition;
    cached = data;
    dispatchDataReady(cached);
    return { ...loaded, data };
  } catch (error) {
    console.error("NextFrame composition IPC failed", error);
    showDataNotice("Composition 不存在或编译失败");
    const data = fallbackData(projectSlug, compositionSlug, "fallback");
    cached = data;
    dispatchDataReady(cached);
    return { composition: {}, source: {}, warnings: [String(error)], data };
  }
}

export async function updateClipLabel(
  projectSlug: string,
  episodeSlug: string,
  clipId: string,
  label: string,
): Promise<void> {
  await shellRequest("clips.update", {
    project: projectSlug,
    episode: episodeSlug,
    clip: clipId,
    label,
  });
}

export async function updateClipPosition(
  projectSlug: string,
  episodeSlug: string,
  clipId: string,
  position: { x: number; y: number },
): Promise<void> {
  await shellRequest("clips.update", {
    project: projectSlug,
    episode: episodeSlug,
    clip: clipId,
    position,
  });
}

export function patchClip(
  clipId: string,
  patch: Partial<Pick<NfClip, "label" | "position">>,
  options: { notify?: boolean } = {},
): NfClip | undefined {
  const episode = getEpisode();
  const clip = episode.clips.find((item) => item.id === clipId);
  if (!clip) return undefined;
  if (patch.label !== undefined) clip.label = patch.label;
  if (patch.position) clip.position = normalizePosition(patch.position);
  if (options.notify) dispatchDataReady(cached);
  return clip;
}

export function exportEpisode(projectSlug: string, episodeSlug: string, options: NfExportOptions = {}): Promise<NfExportStart> {
  return shellRequest<NfExportStart>("export.start", {
    project: projectSlug,
    episode: episodeSlug,
    ...options,
  });
}

export function exportComposition(projectSlug: string, compositionSlug: string, options: NfExportOptions = {}): Promise<NfExportStart> {
  return shellRequest<NfExportStart>("export.start", {
    project: projectSlug,
    composition: compositionSlug,
    ...options,
  });
}

export async function updateCompositionTrackParams(
  projectSlug: string,
  compositionSlug: string,
  trackId: string,
  params: Record<string, unknown>,
): Promise<NfCompositionLoad> {
  const loaded = await shellRequest<Omit<NfCompositionLoad, "data">>("compositions.updateTrack", {
    project: projectSlug,
    composition: compositionSlug,
    track: trackId,
    params,
  });
  const project = await shellRequest<RealProject>("projects.show", { project: projectSlug });
  const data = normalizeCompositionData(project, compositionSlug, loaded.source);
  cachedComposition = loaded.composition;
  cached = data;
  dispatchDataReady(cached);
  return { ...loaded, data };
}

export async function updateCompositionTrackField(
  projectSlug: string,
  compositionSlug: string,
  trackId: string,
  field: string,
  value: unknown,
): Promise<NfCompositionLoad> {
  const loaded = await shellRequest<Omit<NfCompositionLoad, "data">>("compositions.updateTrack", {
    project: projectSlug,
    composition: compositionSlug,
    track: trackId,
    field,
    value,
  });
  const project = await shellRequest<RealProject>("projects.show", { project: projectSlug });
  const data = normalizeCompositionData(project, compositionSlug, loaded.source);
  cachedComposition = loaded.composition;
  cached = data;
  dispatchDataReady(cached);
  return { ...loaded, data };
}

export function getCompositionTrack(trackId: string): Record<string, unknown> | undefined {
  const tracks = Array.isArray(cachedComposition?.tracks) ? cachedComposition.tracks : [];
  return tracks
    .filter((item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item))
    .find((track) => stringValue(track.id) === trackId);
}

export function patchCompositionTrackField(trackId: string, field: string, value: unknown): Record<string, unknown> | undefined {
  const track = getCompositionTrack(trackId);
  if (!track) return undefined;
  setFieldPath(track, field, value);
  return track;
}

export function exportStatus(jobId: string): Promise<NfExportStatus> {
  return shellRequest<NfExportStatus>("export.status", {
    job_id: jobId,
  });
}

export function openExport(path: string): Promise<NfExportOpen> {
  return shellRequest<NfExportOpen>("export.open", {
    path,
  });
}

export function synthesizeVoice(
  projectSlug: string,
  episodeSlug: string,
  clipId: string,
  text: string,
  options: Pick<NfTtsSpec, "voice" | "backend" | "rate"> = {},
): Promise<NfVoiceStart> {
  return shellRequest<NfVoiceStart>("voice.start", {
    project: projectSlug,
    episode: episodeSlug,
    clip: clipId,
    text,
    voice: options.voice,
    backend: options.backend,
    rate: options.rate,
  });
}

export function voiceStatus(jobId: string): Promise<NfVoiceStatus> {
  return shellRequest<NfVoiceStatus>("voice.status", {
    job_id: jobId,
  });
}

function shellRequest<T>(op: string, params: Record<string, unknown>): Promise<T> {
  const ipc = shellIpc();
  if (!ipc) {
    return Promise.reject(new Error("shell IPC is unavailable"));
  }

  installIpcResolver();
  const reqId = `ui-${Date.now()}-${ipcSeq++}`;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingIpc.delete(reqId);
      reject(new Error(`${op} timed out`));
    }, 10_000);
    pendingIpc.set(reqId, {
      timer,
      resolve: (value) => resolve(value as T),
      reject,
    });
    ipc.postMessage(JSON.stringify({ req_id: reqId, op, params }));
  });
}

function shellIpc(): ShellIpc | undefined {
  return window.webkit?.messageHandlers?.ipc ?? window.ipc;
}

function installIpcResolver(): void {
  window.__NEXTFRAME_IPC_RESOLVE__ = (response: NfIpcResponse<unknown>) => {
    const pending = pendingIpc.get(response.req_id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingIpc.delete(response.req_id);
    if (response.ok) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error?.detail ?? response.error?.error ?? "IPC failed"));
    }
  };
}

function normalizeData(project: RealProject, episode: RealEpisode): NfMockData {
  const normalizedEpisode = normalizeEpisode(episode);
  return {
    source: "ipc",
    project: {
      id: projectId(project, "project"),
      name: projectName(project, "Project"),
    },
    episodes: [normalizedEpisode],
  };
}

function normalizeEpisode(episode: RealEpisode): NfEpisode {
  const anchors = normalizeAnchors(episode.anchors);
  const duration = finiteNumber(episode.duration, 60);
  const clips = Array.isArray(episode.clips)
    ? episode.clips.map((clip, index) => normalizeClip(clip, index, anchors, duration))
    : [];
  return {
    id: episode.id ?? episode.slug ?? "ep-01",
    name: episode.name ?? episode.slug ?? "Episode",
    duration,
    anchors,
    clips,
    log: Array.isArray(episode.log) ? episode.log.map(normalizeLogEntry) : [],
    inspector_fields: defaultInspectorFields(clips),
  };
}

function normalizeCompositionData(project: RealProject, compositionSlug: string, source: NfRuntimeSource): NfMockData {
  const duration = finiteNumber(source.duration, 60_000) / 1000;
  const clips: NfClip[] = [];
  for (const track of source.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      const params = asRecord(clip.params);
      const componentParams = asRecord(params.params);
      const componentStyle = asRecord(params.style);
      const id = stringValue(clip.id) ?? stringValue(track.id) ?? `track-${clips.length + 1}`;
      const begin = finiteNumber(clip.begin, 0);
      const end = finiteNumber(clip.end, begin + 1000);
      clips.push({
        id,
        label: stringValue(componentParams.title) ?? stringValue(params.component) ?? id,
        kind: track.kind === "audio" ? "audio" : track.kind === "subtitle" ? "subtitle" : track.kind === "component" ? "component" : "scene",
        track: finiteNumber(track.z, clips.length),
        track_id: stringValue(track.id) ?? id,
        component: stringValue(params.component),
        start: begin / 1000,
        end: end / 1000,
        effects: track.kind === "component" ? ["v2 component"] : [],
        position: normalizePosition({
          x: componentStyle.x ?? componentParams.x,
          y: componentStyle.y ?? componentParams.y,
        }),
        src: stringValue(params.src),
        volume: numberValue(params.volume),
      });
    }
  }
  return {
    source: "ipc",
    project: {
      id: projectId(project, "project"),
      name: projectName(project, "Project"),
    },
    episodes: [{
      id: compositionSlug,
      name: stringValue(source.meta?.name) ?? compositionSlug,
      duration,
      anchors: {},
      clips,
      log: [],
      inspector_fields: defaultInspectorFields(clips),
    }],
  };
}

function setFieldPath(target: Record<string, unknown>, field: string, value: unknown): void {
  const parts = field.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function normalizeClip(value: unknown, index: number, anchors: Record<string, number>, duration: number): NfClip {
  const object = asRecord(value);
  const id = stringValue(object.slug) ?? stringValue(object.id) ?? stringValue(object.clip) ?? `clip-${index + 1}`;
  const rawKind = stringValue(object.kind) ?? stringValue(object.track) ?? "scene";
  const kind = normalizeKind(rawKind);
  const start = resolveTime(object.start, anchors, 0);
  const fallbackEnd = Math.min(duration, start + 1);
  const end = Math.max(start, resolveTime(object.end, anchors, fallbackEnd));
  return {
    id,
    label: stringValue(object.label) ?? id,
    kind,
    track: trackNumber(kind),
    start,
    end,
    effects: stringArray(object.effects),
    position: normalizePosition(asRecord(object.position)),
    layout: stringValue(object.layout),
    title: stringValue(object.title),
    subtitle: stringValue(object.subtitle),
    eyebrow: stringValue(object.eyebrow),
    description: stringValue(object.description),
    big_number: stringValue(object.big_number),
    sublabel: stringValue(object.sublabel),
    text: stringValue(object.text),
    words: subtitleWords(object.words),
    variant: stringValue(object.variant),
    progress: numberValue(object.progress),
    accent_color: stringValue(object.accent_color),
    bg_color: stringValue(object.bg_color),
    style: stringValue(object.style),
    align: stringValue(object.align),
    color: stringValue(object.color),
    size_px: numberValue(object.size_px),
    src: stringValue(object.src),
    from_ms: numberValue(object.from_ms),
    to_ms: numberValue(object.to_ms),
    volume: numberValue(object.volume),
    tts: ttsSpec(object.tts),
  };
}

function normalizeLogEntry(value: unknown): NfLogEntry {
  const object = asRecord(value);
  const actor = stringValue(object.actor) === "human" ? "人" : "AI";
  return {
    time: stringValue(object.time) ?? "--:--:--",
    actor,
    desc: stringValue(object.desc) ?? "读取真实 JSON",
    cli: stringValue(object.cli) ?? "nf read",
    pending: object.pending === true || stringValue(object.status) === "pending",
    accent: actor === "AI",
  };
}

function defaultInspectorFields(clips: NfClip[]): NfInspectorFields {
  const clip = clips.find((item) => item.kind === "scene") ?? clips[0];
  const start = clip?.start ?? 0;
  const duration = clip ? clip.end - clip.start : 0;
  return {
    position: clip?.position ?? { x: 50, y: 50 },
    size: { w: 3840, h: 2160 },
    timing: {
      start,
      duration,
      expression: clip ? `${duration.toFixed(3)} 秒` : "无片段",
      startAnchor: `${start.toFixed(3)}s`,
    },
    keyframes: [],
    effects: clip?.effects ?? [],
    color: "none",
  };
}

function fallbackData(projectIdValue: string, episodeId: string, source: "fallback", projectLabel = projectIdValue): NfMockData {
  return {
    source,
    project: { id: projectIdValue, name: projectLabel },
    episodes: [{
      id: episodeId,
      name: episodeId,
      duration: 60,
      anchors: {},
      clips: [],
      log: [],
      inspector_fields: defaultInspectorFields([]),
    }],
  };
}

function dispatchDataReady(data: NfMockData): void {
  document.dispatchEvent(new CustomEvent<NfMockData>("nf-data-ready", {
    detail: data,
    bubbles: true,
    composed: true,
  }));
}

function showDataNotice(message: string): void {
  const notice = document.querySelector<HTMLElement>("[data-nf-data-notice]")
    ?? document.body.appendChild(document.createElement("div"));
  notice.dataset.nfDataNotice = "true";
  notice.textContent = message;
  notice.setAttribute("style", [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:9999",
    "max-width:360px",
    "padding:10px 12px",
    "background:rgba(10,10,14,0.92)",
    "border:1px solid rgba(255,255,255,0.16)",
    "color:#f6f7fb",
    "font:12px system-ui,sans-serif",
    "box-shadow:0 16px 40px rgba(0,0,0,0.38)",
  ].join(";"));
}

function normalizeAnchors(value: unknown): Record<string, number> {
  const object = asRecord(value);
  return Object.fromEntries(
    Object.entries(object)
      .map(([name, time]) => [name, finiteNumber(time, Number.NaN)] as const)
      .filter((entry): entry is readonly [string, number] => Number.isFinite(entry[1])),
  );
}

function resolveTime(value: unknown, anchors: Record<string, number>, fallback: number): number {
  if (typeof value === "number") return finiteNumber(value, fallback);
  if (typeof value !== "string") return fallback;
  if (Object.hasOwn(anchors, value)) return anchors[value]!;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKind(value: string): ClipKind {
  if (value === "component") return "component";
  if (value === "audio") return "audio";
  if (value === "subtitle") return "subtitle";
  if (value === "text") return "text";
  if (value === "overlay") return "overlay";
  if (value === "trans" || value === "transition") return "trans";
  return "scene";
}

function trackNumber(kind: ClipKind): number {
  if (kind === "text") return 1;
  if (kind === "subtitle") return 2;
  if (kind === "overlay") return 2;
  if (kind === "trans" || kind === "transition") return 2;
  if (kind === "audio") return 3;
  return 0;
}

function projectId(project: RealProject, fallback: string): string {
  return project.slug ?? project.id ?? fallback;
}

function projectName(project: RealProject, fallback: string): string {
  return project.name ?? projectId(project, fallback);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function subtitleWords(value: unknown): NfSubtitleWord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const words = value
    .map((item) => {
      const object = asRecord(item);
      const text = stringValue(object.text);
      const start = numberValue(object.start_ms);
      const end = numberValue(object.end_ms);
      return text && start !== undefined && end !== undefined && end >= start
        ? { text, start_ms: start, end_ms: end }
        : undefined;
    })
    .filter((word): word is NfSubtitleWord => word !== undefined);
  return words.length > 0 ? words : undefined;
}

function ttsSpec(value: unknown): NfTtsSpec | undefined {
  const object = asRecord(value);
  if (Object.keys(object).length === 0) return undefined;
  const spec: NfTtsSpec = {
    text: stringValue(object.text),
    voice: stringValue(object.voice),
    backend: stringValue(object.backend),
    rate: stringValue(object.rate),
    audio_clip: stringValue(object.audio_clip),
  };
  return Object.values(spec).some((item) => item !== undefined) ? spec : undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePosition(value: unknown): { x: number; y: number } {
  const object = asRecord(value);
  return {
    x: clampPercent(finiteNumber(object.x, 50)),
    y: clampPercent(finiteNumber(object.y, 50)),
  };
}

function clampPercent(value: number): number {
  return Math.min(95, Math.max(5, value));
}

export function seconds(value: number): string {
  return `${value.toFixed(1)}s`;
}

export function pct(value: number, duration: number): string {
  return `${(value / duration * 100).toFixed(2)}%`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

declare global {
  interface Window {
    ipc?: ShellIpc;
    webkit?: WebkitIpc;
    __NEXTFRAME_IPC_RESOLVE__?: (response: NfIpcResponse<unknown>) => void;
  }
}
