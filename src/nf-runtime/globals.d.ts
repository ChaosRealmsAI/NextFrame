// Global declarations for nf-runtime browser environment
// These functions/classes are exposed via script tags in index.html

// Core framework
declare function h(tag: string, attrs?: any, ...children: any[]): any;
declare function escapeHtml(s: string): string;
declare function escapeJsString(s: string): string;
declare class Component { constructor(props?: any); state: any; setState(s: any): void; render(): any; mount(el: Element): void; }
declare function createMarkupNode(html: string): Node;

// IPC bridge
declare function bridgeCall(method: string, params?: any): Promise<any>;

// Navigation
declare function showView(name: string, data?: any): void;
declare function toNfdataUrl(path: string): string;

// Views & components
declare const HomeView: any;
declare const Topbar: any;
declare const TransportControls: any;
declare const SettingsPanel: any;
declare const Modal: any;
declare const NewProjectModal: any;
declare const AIPromptsModal: any;

// Project/episode helpers
declare function getCurrentProjectRef(): any;
declare function getCurrentEpisodeRef(): any;
declare function loadProjects(): Promise<void>;
declare function loadEpisodes(projectName: string): Promise<void>;
declare function loadEditorTimeline(): Promise<void>;
declare function renderProjectEpisodes(): void;

// Editor
declare let edSceneBundleScript: string;
declare let edSceneBundleUrl: string;
declare function renderEditorClipList(): void;
declare function renderEditorInspector(): void;
declare function renderEditorTimeline(): void;

// Pipeline state
declare let pipelineSegments: any[];
declare let pipelineAudioState: any;
declare let pipelineAudioStage: string;
declare let pipelineExportState: any;
declare let pipelinePreviewState: any;
declare let pipelineRenderEntries: any[];

// Pipeline tabs
declare function renderScriptTab(): void;
declare function renderClipsTab(): void;
declare function renderAudioTab(): void;
declare function renderOutputTab(): void;

// Pipeline helpers
declare function loadPipelineData(): Promise<void>;
declare function loadPipelineClipsData(): Promise<void>;
declare function loadSmartClips(): Promise<void>;
declare function startPipelineExport(opts?: any): Promise<void>;
declare function cancelPipelineExport(): void;
declare function scheduleExportPolling(): void;
declare function stopExportPolling(): void;
declare function pollExportStatus(): Promise<void>;

// Audio/TTS
declare function generateTTS(text: string, opts?: any): Promise<any>;
declare function playSegmentAudio(seg: any): void;
declare function playKaraokeAudio(seg: any): void;
declare function toggleKaraokeAudio(): void;
declare function saveNarration(seg: any, data: any): Promise<void>;
declare function previewSegmentVideo(seg: any): void;
declare function scrollToSegment(id: string): void;

// Formatters
declare function formatClock(seconds: number): string;
declare function formatTimecode(seconds: number): string;
declare function formatBytes(bytes: number): string;
declare function formatResolution(w: number, h: number): string;
declare function formatExportEta(state: any): string;
declare function formatExportPercent(state: any): string;
declare function formatSourceTitle(source: any): string;
declare function humanizeSlug(slug: string): string;
declare function langLabel(code: string): string;
declare function stringifyMeta(meta: any): string;

// Source/segment helpers
declare function artifactDir(): string;
declare function normalizeSegmentPreviewParams(seg: any): any;
declare function fallbackSegmentPreviewParams(seg: any): any;
