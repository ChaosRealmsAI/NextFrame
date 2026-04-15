# Step 3: 写 Timeline JSON

## 3.1 查看 scene 参数

写 timeline 之前，先看每个 scene 需要什么参数：

```bash
nextframe scenes bilingualSub    # 看 params 定义
nextframe scenes videoArea
nextframe scenes chrome-sourceBar
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
      "scene": "bg-spaceField",
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

**v3 scene 的 bilingualSub 接受单段 `en`/`cn`**（见 3.7 自动展开 fine.json.segments 为多层）。

**不要把整个 segments 数组传一次**。每段 cn 各有自己的 start/end，timeline 里展开成多个 bilingualSub layer，各自 start/dur。

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

## 3.5 videoOverlay — 视频叠加坐标（必填！）

**Why:** recorder 录制时分两步：先截 HTML 画面（所有 scene 层），再用 ffmpeg 把真实视频叠到指定位置。如果 layer 上没写 `videoOverlay` 坐标，recorder 默认全屏叠加 → 视频铺满整个画面 → 标题、字幕、进度条、品牌全部被遮住 → 最终视频只有原始访谈画面，什么 UI 都看不见。

**规则:** 任何 scene 的 `meta.videoOverlay` 为 true 的 layer，timeline 里**必须**写 `videoOverlay` 坐标对象。

```json
{
  "id": "video",
  "scene": "videoArea",
  "start": 0,
  "dur": 81.31,
  "videoOverlay": {
    "x": "7.4074%",
    "y": "14.3750%",
    "w": "85.1852%",
    "h": "28.0208%"
  },
  "params": { ... }
}
```

**坐标怎么算:** x/y 是左上角，w/h 是宽高，百分比基于画布尺寸。从 scene 组件源码里的 videoArea 坐标复制：
- 9:16: x=80/1080=7.4074%, y=276/1920=14.375%, w=920/1080=85.1852%, h=538/1920=28.0208%
- 16:9: 查 GRID_16x9 的 content 区域算

**怎么确认:** 运行 `nextframe scenes videoArea`，看 meta.videoOverlay 是否为 true。是 → 必须写坐标。

## 3.6 9:16 访谈 layer 清单（示例 · 实际名字以 `nextframe scenes --ratio=9:16` 为准）

**别硬抄 scene id**。每个主题自己命名。用 CLI 查当前主题有啥：

```bash
node src/nf-cli/bin/nextframe.js scenes --ratio=9:16 | grep {your-theme}
```

**示例**（sv-interview 主题，参考用）：

```json
"layers": [
  { "id": "bg",     "scene": "spaceField",  "start": 0, "dur": DUR, "params": {} },
  { "id": "header", "scene": "sourceBar",   "start": 0, "dur": DUR, "params": {
    "source": "Dwarkesh Podcast", "episode": "E01", "guest": "Dario Amodei"
  }},
  { "id": "video",  "scene": "videoArea",   "start": 0, "dur": DUR,
    "videoOverlay": { "x": 80, "y": 276, "w": 920, "h": 538 },
    "params": { "src": "/absolute/path/to/clip_01.mp4" } },
  { "id": "sub",    "scene": "bilingualSub","start": 0, "dur": DUR, "params": {
    "en": "We're approaching an intelligence explosion.",
    "cn": "我们正在接近智能爆炸。"
  }},
  { "id": "footer", "scene": "brandFooter", "start": 0, "dur": DUR, "params": {} }
]
```

**注意**：
- bilingualSub 接受单段 `en`/`cn`，每段 segment 自己一层（每段不同 start/dur），不是把 segments 拍平成数组传一次
- video 切屏 = 多个 videoArea 层各自 start/dur/src/videoOverlay（见 pitfalls 坑 11）

## 3.7 多切片自动化生成（推荐）

从 fine.json segments 生成多层：

```bash
node -e "
const fine = require('./translate/clip_01.fine.json');
const clipSrc = require('path').resolve('./clips/clip_01.mp4');
const dur = fine.clip_duration;

const subLayers = [];
fine.segments.forEach((seg, i) => {
  const en = seg.en || '';
  (seg.cn || []).forEach((cnEntry, j) => {
    subLayers.push({
      id: 'sub-' + i + '-' + j,
      scene: 'bilingualSub',
      start: cnEntry.s,
      dur: cnEntry.e - cnEntry.s,
      params: { en, cn: cnEntry.text }
    });
  });
});

const timeline = {
  version: '0.3', ratio: '9:16', width: 1080, height: 1920, fps: 30,
  duration: dur, background: '#0a0e1a',
  layers: [
    { id:'bg',     scene:'spaceField',  start:0, dur:dur, params:{} },
    { id:'header', scene:'sourceBar',   start:0, dur:dur, params:{
      source:'Dwarkesh Podcast', episode:'E01', guest:'Dario Amodei' }},
    { id:'video',  scene:'videoArea',   start:0, dur:dur,
      videoOverlay:{ x:80, y:276, w:920, h:538 },
      params:{ src:clipSrc } },
    ...subLayers,
    { id:'footer', scene:'brandFooter', start:0, dur:dur, params:{} }
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
