# Step 04 · 写 v0.8 Timeline JSON

**写 timeline 前必须查 scene 参数名**（不能猜）：

```bash
node src/nf-cli/bin/nextframe.js scenes <scene-id>
```

## 1 · 顶层结构（硬规则）

```json
{
  "version": "0.8",        ← 必填 "0.8"（字符串），缺了 build 会走 legacy 路径
  "anchors": { ... },
  "tracks": [ ... ]
}
```

**`version: "0.8"` 缺失** → detectFormat 当 v0.3 处理 → anchors 不解析 → 硬崩。

## 2 · 4 种 track kind

- **`scene`** — 显示 scene 组件
- **`audio`** — 播放音频
- **`subtitle`** — 字幕
- **`animation`** — 驱动某 clip 的 params 随时间变化

## 3 · 完整 Mini Timeline（1 scene track · 1 audio track · 1 subtitle track · 3 sentence）

```json
{
  "version": "0.8",
  "anchors": {
    "s0.begin": { "at": 0 },
    "s0.end":   { "src": "whisper", "path": "tmp/audio/seg-01.words.json", "word": -1 },
    "s1.begin": { "src": "whisper", "path": "tmp/audio/seg-02.words.json", "word": 0 },
    "s1.end":   { "src": "whisper", "path": "tmp/audio/seg-02.words.json", "word": -1 },
    "s2.begin": { "src": "whisper", "path": "tmp/audio/seg-03.words.json", "word": 0 },
    "s2.end":   { "src": "whisper", "path": "tmp/audio/seg-03.words.json", "word": -1 }
  },
  "tracks": [
    {
      "id": "scene-main", "kind": "scene",
      "clips": [
        { "id": "sc-0", "begin": "s0.begin", "end": "s0.end",
          "scene": "heroTitle",
          "params": { "title": "NextFrame", "subtitle": "JSON → MP4" },
          "effects": { "enter": { "type": "fadeIn", "dur": 0.6 } } },
        { "id": "sc-1", "begin": "s1.begin", "end": "s1.end",
          "scene": "featureCard",
          "params": { "title": "一行 JSON，一个视频" },
          "effects": { "enter": { "type": "slideUp", "dur": 0.7 } },
          "transition": { "type": "fade", "dur": 0.3 } },
        { "id": "sc-2", "begin": "s2.begin", "end": "s2.end",
          "scene": "heroTitle",
          "params": { "title": "开源", "subtitle": "github.com/..." },
          "effects": { "enter": { "type": "fadeIn", "dur": 0.5 } } }
      ]
    },
    {
      "id": "audio-main", "kind": "audio",
      "clips": [
        { "id": "au-0", "begin": "s0.begin", "end": "s0.end", "src": "tmp/audio/seg-01.mp3" },
        { "id": "au-1", "begin": "s1.begin", "end": "s1.end", "src": "tmp/audio/seg-02.mp3" },
        { "id": "au-2", "begin": "s2.begin", "end": "s2.end", "src": "tmp/audio/seg-03.mp3" }
      ]
    },
    {
      "id": "sub-main", "kind": "subtitle",
      "clips": [
        { "id": "sub-0", "begin": "s0.begin", "end": "s0.end", "text": "NextFrame 用 JSON 做视频" },
        { "id": "sub-1", "begin": "s1.begin", "end": "s1.end", "text": "一行命令，输出 MP4" },
        { "id": "sub-2", "begin": "s2.begin", "end": "s2.end", "text": "开源免费" }
      ]
    }
  ]
}
```

## 4 · 可用 effect / transition type

- **effects.enter / exit**: `fadeIn` `fadeOut` `slideUp` `slideDown` `slideLeft` `slideRight` `scaleIn` `scaleOut` `blurIn` `blurOut` `bounceIn` `springIn` `springOut` `wipeReveal`
- **transition**: `fade` `dissolve` `wipe`

## 5 · animation track（driving params）

```json
{
  "id": "anim-title", "kind": "animation",
  "target": "scene-main.clips[0].params.opacity",
  "clips": [
    { "at": "s0.begin", "value": 0 },
    { "at": "s0.begin+500ms", "value": 1, "ease": "cubic-bezier(0.16,1,0.3,1)" }
  ]
}
```

## 6 · 写 timeline 硬规则

- ✅ 顶层 `version: "0.8"`（字符串）
- ✅ 所有时间点用 anchor 名字引用，**不写裸数字**
- ✅ scene clip 参数名先 `nextframe scenes <id>` 查
- ✅ 每个 scene clip 建议加 `effects.enter`（否则硬切不专业）
- ❌ 禁 `matches`（v0.6 格式）
- ❌ 禁 `layers`（v0.3 格式）
- ❌ 禁 `start` / `dur` 裸数字字段

## 7 · 保存位置

```
projects/v10-landscape/timeline.v08.json     ← 横屏
projects/v10-portrait/timeline.v08.json      ← 竖屏
```

## 下一步

```bash
cargo run -p nf-guide -- produce validate
```
