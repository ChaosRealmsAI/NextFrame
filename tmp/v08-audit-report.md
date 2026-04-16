# v0.8 Anchors × Tracks 完整性审计

审计基线：`spec/cockpit-app/data/dev/adrs.json` ADR-017/018/019、`spec/cockpit-app/architecture/v08-stack.md`、`spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json`、`nextframe scenes`、`scripts/lint-all.sh`、`scripts/lint-anchors.sh`、`scripts/lint-boundary.sh`、anchors CLI tests、`nextframe validate/build/tracks/anchors` 实跑。

## 1. ADR-017 design principles coverage

- ⚠️ 原则 1「时间是引用不是值」部分落地：v0.8 schema、`lint-anchors.sh`、CLI validate 都按 anchor ref 工作，但 core kind 校验和 build 仍接受 numeric timestamp dev shortcut，build 不会硬拒绝纯数字。
- ⚠️ 原则 2「锚点谁知道谁填」只落了壳：`tts/manual/code` filler 函数存在，但 `build-v08.ts` 的 `runFillers()` 传参错误且丢弃返回值，builder 内 filler 实际不生效；`beats/srt/media/ref` 也未实现。
- ⚠️ 原则 3「kind 自包含契约」部分落地：`src/nf-core/kinds/` 已有 registry + kind validator，但很多 kind 字段只做验证、不参与 lowering/runtime/recorder。
- ❌ 原则 4「高级能力都是 kind 内置参数」未落地到执行层：`opacity/blend_mode/pan/mute/style/fade/src_in/src_out` 大多只校验不消费，属于 v0.8 scope 内应做但没接通。
- ❌ 原则 5「关键帧两种等价写法」未落地：独立 `animation` track 会在 build 时被丢弃，内嵌 `params.*.keyframes` 在 v0.8 validate/build 路径里基本没处理。
- ⚠️ 原则 6「既有能力复用」只复用了 scene/runtime 一半：scene catalog 经 v0.3 lowering 继续可用，但 effects/transitions catalog 没接到 v0.8 path。
- ✅ 原则 7「JSON 可扫读」已落地：`anchors + tracks` 结构、最小 fixture 和 CLI validate/build 路径都围绕命名 anchor 工作，可读性明显优于毫秒直写。

## 2. Kind schema 完整性

- ✅ 首版 4 个 kind 已存在：`audio/scene/subtitle/animation` 都在 `src/nf-core/kinds/` 注册。
- ⚠️ kind registry 与 ADR-017 基本对齐，但实现细节不完全一致：`animation.target` 同时接受顶层字段和 `params.target`，核心校验仍允许 numeric time shortcut。
- ⚠️ builder 只真正处理了 `scene`、`subtitle`、以及“第一条音频”；`animation` 虽能过校验，但在 `toLegacyTimeline()` 里完全丢失。
- ❌ audio 的 `fade_in/fade_out/src_in/src_out`、scene 的 clip `opacity` / track `blend_mode`、subtitle 的 `style` / track 样式、audio track `pan/mute` 都是“schema 有、运行时无”。
- ⚠️ kind 校验覆盖不足：仓库里没有针对 `src/nf-core/kinds/*.ts` 的独立单元测试，只能由 CLI validate/build 间接碰到。

## 3. Anchor 引擎完整性

- ⚠️ parser 基本覆盖 ADR-018 最小语法，且支持空白与 offset；但它额外接受 implicit `.at` 多点命名，且 inline keyframe `at` 不在 build/validate 主路径里递归校验。
- ⚠️ resolver 可展开 ref 和 `± s/ms` 偏移，也能做递归 ref；但 `resolveAll()` 只是浅拷贝 stub，不是完整“全字典展开”。
- ✅ validator 能报 `MISSING_ANCHOR` / `BAD_ANCHOR_EXPR` / `UNKNOWN_POINT` / `ANCHOR_CIRCULAR_DEP`，anchors CLI tests 也覆盖了这些错误码。
- ❌ filler engine 在 builder 内未接通：`runFillers()` 以 `entry.filler` 直接查 `Map`、把整个 entry 传给 filler、并且不把 filler 返回值写回 `timeline.anchors`，所以真正的 builder-time filler 不可用。
- ⚠️ `tts/manual/code` 三个 filler 函数都存在且有 3 个 tests 覆盖，但只有 `nextframe anchors from-tts` 暴露成 CLI；`manual`/`code` 没有 CLI 或 E2E 路径。
- ⚠️ `nextframe anchors from-tts` 端到端可用，但当前只支持 `{segments:[{id,startMs,endMs,words:[{w,s,e}]}]}` 这套 payload，未覆盖 BDD 里提到的 `start_ms/end_ms` 形状，JSON 输出字段也是 `addedCount` 而不是 `added_count`。

## 4. Builder → recorder 兼容性

- ✅ `buildV08()` 目前确实会把 v0.8 timeline 降成 v0.3 `layers` + `audio`，再走现有 `buildHTML()`，所以 recorder 能继续吃产物。
- ⚠️ 这个 lowering 很保守：多音轨会塌成“第一条 audio clip”，没有混音、多 clip 拼接、ducking，也没有 audio trim/fade。
- ✅ 字幕能通过 `subtitleBar` layer 正常上屏：`toLegacyTimeline()` 会注入 `scene: "subtitleBar"`，`buildHTML()` 再把它抽成 `const SRT = [...]`。
- ⚠️ recorder 侧真正消费字幕时优先读 `const SRT`，不是 v0.8 dead code 里的 `__SLIDE_SEGMENTS.srt`；现行 build 产物里的 `__SLIDE_SEGMENTS.srt` 还是占位空 cue。
- ✅ `__SLIDE_SEGMENTS.audio` 会带上第一条音频 src，recorder 的 `extract_slide_segments_audio()` 能识别它。
- ⚠️ `frame_pure` / `getDuration()` 的 v0.8 专用实现都在 `build-v08.ts` 的 dead `buildDocument()` 里；真正产物走的是 v0.3 contract：`TIMELINE.duration`（秒）+ 每个 scene 的 `meta.frame_pure` + `window.__hasFrameChanged()`。
- ⚠️ `getDuration` 单位问题在 live path 里并不成立：recorder 实际查的是 `window.__duration` / `engine.duration` / `TIMELINE.duration`，都是秒；dead v0.8 `getDuration()` 也是秒，但根本没被导出路径使用。
- ⚠️ 已知 recorder skip 限制只部分有文档：README 说明了 `--no-skip` 和 frame skipping，`build-runtime.ts` 注释说明了 `frame_pure` / `__hasFrameChanged`；但“`__onFrame` 只调 15 次”既没文档，也不符合实现，真实逻辑是字幕/cue 变化后额外保留约 `0.5 * fps` 帧（30fps 时约 15 帧）并按需继续注入。

## 5. Scene / 动效 / 转场接入

- ✅ `nextframe scenes` 当前能列出 49 个 scene id，`buildV08 -> toLegacyTimeline -> buildHTML` 也能同时复用 modular scenes 和 legacy bundle scenes。
- ✅ 像 `statBig`、`goldenClose` 这类“descriptor 很厚”的新 scene 本身没有被 v0.8 path 卡死；它们最终仍是普通 scene layer，经 `buildRuntime()` 的 `resolveSceneParams()` 跑默认值/主题合并。
- ⚠️ 一些 helper scene 只能“静态用”：例如 legacy `progressBar16x9` 需要调用方每帧喂 `progress`，但 v0.8 path 既不自动注入 progress，也没有可用 animation lowering，所以动态进度条不成立。
- ❌ 动效 `effects.enter/exit` 没接上：legacy v0.3 runtime 可以吃 layer enter/exit effect，但 `toLegacyTimeline()` 不保留 v0.8 clip 上的 effect 配置。
- ❌ 转场 `transition.type` 没接上：transition catalog 仍在 `src/nf-core/animation/transitions/`，但 v0.8 lowering 不会把 clip transition 传给 legacy layer。
- ⚠️ v0.3 legacy 里能工作的 effect/transition 能力，在 v0.8 path 里属于“catalog 还在、接线没做”。
- ⚠️ 9:16 `videoArea` 这类 placeholder video overlay scene 不适合当前 v0.8 slide path：recorder 的 `query_video_layers()` 只有在真实 `<video>` DOM 或显式 layer geometry 下才能稳定测到 overlay 矩形，而 `videoArea` 只是黑框占位。

## 6. 内嵌视频接入

- ✅ `videoClip` scene 在 v0.8 可用：它来自 legacy bundle，scene clip 的 `params.src` 会保留下来，recorder 能从 `<video data-nf-persist>` 识别并做后期 overlay。
- ❌ audio track 的 `src_in/src_out` 目前不支持：schema 会校验，但 lowering/runtime/recorder 都不会裁音频。
- ❌ ADR-017 里的 `kind:"video"` 尚未接入：`Kind` union 不含 `video`，registry/CLI/build 都不支持它。
- ⚠️ 如果需求是 9:16 访谈黑框占位 + ffmpeg overlay，当前更像旧 `clip` 模式能力，不是完整的 v0.8 `video` kind 路径。

## 7. BDD scenario coverage

- ✅ `v08-anchors-basic`：已实现，`nextframe validate ... --json` 对最小合法 fixture 返回 `pass: true`。
- ✅ `v08-anchor-missing-ref`：已实现，validator/CLI 都会给出 `MISSING_ANCHOR`。
- ⚠️ `v08-anchor-expression-syntax`：部分实现，合法 `id.point ± Ns|ms` 可过，非法算术会报错；但 build 产物不是 v0.8 runtime payload，而是降级后的 v0.3 layers。
- ✅ `v08-anchor-circular-dep`：已实现，code filler cycle 会报 `ANCHOR_CIRCULAR_DEP`。
- ✅ `v08-kind-contract`：已实现，kind validator 会报 `KIND_SCHEMA_VIOLATION`。
- ⚠️ `v08-tts-filler`：部分实现，命令能跑通且命名稳定，但 payload/JSON output 与 BDD 细节不完全一致。
- ⚠️ `v08-build-e2e`：部分实现，audio/scene/subtitle 能落进单 HTML；animation 没有 survive lowering。
- ❌ `v08-record-e2e-with-animation`：未实现，animation 在 build 阶段已经丢失，仓库里也没有对应 E2E recorder test。
- ✅ `v08-no-v06-compat`：已实现，`validate` / `build` 都明确拒绝 v0.6 或顶层 `matches`。

## 8. CLI 命令完整性

- ✅ `nextframe build` 的 v0.8 路径可用，但真实行为是“validate/resolve 后降到 v0.3 再 build”，不是使用 `build-v08.ts` 里的新 runtime HTML。
- ✅ `nextframe validate` 的 v0.8 路径可用，但实现分叉：命令自带一套 `validateV08Timeline()`，没有复用 `_helpers/_timeline-validate.ts` 里的更完整版本。
- ✅ `nextframe anchors from-tts` 可用；输入正确时会写 anchors 文件并输出 JSON summary。
- ❌ `nextframe anchors list` 是 stub，直接输出 `NOT_IMPLEMENTED: anchors list`。
- ❌ `nextframe anchors validate` 是 stub，直接输出 `NOT_IMPLEMENTED: anchors validate`。
- ✅ `nextframe tracks list` 可用，会解析 anchor refs 后给出 track 数量和时长摘要。
- ⚠️ `nextframe tracks add` 可用但很薄，只会直接往 JSON 里 append 一个空 track，不会生成 kind-specific scaffold，也不会二次 validate。

## 9. Lint / 测试覆盖

- ✅ `scripts/lint-all.sh` 全过；本次实跑通过，末尾 v0.7 lint 只有 takeSnapshot warning、整体仍 PASS。
- ⚠️ `scripts/lint-anchors.sh` 只能拦“字段必须是字符串、不能有 matches/v0.6”，抓不到 bad expr、missing anchor、begin>=end、kind contract 这类非法 timeline。
- ❌ `scripts/lint-boundary.sh` 的注释说要覆盖 `anchors` / `kinds`，但实际 `TS_ZONES` 只列了 `src/nf-cli/src`、`src/nf-cli/test`、`src/nf-core/engine`，新目录 `src/nf-core/anchors` / `src/nf-core/kinds` 并未纳入 rule 3。
- ⚠️ anchor parser 单测有基础覆盖：parser 6 tests、resolver 4 tests、validator 4 tests、filler 3 tests，共 17 tests；但没有覆盖 CLI validate/build E2E，也没有 coverage report。
- ❌ kind validator 测试覆盖基本为空：仓库里未发现针对 `src/nf-core/kinds/*.ts` 的独立 test 文件。

## 10. 遗留问题 + 建议 next steps

- ⚠️ `grep -R -n 'NOT_IMPLEMENTED' src/nf-core/ src/nf-cli/src/` 残留：`src/nf-cli/src/commands/anchors/list.ts`、`src/nf-cli/src/commands/anchors/validate.ts`，以及 help 文案 `src/nf-cli/src/commands/_helpers/help/commands.ts` 仍声明 walking skeleton。
- ✅ `grep -R -n -E 'TODO|FIXME|HACK' src/nf-core/anchors src/nf-core/kinds src/nf-core/engine/build-v08.ts` 当前返回空；问题主要不是注释债，而是 dead path / missing wiring。
- ⚠️ 额外遗留：`build-v08.ts` 里新 runtime 的 `buildDocument()` / `collectAnimationData()` / `window.__NF_V08__` 代码存在但未被导出路径使用，实际产品行为仍由 `toLegacyTimeline()` 决定。
- ⚠️ 额外遗留：builder path 不复用 helper 里的 `validateTimelineV08()`，导致 `BAD_CLIP_RANGE`、inline keyframe 校验等行为在 CLI live path 和 helper path 分叉。

## v0.8.1 Action Items

1. P0：修 `buildV08()` 的核心接线，二选一明确化。要么真正输出 `runtime-v08` HTML，要么把 `animation/effects/transitions/audio trims/fades/scene opacity/style` 全部可靠 lower 到 v0.3，不要再保留 dead `buildDocument()` 假路径。
2. P0：修 filler pipeline。`runFillers()` 必须按 filler 名解析、用正确参数调用、把返回值写回 `timeline.anchors`，并决定 v0.8.1 是补 `beats/srt/media/ref` 还是下调 ADR/CLI 承诺。
3. P0：统一 v0.8 validator。CLI `validate`、build 前校验、helper 校验应复用同一实现，并强制拒绝 numeric begin/end/at、补 `BAD_CLIP_RANGE` 与 inline `params.*.keyframes[*].at` 校验。
4. P1：补齐 CLI 骨架。至少实现 `anchors list` / `anchors validate`，或者在 help/ADR/architecture 里明确删掉这些承诺。
5. P1：补 kind/build tests。新增 `src/nf-core/kinds` 单测、`build-v08` 集成测试、以及一个最小 recorder E2E（audio + subtitle + animation）来证明闭环。
6. P1：补 scene/video 接线文档。明确区分 `videoClip`（slide path 可用）与 `videoArea`（旧 clip/overlay 语义），并写清 recorder skip 不是“只调 15 次 `__onFrame`”。
7. P2：扩 `lint-boundary.sh` 到 `src/nf-core/anchors` / `src/nf-core/kinds`，并升级 `lint-anchors.sh` 让它至少能抓 bad expr、missing ref、reversed range。
