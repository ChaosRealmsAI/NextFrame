# 04 · 接口契约

所有跨层 / 跨模块的 API 完整签名。改这些 = bump major schema。

---

## Timeline JSON Schema

```typescript
type Timeline = {
  schema: "nextframe/v0.1";        // version
  duration: number;                 // raw seconds, locked
  background: string;               // hex color
  project: {
    width: number;                  // 1920
    height: number;                 // 1080
    aspectRatio: number;            // 16/9
    fps: number;                    // 30
  };
  chapters?: Chapter[];             // 命名时间段
  markers?: Marker[];               // 命名时间点
  tracks: Track[];
  assets?: Asset[];                 // 引用的外部资源
};

type Chapter = {
  id: string;                       // unique within timeline
  name?: string;                    // human label
  start: TimeValue;                 // raw or symbolic
  end: TimeValue;
};

type Marker = {
  id: string;
  name?: string;
  t: TimeValue;
};

type Track = {
  id: string;                       // 'v1', 'v2', 'a1' 等 stable
  name?: string;
  kind: "video" | "audio";
  muted?: boolean;
  locked?: boolean;
  clips: Clip[];
};

type Clip = {
  id: string;                       // stable, AI 引用用
  start: TimeValue;
  dur: TimeValue;
  scene: string;                    // sceneId
  params?: Record<string, ParamValue>;
  label?: string;                   // user color label
  note?: string;                    // user free text
};

type ParamValue = string | number | boolean | { keyframes: Keyframe[] };

type Keyframe = {
  t: TimeValue;
  value: number | string;
  ease?: "linear" | "ease-out" | "ease-in" | "bezier";
};

type Asset = {
  id: string;
  path: string;                     // sandboxed
  kind: "video" | "audio" | "image" | "subtitle" | "font";
  metadata?: Record<string, any>;
};
```

---

## SymbolicTime

```typescript
type TimeValue = number | TimeExpression;

type TimeExpression =
  | { at: string }                          // 'project-start' | 'project-end' | 'chapter-X' | 'chapter-X.start' | 'chapter-X.end' | 'marker-Y' | 'clip-Z' | 'clip-Z.start' | 'clip-Z.end'
  | { after: string; gap?: number }         // after some clip/marker, optional positive gap in seconds
  | { before: string; gap?: number }        // before some clip/marker, optional positive gap in seconds
  | { sync: string }                        // alias of at, semantic-clear for "synced to subtitle/cue"
  | { until: string }                       // ends at the named anchor
  | { offset: string; by: number }          // raw offset from anchor
  ;
```

**Rules**：
- Resolve 顺序：build dep graph → topo sort → quantize 0.1s
- Cycle detection on resolve
- Reference must exist (chapter id / marker id / clip id)
- After resolve, all values are positive numbers in `[0, timeline.duration]`

---

## Engine API (L2)

```typescript
// engine/index.js

export function renderAt(
  target: RenderTarget,
  timeline: Timeline,
  t: number  // raw seconds, after resolve
): void;

export function validateTimeline(
  timeline: unknown
): {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  hints: AIHint[];
};

export function resolveTimeline(timeline: Timeline): Timeline;
// All TimeValues become numbers.

export function describeFrame(
  timeline: Timeline,
  t: number
): FrameDescription;

export function renderGantt(timeline: Timeline): string;  // ASCII

export function pngToAscii(buffer: Buffer, width = 80): string;
```

```typescript
type ValidationError = {
  code: string;          // 'CLIP_OVERLAP' | 'TIME_OUT_OF_RANGE' | 'MISSING_ASSET' | ...
  message: string;
  path?: string;         // JSON path
  ref?: string;          // clipId / chapterId etc
  hint?: string;         // AI fix suggestion
};

type FrameDescription = {
  t: number;
  chapter: string | null;
  active_clips: ClipDescription[];
};

type ClipDescription = {
  clipId: string;
  sceneId: string;
  phase: "enter" | "hold" | "exit";
  progress: number;       // 0..1 within phase
  elements: SceneElement[];
  boundingBox?: BoundingBox;
};

type SceneElement = {
  id: string;
  type: "text" | "rect" | "circle" | "image" | "line" | "shape";
  visible: boolean;
  opacity: number;
  // Type-specific:
  content?: string;       // text
  fontSize?: number;
  fontFamily?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fill?: string;
  stroke?: string;
};
```

---

## Scene API (L2)

每个 scene 文件必须 export 3 件事：

```typescript
// 1. Render function
export function {sceneName}(
  t: number,            // local clip time, seconds
  params: object,       // user-provided
  ctx: CanvasRenderingContext2D | similar,
  globalT?: number      // optional global timeline time
): void;

// 2. Describe function
export function describe(
  t: number,
  params: object,
  viewport: { width: number; height: number }
): ClipDescription;

// 3. Metadata
export const META: {
  id: string;
  category: "Backgrounds" | "Typography" | "Shapes" | "Data Viz" | "Transitions" | "Overlays" | "Audio";
  description: string;
  duration_hint: number;
  params: ParamMeta[];
  ai_prompt_example?: string;
};

type ParamMeta = {
  name: string;
  type: "string" | "number" | "boolean" | "color" | "enum";
  required?: boolean;
  default?: any;
  range?: [number, number];
  options?: any[];        // for enum
  semantic: string;       // for AI: what does this mean?
};
```

---

## Timeline Ops API (L2)

```typescript
// engine/timeline/ops.js — all pure functions

export function addClip(
  timeline: Timeline,
  trackId: string,
  clip: Clip
): { ok: boolean; value?: Timeline; error?: ValidationError };

export function removeClip(timeline, clipId): Result<Timeline>;
export function moveClip(timeline, clipId, newStart: TimeValue): Result<Timeline>;
export function setDur(timeline, clipId, newDur: TimeValue): Result<Timeline>;
export function setParam(timeline, clipId, key: string, value: any): Result<Timeline>;
export function splitClip(timeline, clipId, t: TimeValue): Result<Timeline>;
export function findClips(timeline, predicate: ClipPredicate): string[];
export function getClip(timeline, clipId): Clip | null;

type ClipPredicate = {
  sceneId?: string;
  trackId?: string;
  hasParam?: { key: string; value?: any };
  inChapter?: string;
  textContent?: string;  // search params for matching text
};

type Result<T> = { ok: true; value: T } | { ok: false; error: ValidationError };
```

---

## AI Tool Surface (L3)

详见 [06-ai-loop](./06-ai-loop.md)。简化版：

```typescript
// workflows/ai-tools.js

export function find_clips(timeline, predicate: ClipPredicate): string[];
export function get_clip(timeline, clipId: string): Clip | null;
export function describe_frame(timeline, t: TimeValue): FrameDescription;
export function apply_patch(timeline, patch: Patch): Result<Timeline>;
export function assert_at(
  timeline,
  t: TimeValue,
  predicate: AssertionDSL
): { pass: boolean; message: string };
export function render_ascii(timeline, t: TimeValue): string;
export function ascii_gantt(timeline): string;

type Patch =
  | { op: "addClip"; track: string; clip: Clip }
  | { op: "removeClip"; clipId: string }
  | { op: "moveClip"; clipId: string; start: TimeValue }
  | { op: "setDur"; clipId: string; dur: TimeValue }
  | { op: "setParam"; clipId: string; key: string; value: any }
  | { op: "splitClip"; clipId: string; t: TimeValue }
  | { op: "addMarker"; id: string; t: TimeValue }
  | { op: "addChapter"; id: string; start: TimeValue; end: TimeValue }
  ;

type AssertionDSL = string;
// Example: "clip-headline.opacity > 0.8"
// Example: "clip-headline.elements.title.visible == true"
// Example: "active_clips.length >= 2"
```

---

## CLI (L4)

```bash
nextframe new <project-path>
  # Create empty .nfproj at path

nextframe ai-edit <project> "<natural language prompt>"
  [--mode create|edit|fix]
  [--max-iter 5]
  # Calls workflows/ai-edit, applies all patches

nextframe set-dur <project> <clipId> <seconds>
nextframe move-clip <project> <clipId> <symbolicTime>
  # symbolicTime examples: "after:clip-x" / "at:marker-y" / "3.5"
nextframe set-param <project> <clipId> <key> <value>
nextframe split-clip <project> <clipId> <symbolicTime>

nextframe render <project> --t <symbolicTime> --out <png-path>
  [--width 1920] [--height 1080]
  [--target napi-canvas|wgpu|wasm]

nextframe export <project> --out <mp4-path>
  [--fps 30] [--target wgpu] [--audio]

nextframe serve <project>
  [--port 8765]
  # Hot-reload preview at http://localhost:8765

nextframe lint <project>
  [--strict]
  # Run all 6 safety gates

nextframe describe <project> --t <symbolicTime>
  [--json]
nextframe gantt <project>
nextframe ascii <project> --t <symbolicTime>

nextframe scenes
  [--json]
  # List all available scenes with META
```

**Common flags**:
- `--json` — output structured JSON for AI parsing
- `--quiet` — minimal output
- `--verbose` — debug info
- `--no-color` — strip ANSI

**Exit codes**:
- 0 — success
- 1 — lint warning (still completed)
- 2 — error (operation failed)
- 3 — usage error (bad args)

---

## Render Target Trait (L1)

```typescript
interface RenderTarget {
  width: number;
  height: number;
  draw(cmds: DrawCommand[]): void;
  readPixels(): Buffer;       // RGBA
  savePNG(path: string): Promise<void>;
  destroy(): void;
}

type DrawCommand =
  | { op: "fillRect"; x; y; w; h; color }
  | { op: "fillText"; x; y; text; font; color }
  | { op: "drawImage"; src; x; y; w; h }
  | { op: "beginPath" }
  | { op: "arc"; cx; cy; r; start; end }
  | { op: "fill"; color }
  | { op: "stroke"; color; width }
  | { op: "save" }
  | { op: "restore" }
  | { op: "translate"; x; y }
  | { op: "rotate"; rad }
  | { op: "scale"; x; y }
  | { op: "globalAlpha"; alpha }
  | { op: "compositeOp"; mode }
  ;
```

**注**：v0.1 不强制 DrawCommand 抽象层，scenes 直接调 ctx 方法（与 Canvas2D API 一致）。v0.2 想做 wgpu 共享时再加。

---

## File formats

### `.nfproj` (project file)

JSON document conforming to Timeline schema above. Plain text. UTF-8.

### Resource files

- Video: any ffmpeg-supported codec
- Audio: WAV / MP3 / AAC / FLAC
- Image: PNG / JPG / WebP
- Subtitle: SRT / VTT
- Font: TTF / OTF

All paths in `assets[].path` are sandboxed (no `..` escaping project dir or home dir, see [05-safety](./05-safety.md)).

---

## Backwards compatibility

Schema version in `timeline.schema` field. Engine refuses to load timeline with newer schema than it understands. Migrations live in `engine/migrations/{from}->{to}.js`.

v0.1 schema is `"nextframe/v0.1"`. v0.2 will be `"nextframe/v0.2"` etc.
