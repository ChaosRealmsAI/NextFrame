# Step 3: 写 Timeline JSON

## 3.1 查看 scene 参数

写 timeline 之前，先看每个 scene 需要什么参数：

```bash
nextframe scenes interviewBiSub    # 看 params 定义
nextframe scenes interviewVideoArea
nextframe scenes interviewHeader
# ... 对每个要用的 scene 都看一遍
```

## 3.2 Timeline 结构

```json
{
  "version": "0.3",
  "ratio": "9:16",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "duration": 81.31,
  "background": "#111111",
  "audio": { "src": "/absolute/path/to/clip_01.mp4" },
  "layers": [
    {
      "id": "bg",
      "scene": "interviewBg",
      "start": 0,
      "dur": 81.31,
      "params": {}
    }
  ]
}
```

**必填字段：** version, ratio, width, height, fps, duration, layers[]
**每个 layer 必填：** id (唯一), scene, start, dur, params (对象)

## 3.3 字幕数据 — 最关键的一步

### 有素材（访谈切片）— 直接拷贝 fine.json.segments

```javascript
const fine = require('./translate/clip_01.fine.json');

// 直接贴，不做任何转换
"params": {
  "segments": fine.segments
}
```

**segments 结构是两级的：**
```
segment: { s: 0.2, e: 1.63, speaker: "dwarkesh", en: "So we talked...",
           cn: [{ text: "我们三年前谈过一次。", s: 0.2, e: 1.63 }] }
```

- 外层 segment → 英文 + 说话人（整句）
- 内层 cn[] → 中文（可能拆成多个短句，各有自己的时间）

**禁止拍平。** 不要把 segments 转成 [{s,e,zh,en}] 的扁平数组。
findActiveSub() 需要两级结构才能正确对齐英文和中文。

### 纯创作（讲解视频）— SRT 数组

```json
"params": {
  "srt": [
    { "s": 0, "e": 5, "t": "Hook: AI 的安检员" },
    { "s": 5, "e": 12, "t": "每次 AI 动手前先检查" }
  ]
}
```

## 3.4 audio 字段

```json
// 方式 1: 字符串路径
"audio": "/absolute/path/to/clip_01.mp4"

// 方式 2: 对象（必须有 src）
"audio": { "src": "/absolute/path/to/clip_01.mp4" }
```

**禁止：** `"audio": { "sentences": [...] }` 没有 src → build 会产生 [object Object]

**路径建议：** 用绝对路径。相对路径在 recorder 里可能解析错误。

## 3.5 9:16 访谈的完整 layer 清单

```json
"layers": [
  { "id": "bg",       "scene": "interviewBg",        "start": 0, "dur": DUR, "params": {} },
  { "id": "header",   "scene": "interviewHeader",     "start": 0, "dur": DUR, "params": {
    "series": "速通硅谷访谈", "episode": "E01", "guest": "Dario Amodei",
    "title": "指数快到头了，大众浑然不知"
  }},
  { "id": "video",    "scene": "interviewVideoArea",  "start": 0, "dur": DUR, "params": {
    "src": "/absolute/path/to/clip_01.mp4", "clipNum": 1, "totalClips": 3
  }},
  { "id": "bisub",    "scene": "interviewBiSub",      "start": 0, "dur": DUR, "params": {
    "segments": FINE_JSON_SEGMENTS
  }},
  { "id": "meta",     "scene": "interviewMeta",       "start": 0, "dur": DUR, "params": {
    "origRange": "原片 2:22:18 | 内容来源 00:00 — 01:21",
    "topic": "Dario: 技术指数如期而至",
    "tags": "Dwarkesh Podcast,Dario Amodei,原声 1:21"
  }},
  { "id": "progress", "scene": "progressBar9x16",     "start": 0, "dur": DUR, "params": {
    "duration": DUR
  }},
  { "id": "brand",    "scene": "interviewBrand",      "start": 0, "dur": DUR, "params": {} }
]
```

**DUR** = fine.clip_duration（视频时长）
**FINE_JSON_SEGMENTS** = fine.segments（直接贴）

## 3.6 用脚本生成（推荐）

不要手写 JSON，用脚本从 fine.json 自动生成：

```bash
node -e "
const fine = require('./translate/clip_01.fine.json');
const clipSrc = require('path').resolve('./clips/clip_01.mp4');
const dur = fine.clip_duration;

const timeline = {
  version: '0.3', ratio: '9:16', width: 1080, height: 1920, fps: 30,
  duration: dur, background: '#111111',
  audio: { src: clipSrc },
  layers: [
    { id:'bg',       scene:'interviewBg',       start:0, dur:dur, params:{} },
    { id:'header',   scene:'interviewHeader',    start:0, dur:dur, params:{
      series:'速通硅谷访谈', episode:'E01', guest:'Dario Amodei',
      title:'指数快到头了，大众浑然不知' }},
    { id:'video',    scene:'interviewVideoArea', start:0, dur:dur, params:{
      src:clipSrc, clipNum:1, totalClips:3 }},
    { id:'bisub',    scene:'interviewBiSub',     start:0, dur:dur, params:{
      segments: fine.segments }},
    { id:'meta',     scene:'interviewMeta',      start:0, dur:dur, params:{
      origRange:'原片 2:22:18 | 内容来源 00:00 — 01:21',
      topic:'Dario: 技术指数如期而至',
      tags:'Dwarkesh Podcast,Dario Amodei,原声 1:21' }},
    { id:'progress', scene:'progressBar9x16',    start:0, dur:dur, params:{ duration:dur }},
    { id:'brand',    scene:'interviewBrand',     start:0, dur:dur, params:{} }
  ]
};
require('fs').writeFileSync('timeline.json', JSON.stringify(timeline, null, 2));
console.log('Written: timeline.json, duration:', dur, 'layers:', timeline.layers.length);
"
```

## 下一步

```bash
nf-guide produce validate
```
