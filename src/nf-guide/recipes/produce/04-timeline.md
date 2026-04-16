# Step 04: 写 v0.8 Timeline JSON

**写 timeline 前必须查 scene 参数名**（不能猜！猜错 = 黑帧）：

```bash
nextframe scenes <scene-id>
```

## 哪些 scene 能用

**canvas 型（recorder 录制正常）**：headlineCenter, codeTerminal, darkGradient, voidField, liquidNoise, gridPulse, spaceField, progressBar16x9, subtitleBar, screenFilm, videoClip 等。

**DOM 型（anthropic-warm 主题的数据描述 scene）**：statBig, goldenClose, glossaryCard, analogyCard, slotGrid 等 — build 成功但 **recorder 录不出内容**（画面黑）。用 headlineCenter 替代。

> 经验法则：`nextframe scenes <id>` 看 tech 字段。`canvas` = 安全；`dom` = recorder 可能黑帧。

## v0.8 结构

```json
{
  "version": "0.8",
  "anchors": {},
  "tracks": []
}
```

`anchors` 是字典，`tracks` 是 4 类轨道：

- `audio`
- `scene`
- `subtitle`
- `animation`

## 最小示例

```json
{
  "version": "0.8",
  "anchors": {
    "seg0.begin": { "at": 0 },
    "seg0.end": { "at": 5000 },
    "seg0.sub.begin": { "at": 1200 },
    "seg0.sub.end": { "at": 3200 }
  },
  "tracks": [
    {
      "id": "audio-main",
      "kind": "audio",
      "clips": [
        {
          "id": "audio-0",
          "begin": "seg0.begin",
          "end": "seg0.end",
          "src": "./seg0.mp3"
        }
      ]
    },
    {
      "id": "scene-main",
      "kind": "scene",
      "clips": [
        {
          "id": "scene-0",
          "begin": "seg0.begin",
          "end": "seg0.end",
          "scene": "headlineCenter",
          "params": {
            "text": "NextFrame v0.8",
            "sub": "Anchors × Tracks"
          },
          "effects": {
            "enter": { "type": "fadeIn", "dur": 0.8 },
            "exit": { "type": "fadeOut", "dur": 0.5 }
          }
        }
      ]
    },
    {
      "id": "subtitle-main",
      "kind": "subtitle",
      "clips": [
        {
          "id": "sub-0",
          "begin": "seg0.sub.begin",
          "end": "seg0.sub.end",
          "text": "Anchors 负责时间，tracks 负责内容。"
        }
      ]
    },
    {
      "id": "anim-main",
      "kind": "animation",
      "target": "scene-main.clips[0].params.opacity",
      "clips": [
        { "at": "seg0.begin", "value": 0.15 },
        { "at": "seg0.sub.begin", "value": 1, "ease": "cubic-bezier(0.16,1,0.3,1)" },
        { "at": "seg0.end", "value": 1 }
      ]
    }
  ]
}
```

## 动效 + 转场（v0.8.1）

scene clip 可以带 effects 和 transition：

```json
{
  "effects": {
    "enter": { "type": "fadeIn", "dur": 0.8 },
    "exit": { "type": "fadeOut", "dur": 0.5 }
  },
  "transition": { "type": "fade", "dur": 0.3 }
}
```

可用 effect types：fadeIn, fadeOut, slideUp, slideDown, slideLeft, slideRight, scaleIn, scaleOut, blurIn, blurOut, bounceIn, springIn, springOut, wipeReveal。

可用 transition types：fade, dissolve, wipe。

## 写的时候记住

- **参数名必须查 `nextframe scenes <id>`** — 不能猜（headlineCenter 用 `text`/`sub`，不是 `title`/`accent`）
- 不要把 `matches` 带回来
- 不要手写 `start/dur` 这种 v0.3 字段
- animation `target` 先只用 `sceneTrackId.clips[N].params.field`
- subtitle 文案放 `clip.text`
- build 前可以引用 anchors；build 后 runtime 只吃绝对毫秒
- **每个 scene clip 都建议加 effects.enter — 否则画面硬切不专业**

## 从 Step 03 合并 anchors

如果 `nextframe anchors from-tts` 已经写出了 `anchors.json`，把它拷进 timeline 顶层：

```bash
node -e "const fs=require('fs'); const tl=require('./timeline.base.json'); tl.anchors=require('./anchors.json'); fs.writeFileSync('./timeline.json', JSON.stringify(tl,null,2));"
```

## 下一步

```bash
nf-guide produce validate
```
