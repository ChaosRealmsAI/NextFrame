// Global declarations for nf-runtime browser environment.
// Functions and classes are exposed via script tags in index.html.

// ── Shared data shapes ────────────────────────────────────────────────────────

interface NfLayer {
  id?: string;
  scene?: string;
  start: number;
  dur?: number;
  duration?: number;
  params?: Record<string, unknown>;
  blend?: string;
  src?: string;
  [key: string]: unknown;
}

interface NfTimeline {
  layers?: NfLayer[];
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
  project?: { width?: number; height?: number; fps?: number };
  [key: string]: unknown;
}

interface NfProject {
  name: string;
  width?: number;
  height?: number;
  fps?: number;
  createdAt?: string;
  [key: string]: unknown;
}

interface NfEpisode {
  name: string;
  project?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface NfSegment {
  id: string;
  text?: string;
  narration?: string;
  start?: number;
  end?: number;
  duration?: number;
  language?: string;
  model?: string;
  previousTranscript?: string;
  audio?: string;
  video?: string;
  cn?: string[];
  narrationUrl?: string;
  segment?: number;
  [key: string]: unknown;
}

interface NfSource {
  id?: string;
  path?: string;
  durationSec?: number;
  durationLabel?: string;
  title?: string;
  fileName?: string;
  formatLabel?: string;
  meta?: Record<string, unknown>;
  clips?: NfSmartClip[];
  [key: string]: unknown;
}

interface NfSmartClip {
  index?: number;
  title?: string;
  why?: string;
  sentenceRange?: string;
  timecodeLabel?: string;
  durationSec?: number;
  sizeLabel?: string;
  fileName?: string;
  path?: string;
  textPreview?: string;
  sentences?: NfSentence[];
  [key: string]: unknown;
}

interface NfSentence {
  startSec?: number;
  durationSec?: number;
  text?: string;
  [key: string]: unknown;
}

interface NfBridgeError {
  code: string;
  message: string;
  hint?: string;
}

type NfBridgeResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: NfBridgeError };

// ── PreviewEngine ─────────────────────────────────────────────────────────────

interface NfPreviewState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

interface NfPreviewEngine {
  onStateChange?: ((state: NfPreviewState) => void) | null;
  onSelect?: ((selection: { index: number }) => void) | null;
  loadTimeline(timeline: NfTimeline): void;
  compose(t: number): void;
  setStage(stage: HTMLElement | null): void;
  select(index: number): void;
  getState(): NfPreviewState;
  play?(): void;
  pause?(): void;
  toggle?(): void;
  seek?(t: number): void;
}

// ── Store class ───────────────────────────────────────────────────────────────

interface NfStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  on(key: string, handler: (value: unknown) => void): () => void;
}

declare class Store {
  constructor(initial?: Record<string, unknown>);
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  on(key: string, handler: (value: unknown) => void): () => void;
}

// ── Core framework ────────────────────────────────────────────────────────────

declare function h(tag: string, attrs?: Record<string, unknown> | null, ...children: (string | Node | null | undefined)[]): HTMLElement;
declare function escapeHtml(s: string): string;
declare function escapeJsString(s: string): string;
declare class Component {
  constructor(props?: Record<string, unknown>);
  props: Record<string, unknown>;
  state: Record<string, unknown>;
  children: Component[];
  el: HTMLElement | null;
  setState(s: Record<string, unknown>): void;
  render(): HTMLElement | string;
  mount(el: HTMLElement): void;
  update(newProps: Record<string, unknown>): void;
  destroy(): void;
  didMount(): void;
  willUnmount(): void;
  destroyChildren(): void;
}
declare function createMarkupNode(html: string): Node;

// ── IPC bridge ────────────────────────────────────────────────────────────────

declare function bridgeCall<T = unknown>(method: string, params?: Record<string, unknown>): Promise<NfBridgeResult<T>>;

// ── Navigation ────────────────────────────────────────────────────────────────

declare function showView(name: string, data?: Record<string, unknown>): void;
declare function toNfdataUrl(path: string): string;

// ── Views & components ────────────────────────────────────────────────────────

declare const HomeView: typeof Component;
declare const Topbar: typeof Component;
declare const TransportControls: typeof Component;
declare const SettingsPanel: typeof Component;
declare const Modal: typeof Component;
declare const NewProjectModal: typeof Component;

// ── Project/episode helpers ───────────────────────────────────────────────────

declare function getCurrentProjectRef(): string;
declare function getCurrentEpisodeRef(): string;
declare function loadProjects(): void;
declare function loadEpisodes(): void;
declare function loadEditorTimeline(): Promise<unknown>;
declare function renderProjectEpisodes(): void;

// ── Editor ────────────────────────────────────────────────────────────────────

declare let edSceneBundleScript: HTMLScriptElement | null;
declare let edSceneBundleUrl: string;
declare function renderEditorClipList(): void;
declare function renderEditorInspector(): void;
declare function renderEditorTimeline(): void;
declare function getEditorTimelineDuration(): number;
declare function updateEditorPreviewState(currentTime: number, totalDuration: number): void;
declare function showEditorEmpty(message?: string): void;
declare function renderEditorFromTimeline(timeline: NfTimeline): void;
declare function handleTimelineTrackClick(event: MouseEvent): void;
declare function formatEditorTimecode(seconds: number): string;
declare function edSelectClip(index: number): void;
declare function sendPreviewCmd(cmd: string, time?: number): void;
declare function bindPreviewStateSource(): void;
declare function syncPreviewTransportState(state: Record<string, unknown> | NfPreviewState): void;
declare function updatePlayButton(playing: boolean): void;

// ── Pipeline audio types ──────────────────────────────────────────────────────

interface NfAudioStage {
  voice?: string;
  speed?: number;
  engine?: string;
  [key: string]: unknown;
}

interface NfAudioStateEntry {
  exists: boolean;
  mp3?: string;
  timelineData?: unknown;
  srt?: string;
  [key: string]: unknown;
}

interface NfExportState {
  status?: string;
  progress?: number;
  eta?: number;
  error?: string;
  outputPath?: string;
  [key: string]: unknown;
}

interface NfPipelineScriptSegment {
  text?: string;
  segments?: NfSegment[];
  [key: string]: unknown;
}

// ── Pipeline state ────────────────────────────────────────────────────────────

declare let pipelineSegments: NfSegment[];
declare let pipelineAudioState: Record<number, NfAudioStateEntry | null>;
declare let pipelineAudioStage: NfAudioStage;
declare let pipelineExportState: NfExportState | null;
declare let pipelinePreviewState: Record<string, unknown>;
declare let pipelineRenderEntries: Record<string, unknown>[];

// ── Pipeline tabs ─────────────────────────────────────────────────────────────

declare function renderScriptTab(segments?: NfSegment[]): void;
declare function renderClipsTab(data?: Record<string, unknown>): void;
declare function renderAudioTab(segments?: unknown[]): void;
declare function renderOutputTab(entries?: Record<string, unknown>[]): void;
declare function renderAtomsTab(scenes: unknown[]): void;
declare function renderCard(segment: NfSegment): string;

// ── Pipeline helpers ──────────────────────────────────────────────────────────

declare function loadPipelineData(): void;
declare function loadPipelineClipsData(opts?: Record<string, unknown>): void;
declare function loadSmartClips(): Promise<void>;
declare function startPipelineExport(): void;
declare function cancelPipelineExport(): void;
declare function scheduleExportPolling(delayMs?: number): void;
declare function stopExportPolling(): void;
declare function pollExportStatus(): void;

// ── Audio/TTS ─────────────────────────────────────────────────────────────────

declare function generateTTS(segmentNumber: number): void;
declare function playSegmentAudio(mp3Path: string): void;
declare function playKaraokeAudio(segmentNumber: number): void;
declare function toggleKaraokeAudio(segmentNumber?: number): void;
declare function saveNarration(seg: NfSegment, data: Record<string, unknown>): Promise<void>;
declare function previewSegmentVideo(seg: NfSegment): void;
declare function scrollToSegment(id: string): void;

// ── Formatters ────────────────────────────────────────────────────────────────

declare function formatClock(seconds: number, showMillis?: boolean): string;
declare function formatTimecode(seconds: number): string;
declare function formatBytes(bytes: number): string;
declare function formatResolution(w: number, h: number): string;
declare function formatExportEta(eta: unknown): string;
declare function formatExportPercent(percent: unknown): string;
declare function formatSourceTitle(source: NfSource, index?: number): string;
declare function humanizeSlug(slug: string): string;
declare function langLabel(code: string): string;
declare function stringifyMeta(meta: unknown): string;
declare function timeAgo(dateStr: string): string;

// ── Source/segment helpers ────────────────────────────────────────────────────

declare function artifactDir(): string;
declare function normalizeSegmentPreviewParams(segmentName: string): Record<string, unknown>;
declare function fallbackSegmentPreviewParams(segmentName: string): Record<string, unknown>;

// ── Navigation helpers ────────────────────────────────────────────────────────

declare function openEpisode(project: string, episode: string): void;
declare function createProject(): void;
declare function createEpisode(): void;
declare function getProjectNameFromPath(): string;
declare function getEpisodeNameFromPath(): string;

// ── UI helpers ────────────────────────────────────────────────────────────────

declare function toggleSettings(): void;
declare function toggleNewProject(): void;
declare function toggleSelect(trigger: HTMLElement): void;
declare function pickOption(option: HTMLElement): void;
declare function pickRatio(card: HTMLElement, ratio: string): void;
declare function switchTab(tab: string): void;
declare function switchTabByStage(stage: string): void;
declare function composePreview(): void;
declare function previewFrame(t: number): void;

// ── Source clip helpers ───────────────────────────────────────────────────────

declare function scOpenClipSentence(clipIndex: number, sentenceIndex: number): void;
declare function scOpenMeta(index: number): void;
declare function scCloseMeta(): void;
declare function scOpenPlayer(index: number, seekSec?: number): void;
declare function scClosePlayer(): void;
declare function scOpenSourcePlayer(seekSec?: number): void;
declare function scHandleMetaOverlay(event: MouseEvent): void;
declare function scHandlePlayerOverlay(event: MouseEvent): void;
declare function scSelectSource(index: number): void;

// ── Stage/tab maps ────────────────────────────────────────────────────────────

declare const STAGE_TO_TAB: Record<string, string>;

// ── Window interface extension ────────────────────────────────────────────────

interface Window {
  // Preview engine instance set by preview-engine.ts
  previewEngine: NfPreviewEngine | undefined;

  // Scene registry (populated by scene-bundle script)
  __scenes: Record<string, unknown>;

  // Editor preview mode
  edPreviewMode: string | undefined;

  // Component and Store class
  Component: typeof Component;
  Store: typeof Store;
  __nfStore: NfStore | undefined;

  // State/diagnostics
  __nfState: (() => NfPreviewState) | undefined;
  __nfDiagnose: (() => string) | undefined;
  __nfEditorDiagnose: (() => string) | undefined;

  // App entry points (attached for --eval-script access)
  __nfHomeView: (Component & { setProjects?(projects: unknown[]): void; setSearch?(value: string): void }) | undefined;
  __nfNewProjectModal: (Component & { setRatio?(ratio: string): void; createProject?(): void; toggle?(): void }) | undefined;
  __NEXTFRAME_ENGINE: NfPreviewEngine | undefined;
  __NEXTFRAME_READY: boolean | undefined;
  __onFrame: ((t: number) => void) | undefined;
  __nfPlay: (() => void) | undefined;
  __nfPause: (() => void) | undefined;
  __nfSeek: ((t: number) => void) | undefined;
  __nfToggle: (() => void) | undefined;

  // All declared globals are also accessible via window.*
  h: typeof h;
  escapeHtml: typeof escapeHtml;
  escapeJsString: typeof escapeJsString;
  createMarkupNode: typeof createMarkupNode;
  bridgeCall: typeof bridgeCall;
  showView: typeof showView;
  toNfdataUrl: typeof toNfdataUrl;
  formatClock: typeof formatClock;
  formatTimecode: typeof formatTimecode;
  formatBytes: typeof formatBytes;
  formatResolution: typeof formatResolution;
  formatExportEta: typeof formatExportEta;
  formatExportPercent: typeof formatExportPercent;
  formatSourceTitle: typeof formatSourceTitle;
  humanizeSlug: typeof humanizeSlug;
  langLabel: typeof langLabel;
  stringifyMeta: typeof stringifyMeta;
  timeAgo: typeof timeAgo;
  getCurrentProjectRef: typeof getCurrentProjectRef;
  getCurrentEpisodeRef: typeof getCurrentEpisodeRef;
  loadProjects: typeof loadProjects;
  loadEpisodes: typeof loadEpisodes;
  loadEditorTimeline: typeof loadEditorTimeline;
  renderProjectEpisodes: typeof renderProjectEpisodes;
  edSceneBundleScript: typeof edSceneBundleScript;
  edSceneBundleUrl: typeof edSceneBundleUrl;
  renderEditorClipList: typeof renderEditorClipList;
  renderEditorInspector: typeof renderEditorInspector;
  renderEditorTimeline: typeof renderEditorTimeline;
  getEditorTimelineDuration: typeof getEditorTimelineDuration;
  updateEditorPreviewState: typeof updateEditorPreviewState;
  showEditorEmpty: typeof showEditorEmpty;
  renderEditorFromTimeline: typeof renderEditorFromTimeline;
  handleTimelineTrackClick: typeof handleTimelineTrackClick;
  formatEditorTimecode: typeof formatEditorTimecode;
  edSelectClip: typeof edSelectClip;
  sendPreviewCmd: typeof sendPreviewCmd;
  bindPreviewStateSource: typeof bindPreviewStateSource;
  syncPreviewTransportState: typeof syncPreviewTransportState;
  updatePlayButton: typeof updatePlayButton;
  pipelineSegments: typeof pipelineSegments;
  pipelineAudioState: typeof pipelineAudioState;
  pipelineAudioStage: typeof pipelineAudioStage;
  pipelineExportState: typeof pipelineExportState;
  pipelinePreviewState: typeof pipelinePreviewState;
  pipelineRenderEntries: typeof pipelineRenderEntries;
  renderScriptTab: typeof renderScriptTab;
  renderClipsTab: typeof renderClipsTab;
  renderAudioTab: typeof renderAudioTab;
  renderOutputTab: typeof renderOutputTab;
  renderAtomsTab: typeof renderAtomsTab;
  renderCard: typeof renderCard;
  loadPipelineData: typeof loadPipelineData;
  loadPipelineClipsData: typeof loadPipelineClipsData;
  loadSmartClips: typeof loadSmartClips;
  startPipelineExport: typeof startPipelineExport;
  cancelPipelineExport: typeof cancelPipelineExport;
  scheduleExportPolling: typeof scheduleExportPolling;
  stopExportPolling: typeof stopExportPolling;
  pollExportStatus: typeof pollExportStatus;
  generateTTS: typeof generateTTS;
  playSegmentAudio: typeof playSegmentAudio;
  playKaraokeAudio: typeof playKaraokeAudio;
  toggleKaraokeAudio: typeof toggleKaraokeAudio;
  saveNarration: typeof saveNarration;
  previewSegmentVideo: typeof previewSegmentVideo;
  scrollToSegment: typeof scrollToSegment;
  artifactDir: typeof artifactDir;
  normalizeSegmentPreviewParams: typeof normalizeSegmentPreviewParams;
  fallbackSegmentPreviewParams: typeof fallbackSegmentPreviewParams;
  openEpisode: typeof openEpisode;
  createProject: typeof createProject;
  createEpisode: typeof createEpisode;
  getProjectNameFromPath: typeof getProjectNameFromPath;
  getEpisodeNameFromPath: typeof getEpisodeNameFromPath;
  toggleSettings: typeof toggleSettings;
  toggleNewProject: typeof toggleNewProject;
  toggleSelect: typeof toggleSelect;
  pickOption: typeof pickOption;
  pickRatio: typeof pickRatio;
  switchTab: typeof switchTab;
  switchTabByStage: typeof switchTabByStage;
  composePreview: typeof composePreview;
  previewFrame: typeof previewFrame;
  scOpenClipSentence: typeof scOpenClipSentence;
  scOpenMeta: typeof scOpenMeta;
  scCloseMeta: typeof scCloseMeta;
  scOpenPlayer: typeof scOpenPlayer;
  scClosePlayer: typeof scClosePlayer;
  scOpenSourcePlayer: typeof scOpenSourcePlayer;
  scHandleMetaOverlay: typeof scHandleMetaOverlay;
  scHandlePlayerOverlay: typeof scHandlePlayerOverlay;
  scSelectSource: typeof scSelectSource;
  STAGE_TO_TAB: typeof STAGE_TO_TAB;
  HomeView: typeof HomeView;
  Topbar: typeof Topbar;
  TransportControls: typeof TransportControls;
  SettingsPanel: typeof SettingsPanel;
  Modal: typeof Modal;
  NewProjectModal: typeof NewProjectModal;
  currentProjectName: string;
  currentProjectPath: string;
  currentEpisodeName: string;
  currentEpisodePath: string;
}
