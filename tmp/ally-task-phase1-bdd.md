# 任务：v0.8 Anchors × Tracks BDD 场景

## 背景

NextFrame 正在做大版本重构 v0.8。设计文档（最权威）：`spec/cockpit-app/data/dev/adrs.json` 里的 ADR-017（搜 "adr-017" 或 "v0.8" 能定位）。

**核心设计 = Anchors × Tracks 两个核心概念**：
- **Anchors** — 时间命名字典。例 `{ "s1.begin": { at: 0 }, "s1.end": { at: 5000 }, "beat.drop": { at: 12500 } }`。clip 引用 anchor（`begin: "s1.begin"`, `end: "s1.end + 0.3s"`），**AI 永不写毫秒数**。
- **Tracks** — 多轨道。每个 track 有 `kind` (audio/scene/subtitle/animation/...)，kind 自带 schema 声明 clip 字段和 track 级 params。
- 关键帧两种等价写法：`clip.params.x = { keyframes: [...] }` 或独立 `kind: animation` track（带 target 字段指向别的 track 的 param）。
- Anchor 填写靠 **filler 插件**：`tts:` / `manual:` / `code:` / `srt:` / `beats:` / `media:` / `ref:`。

首版只实现 4 个 kind：**audio / scene / subtitle / animation**。Anchor 语法首版最小集（`id.begin|at|end ± n s|ms`）+ `code:` filler 兜底。

## 产出

**一个文件**：`spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json`

严格 JSON 格式（不含注释、不含尾逗号）。参考邻居 `spec/cockpit-app/bdd/narration-tracks/bdd.json` 的字段结构（feature / version / invariants / scenarios[]），但内容完全重写。

## 必备字段

顶层：
- `feature`: "Anchors × Tracks — v0.8 timeline model"
- `version`: "v0.8"
- `status`: "in-progress"
- `invariants`: { behavior: [...], data: [...] }  — 每条 1 句，基于 ADR-017 的 7 条原则提炼
- `scenarios`: 下面 8 个

每个 scenario 字段：id / version / type / status / story / given / when / then[] / critical
- `id` 统一前缀 `v08-`
- `version`: "v0.8"
- `type`: "feature"
- `status`: "todo"（都还没实现）
- 不要写 `verify`、`verified_note`、`verified_date`（实现后再回填）

## 8 个必备场景

1. **v08-anchors-basic**  
   Story: AI 写合法 timeline（全 anchor 引用）→ validate pass  
   Given: timeline.json 有 `version: "0.8"`、3 个 anchor（`s1.begin`/`s1.end`/`s2.begin`）、2 个 track（scene+subtitle），clip.begin/end 全是 anchor 引用  
   When: `nextframe validate timeline.json --json`  
   Then: 退出码 0；JSON `pass: true`、`issues: []`、包含 `summary` 字段
   
2. **v08-anchor-missing-ref**  
   Story: validate 抓到未定义的 anchor 引用  
   Given: clip.begin = "s99.begin" 但 `anchors` 里没有 s99  
   When: validate  
   Then: pass=false；issues 含 code=`MISSING_ANCHOR`、field=`tracks[x].clips[y].begin`、fix 提示
   
3. **v08-anchor-expression-syntax**  
   Story: 支持最小集表达式（`id.point ± n s|ms`）  
   Given: clip.end = "s1.end + 0.5s"；anchor `beat.drop` at 3000ms  
   When: validate + build  
   Then: validate pass；build 产物把表达式展开为绝对 ms 嵌入 HTML；非法语法（如 `s1.begin * 2`）validate 报 `BAD_ANCHOR_EXPR`
   
4. **v08-anchor-circular-dep**  
   Story: anchor 互相引用成环时报错  
   Given: 两个 anchor 用 `code:` filler 互引  
   When: validate  
   Then: pass=false；code=`ANCHOR_CIRCULAR_DEP`；issues 含循环路径
   
5. **v08-kind-contract**  
   Story: kind schema 校验违例  
   Given: audio track clip 没有 `src` 字段；subtitle track clip `text` 为空  
   When: validate  
   Then: pass=false；issues 列出两条 `KIND_SCHEMA_VIOLATION`，区分 kind 和缺失字段
   
6. **v08-tts-filler**  
   Story: TTS 产出的 mp3+words 自动填入 anchors  
   Given: 手上有 `seg0.words.json`（含 words[].start_ms/end_ms）  
   When: `nextframe anchors from-tts seg0.words.json --out anchors.json`  
   Then: anchors.json 每句一个 begin/end anchor；命名可预测（`seg0.begin/end` / `seg0.w0.begin` ...）；退出码 0；stdout JSON 含 added_count
   
7. **v08-build-e2e**  
   Story: 四 kind（audio+scene+subtitle+animation）timeline 能 build 为 HTML  
   Given: timeline 含完整 4 kind，anchors 已填  
   When: `nextframe build timeline.json --out out.html`  
   Then: out.html 是单文件（含内联 scene 渲染代码、audio 标签、字幕数据、关键帧 target 描述）；生成 HTML 有 `window.__TIMELINE__` + `getDuration()` + `frame_pure` 注解（兼容 recorder 契约）
   
8. **v08-record-e2e-with-animation**  
   Story: HTML → recorder → MP4，验证动效/TTS/字幕/关键帧全保留  
   Given: build 产出的 HTML 来自场景 #7  
   When: `nextframe-recorder slide out.html --out demo.mp4 --width 1920 --height 1080 --fps 30`  
   Then: demo.mp4 ≥ 20s；ffprobe 显示 1 条 video + 1 条 audio stream；用 ffmpeg 抽 t=0.1s / t=中段 / t=末尾 三帧，opacity（animation track）目测可见变化；中段帧含字幕文本
   
9. **v08-no-v06-compat**  
   Story: v0.6 格式直接报错  
   Given: timeline.json 含 `tracks[{matches:...}]` 或 `version: "0.6"`  
   When: validate  
   Then: pass=false；code=`UNSUPPORTED_VERSION`；fix 提示迁移路径或"没有迁移，必须重写"

## 要求

- 直接写 `spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json`
- 写完运行 `python3 -c 'import json; json.load(open("spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json"))'` 验证 JSON 合法
- 不要改其他文件
- 不要 commit

## 验证自己做完了

1. 文件存在
2. JSON 合法（python3 -c 'import json; ...' 不报错）
3. 9 个 scenario 全齐
4. 所有 `id` 以 `v08-` 开头
5. invariants 至少 3 条 behavior + 3 条 data

完成。
