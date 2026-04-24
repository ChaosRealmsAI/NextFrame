# Tracks Contract · v0.8

每个文件定义一个 Track kind · JSON 形式 · 独立 · 可 jq 查 · TypeScript / Rust 消费端都从这里产代码。

## 目录结构

```
tracks/
├── official/    # 8 个官方 kind · runtime 默认实现
│   ├── scene.json       # hero / stat 基础 layout
│   ├── audio.json       # mp3/wav 播放
│   ├── subtitle.json    # 每字 span 三态
│   ├── animation.json   # 驱动其他 track 参数
│   ├── bg.json          # solid/gradient/image/video 铺底
│   ├── video.json       # PIP 画中画
│   ├── chart.json       # bar/line/pie
│   └── data.json        # ranking/finance/comparison
│
└── community/   # 预制专用 scene · src 必须显式指定
    ├── scene-hero-centered.json
    ├── scene-quote.json
    └── scene-metric-grid.json
```

## 字段约定(每文件)

```json
{
  "kind": "...",                     // 唯一标识 · 不重
  "category": "official|community",  // community 才有 · 默认 official
  "name": "...",
  "description": "...",
  "use_cases": [...],
  "t0_visibility": 0.0-1.0,          // FM-T0 gate · render(t=0) 最小 opacity
  "z_order_hint": number,            // 渲染层级
  "visual_channels": ["scene"|"audio"|"subtitle"|[]],
  "duration_hint_ms": number,        // 建议时长 · PM 参考
  "src_hint": "frontend/.../x.js",   // community 必填 · official 可省
  "params": { JSON Schema draft-07 }, // 严格校验
  "sample": { ...params instance }   // 可直接填进 timeline.json 验证
}
```

## kind 扩展规则

- **official 8 kind**(scene/audio/subtitle/animation/bg/video/chart/data): timeline.json 里 kind 对应这 8 个字面量就行 · src 字段可省。
- **community kind**(任何不在 8 列表的值 · 如 `scene-quote` · `webgl-particles`): src 字段必填 · 指向实现文件路径。
- v0.8 runtime 只实现 scene + 3 community(hero-centered/quote/metric-grid)· 其他 kind 遇 runtime 报 `UnsupportedKind` 警告不崩。

## 消费端

- Rust parser (`crates/nf-timeline`): 按 `kind → params schema` 做动态校验。
- TypeScript runtime (`frontend/nf-runtime/`): 按 `kind → src_hint` 动态 import 组件模块。
- BDD scenarios: sample 字段可直接挖出来产 timeline.json fixture。
