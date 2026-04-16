# 任务：v0.8 Architecture — ADR-018/019 + stack diagram

## 背景

NextFrame v0.8 大版本重构，核心设计见 `spec/cockpit-app/data/dev/adrs.json` ADR-017。BDD 已写（`spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json`）。

本任务补两个决策文档 + 一个架构分层图，为 Phase 3 walking 阶段铺路。

## 产出 1：ADR-018 "Anchor Expression Grammar"

**追加到** `spec/cockpit-app/data/dev/adrs.json`（是 JSON 数组）。读文件先看格式，字段与 ADR-017 保持一致（`id` / `title` / `status` / `date` / `context` / `decision` / `alternatives` / `consequences` 等）。

核心决策：
- **最小集语法**: `<anchorId>.<point> [±  <number> <unit>]`
  - `<point>` ∈ {`begin`, `end`, `at`}
  - `<number>` 正数（十进制浮点）
  - `<unit>` ∈ {`s`, `ms`}
  - 空白允许：`s1.begin + 0.5s` / `s1.begin+0.5s` 等价
- **BNF**:
  ```
  expr    := anchor_ref [offset]
  anchor_ref := ident "." point
  point   := "begin" | "end" | "at"
  offset  := ("+" | "-") number unit
  number  := [0-9]+ ("." [0-9]+)?
  unit    := "s" | "ms"
  ident   := [a-zA-Z_][a-zA-Z0-9_.]*  (允许 dot 作为命名分隔，如 "beat.drop")
  ```
- **解析错误命名**: `BAD_ANCHOR_EXPR`（语法错）、`MISSING_ANCHOR`（引用未定义 id）、`UNKNOWN_POINT`（point 不在枚举）
- **高级用法走 `code:` filler**：比如 `min(a.end, b.end)` 不走表达式，让 filler JS 代码算好后写成 `at: 12345`
- **理由**: 最小语法保证 AI 学习成本低、lint 严、95% 场景够用；留逃生舱（code filler）承接复杂
- **否决的替代**:
  - 完整 JS 表达式（lint 难、AI 写错率高）
  - 无偏移（只能引用 anchor 点，不能 ±n，过度限制）
  - 引入 `min/max/fallback` 内置函数（复杂度增 10%，收益 5%）

## 产出 2：ADR-019 "Runtime Clock Source"

**追加到同文件**。核心决策：

- **音频驱动优先**（audio-driven clock）：如果 timeline 至少一条 `kind: audio` 轨道，且 recorder 模式开启，当前帧 t 从 `<audio>.currentTime` 读取；这样 TTS/BGM 的时钟是权威。
- **无音频时 t-driven**：纯视觉 timeline → recorder 传 `t` 给每帧，浏览器侧 scene/animation 用此 t。
- **推进策略**: recorder 固定步长 `1/fps`（frame_pure=true 的场景）或读取 audio 回放位置（animation/subtitle）。
- **预览 vs 录制**: 预览模式下两种时钟都可，录制模式下 audio 必须 preload 完成后再开始录（否则 frame 0 拿不到音频长度）。
- **理由**: 视频的"时间"定义取决于场景——讲述类视频语音是主时钟，纯视觉视频用确定性 t；两者不混用，避免漂移。
- **否决的替代**:
  - 永远 t-driven（audio 漂移问题：mp3 解码时长 ≠ 理论时长，会造成末尾字幕错位）
  - 永远 audio-driven（无音频的视频跑不起来）
  - 可配置 `clock: "audio" | "t"` 手动开关（AI 易错选）

## 产出 3：`spec/cockpit-app/architecture/v08-stack.md`

Markdown 文档，包含：

1. **分层图**（用 ASCII box drawing）：
```
┌────────────────────────────────────────────────────────────┐
│ CLI  (TS)   nextframe anchors / tracks / validate / build │
├────────────────────────────────────────────────────────────┤
│ Anchor Engine (TS, src/nf-core/anchors/)                  │
│  parser · resolver · validator · fillers                   │
├────────────────────────────────────────────────────────────┤
│ Kind Registry (TS, src/nf-core/kinds/)                    │
│  audio / scene / subtitle / animation                      │
├────────────────────────────────────────────────────────────┤
│ Builder (TS, src/nf-core/engine/build-v08.ts)             │
│  展开 anchors → 内联 scene/audio/subtitle → HTML           │
├────────────────────────────────────────────────────────────┤
│ Runtime (JS, src/nf-core/runtime-v08/)  浏览器侧           │
│  clock · scene-loop · subtitle · anim                      │
├────────────────────────────────────────────────────────────┤
│ Recorder (Rust, src/nf-recorder/)  不动，HTML → MP4        │
└────────────────────────────────────────────────────────────┘
```

2. **数据流**（timeline.json → ... → MP4 的 5 步）：
   1. AI 写 JSON（anchors 可能是占位，tracks 引用 anchor id）
   2. CLI `nextframe anchors from-tts` 等 filler 填真值
   3. `nextframe validate` 跑 anchor/kind 校验
   4. `nextframe build` 展开 anchors 为绝对 ms + 生成 HTML
   5. `nextframe-recorder slide` 播 HTML 捕帧 → MP4

3. **模块职责表**（每个目录一句话，职责 + 关键导出）：
   - `src/nf-core/anchors/` — anchor 字典解析 & 校验
   - `src/nf-core/kinds/` — kind schema 注册中心
   - `src/nf-core/engine/build-v08.ts` — 主 builder 入口
   - `src/nf-core/runtime-v08/` — 浏览器侧 JS（clock / scene-loop / subtitle / anim）
   - `src/nf-cli/src/commands/anchors/` / `tracks/` — CLI 命令
   - 保护区列表（见 plan 文件）：scenes/, animation/effects/, transitions/, filters/, nf-recorder/, nf-tts/, nf-source/, nf-shell-mac/, nf-bridge/ — **v0.8 不动**

4. **关键不变量**（必须在 implement 阶段不违反）：
   - 运行时不感知 "anchor" 概念（已展开为绝对 ms）
   - Builder 产出 HTML 对外契约：`window.__TIMELINE__` + `getDuration()` + `frame_pure` 注解
   - Recorder 零改动
   - Scene / effect / transition 组件库复用
   - v0.6 格式直接报错（`UNSUPPORTED_VERSION`）

5. **后续 kind 扩展口**（首版不实现，留接口）: video / marker / effect / transition — 各 1 行说明

6. **开发顺序与依赖**: walking → lint → implement（三路并行：anchors/kinds+builder/runtime+cli）

## 要求

- ADR 追加到 `spec/cockpit-app/data/dev/adrs.json`（不要整体重写，只在数组末尾追加两项，保持其余 ADR 不变）
- 架构 md 写到 `spec/cockpit-app/architecture/v08-stack.md`（新建目录可）
- 写完跑 `python3 -c 'import json; d=json.load(open("spec/cockpit-app/data/dev/adrs.json")); print(len(d))'` 确认 JSON 合法、数组元素数 = 原数量 + 2
- 不改其他文件，不 commit

## 验证

1. `python3 -c 'import json; d=json.load(open("spec/cockpit-app/data/dev/adrs.json")); ids=[a["id"] for a in d]; print("ADR-018" in ids and "ADR-019" in ids)'` → True
2. architecture/v08-stack.md 文件存在、含三部分（分层图 / 数据流 / 模块职责）
3. 不破坏其他 ADR（总数 = 原数 + 2）

完成。
