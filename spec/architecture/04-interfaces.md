# 04 · 接口契约

所有公开接口以 v0.1.0 代码为准。这里记录 timeline、AI tools、CLI 和 render flags 的稳定表面。

## Timeline JSON

```ts
type Timeline = {
  schema: "nextframe/v0.1";
  duration: number;
  background?: string;
  project: {
    width: number;
    height: number;
    aspectRatio?: number;
    fps: number;
  };
  chapters?: Chapter[];
  markers?: Marker[];
  tracks: Track[];
  assets?: Asset[];
};

type Chapter = {
  id: string;
  name?: string;
  start: TimeValue;
  end: TimeValue;
};

type Marker = {
  id: string;
  name?: string;
  t: TimeValue;
};

type Track = {
  id: string;
  name?: string;
  kind: "video" | "audio";
  muted?: boolean;
  locked?: boolean;
  clips: Clip[];
};

type Clip = {
  id: string;
  start: TimeValue;
  dur: TimeValue;
  scene: string;
  params?: Record<string, any>;
  blend?: string;
  label?: string;
  note?: string;
};

type Asset = {
  id: string;
  path: string;
  kind: "image" | "audio" | "video" | "subtitle" | "font";
  metadata?: Record<string, any>;
};
```

## SymbolicTime

```ts
type TimeValue = number | TimeExpression;

type TimeExpression =
  | { at: string }
  | { after: string; gap?: number }
  | { before: string; gap?: number }
  | { sync: string }
  | { until: string }
  | { offset: string; by: number };
```

解析规则：
- `resolveTimeline()` / `resolveExpression()` 负责解析
- 解析后量化到 `0.1s`
- dangling ref / cycle / range overflow 返回结构化错误

## Engine surface

```ts
renderAt(timeline, t, opts?) -> { ok, canvas?, value?, error? }
validateTimeline(timeline, opts?) -> { ok, error?, errors[], warnings[], hints[], resolved? }
resolveTimeline(timeline) -> { ok, value?, lookup?, error? }
resolveExpression(expr, lookup, duration) -> { ok, value?, error? }
describeAt(timeline, t, viewport?) -> { ok, value?, error? }
renderGantt(timeline) -> string
pngToAscii(buffer, width?, height?) -> string
```

## Scene surface

每个 scene 在 registry 中必须满足：

```ts
{
  id: string,
  render: (t, params, ctx, globalT?) => void,
  describe: (t, params, viewport?) => ClipDescription,
  META: {
    id: string,
    category: string,
    description: string,
    duration_hint: number,
    params: ParamSpec[],
    ai_prompt_example?: string
  }
}
```

v0.1 public categories：
- `Backgrounds`
- `Typography`
- `Shapes`
- `Data Viz`
- `Overlays`
- `Series`
- `Browser`

Registry 内另有隐藏 `Media` 类别：`imageHero`。

## AI Tool Surface（12 tools）

```ts
list_scenes() -> { ok, value: SceneMeta[] }
get_scene_meta({id}) -> { ok, value: SceneMeta } | { ok:false, error }
validate_timeline({timeline}) -> { ok, value: ValidationReport }
resolve_time({timeline, expr}) -> { ok, value: number } | { ok:false, error }
describe_frame({timeline, t}) -> { ok, value: FrameDescription } | { ok:false, error }
find_clips({timeline, scene?, track?, at?, param?}) -> { ok, value: ClipMatch[] }
get_clip({timeline, clipId}) -> { ok, value: ClipDetails } | { ok:false, error }
apply_patch({timeline, ops}) -> { ok, value: {timeline, validation, applied} } | { ok:false, error }
assert_at({timeline, t, checks}) -> { ok, value: {t, passed, failed, total} } | { ok:false, error }
render_ascii({timeline, t, width?}) -> { ok, value: string } | { ok:false, error }
gantt_ascii({timeline, width?}) -> { ok, value: string } | { ok:false, error }
suggest_clip_at({timeline, t}) -> { ok, value: ActiveClipRef[] } | { ok:false, error }
```

新增并已实现的工具：
- `find_clips`
- `get_clip`
- `apply_patch`
- `assert_at`
- `render_ascii`

## CLI（25 subcommands）

| 命令 | 用途 |
|---|---|
| `new <out.json>` | 创建空 timeline |
| `validate <timeline.json>` | 跑 safety gates |
| `frame <timeline.json> <t> <out.png>` | 输出单帧 PNG |
| `render <timeline.json> <out.mp4>` | 导出 MP4 |
| `probe <file.mp4>` | 用 ffprobe 检查导出 |
| `describe <timeline.json> <t>` | 输出结构化帧描述 |
| `gantt <timeline.json>` | ASCII gantt |
| `ascii <timeline.json> <t>` | ASCII 单帧预览 |
| `scenes` | 列 public scene META |
| `guide` | AI onboarding 入口 |
| `bake-html <timeline.json>` | 预烘焙 `htmlSlide` |
| `bake-browser <timeline.json>` | 预烘焙 browser scenes |
| `bake-video <timeline.json>` | 预提取 `videoClip` 帧 |
| `add-clip` | 添加 clip |
| `move-clip` | 移动 clip |
| `resize-clip` | 修改 clip duration |
| `remove-clip` | 删除 clip |
| `set-param` | 更新 params |
| `add-marker` | 添加 marker |
| `list-clips` | 列 clip |
| `dup-clip` | 复制 clip |
| `import-image` | 添加 image asset |
| `import-audio` | 添加 audio asset |
| `list-assets` | 列 asset |
| `remove-asset` | 删除 asset |

## Render flags

`nextframe render` 当前支持：

| flag | 含义 |
|---|---|
| `--json` | 结构化输出 |
| `--fps=<N>` | 覆盖输出 fps |
| `--audio=<path>` | 在导出后 mux 外部音频 |
| `--crf=<0..51>` | libx264 质量参数 |
| `--target=ffmpeg` | 选择视频导出目标，v0.1 仅支持 `ffmpeg` |

`nextframe frame` / `bake-browser` 额外支持：
- `--width`
- `--height`

## Probe command

`nextframe probe <file.mp4> [--json]` 返回：

```ts
{
  path: string,
  format: string | null,
  duration: number,
  size: number,
  video: { codec, width, height, fps } | null,
  audio: { codec, sample_rate, channels } | null,
  streams: number
}
```

## Error contract

所有公共路径都应返回：

```ts
{ ok: true, value?: any }
{ ok: false, error: { code: string, message: string, hint?: string, ref?: string } }
```

CLI exit code：
- `0` success
- `1` warning
- `2` error
- `3` usage
