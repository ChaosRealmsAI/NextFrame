# Step 3: 写 Timeline JSON

## 必读

```bash
# 查看每个 scene 的参数 schema
nextframe scenes <id>
# 例: nextframe scenes interviewBiSub → 看 params 定义
```

## Timeline 结构

```json
{
  "version": "0.3",
  "ratio": "9:16",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "duration": 81.31,
  "background": "#111111",
  "audio": { "src": "/path/to/clip_01.mp4" },
  "layers": [
    { "id": "bg",   "scene": "interviewBg",   "start": 0, "dur": 81.31, "params": {} },
    { "id": "sub",  "scene": "interviewBiSub", "start": 0, "dur": 81.31, "params": {
      "segments": []
    }}
  ]
}
```

## 字幕数据填法

### Type A（有素材）— 直接拷贝，零转换

```javascript
const fine = require('./translate/clip_01.fine.json');

// 直接贴 fine.json.segments，不做任何转换
params.segments = fine.segments;

// segments 结构（两级）:
// segment.s/e → 英文 + 说话人颜色
// segment.cn[].s/e/text → 中文具体哪句
```

**禁止拍平成 SRT 数组** — 会导致英文跟中文子 cue 重复，字幕跳动。

### Type B（纯创作）— 单级 SRT

```json
"params": {
  "srt": [
    { "s": 0, "e": 5, "t": "第一句字幕" },
    { "s": 5, "e": 10, "t": "第二句字幕" }
  ]
}
```

## audio 填法

```json
// 字符串（简单）
"audio": "/path/to/clip.mp4"

// 对象（必须有 src）
"audio": { "src": "/path/to/clip.mp4" }

// 禁止: { "sentences": [...] } 没有 src → build 产生 [object Object]
```

## 门禁

- `nextframe validate timeline.json` 通过 → 进 Step 4
- ratio 字段必须存在且匹配 width×height
- audio 格式正确
