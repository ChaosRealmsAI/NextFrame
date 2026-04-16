# Task — v0.8 Anchors × Tracks 完整性审计

## Context

NextFrame v0.8 大版本重构刚完成 E2E 闭环：v0.8 JSON → build → HTML → recorder → MP4（带语音+字幕+场景切换）。

核心设计见 `spec/cockpit-app/data/dev/adrs.json` ADR-017/018/019。
架构见 `spec/cockpit-app/architecture/v08-stack.md`。
BDD 见 `spec/cockpit-app/bdd/v08-anchors-tracks/bdd.json`（9 scenarios）。

## Goal

输出一份完整性审计报告（写到 `tmp/v08-audit-report.md`），覆盖：

## 审计维度（每条标明 ✅/⚠️/❌ + 一句话说明）

### 1. ADR-017 design principles coverage
逐条检查 7 条设计原则（从 ADR-017 的 design_principles 字段读）：
- 原则在代码中是否落地？
- 如果没落地，哪些是 v0.8 scope 内该做的？

### 2. Kind schema 完整性
- 4 个首版 kind (audio/scene/subtitle/animation) 的 schema 是否完整？
- 每个 kind 的 clip 字段和 track 字段是否对齐 ADR-017 kind_schema_registry？
- builder 是否正确处理每种 kind？
- 有无遗漏字段（如 audio 的 fade_in/fade_out、scene 的 opacity/blend_mode）？

### 3. Anchor 引擎完整性
- parser 是否实现 ADR-018 BNF 完整语法？
- resolver 是否正确展开所有支持的表达式？
- validator 是否检查 MISSING_ANCHOR / BAD_ANCHOR_EXPR / ANCHOR_CIRCULAR_DEP？
- fillers: tts/manual/code 是否可用？测试覆盖如何？
- `nextframe anchors from-tts` CLI 是否端到端可用？

### 4. Builder → recorder 兼容性
- v0.8 buildV08 是否正确转换为 v0.3 layers 格式？
- SRT 是否通过 subtitleBar 正确传递？
- audio 是否通过 __SLIDE_SEGMENTS.audio 正确传递？
- frame_pure 设置是否正确？
- getDuration 返回值单位（秒 vs 毫秒）是否正确？
- 已知 recorder 限制（__onFrame 只调 15 次、frame_pure skip 逻辑）有无文档？

### 5. Scene / 动效 / 转场接入
- v0.8 的 scene track clips 是否能用所有 49 scene 组件？
- 哪些 scene 不能用（v3 data descriptors 如 statBig/goldenClose）？为什么？
- 动效（animation effects）在 v0.8 中如何接入？（params.effects.enter/exit）
- 转场（transitions）在 v0.8 中如何接入？（params.transition.type）
- 有无遗漏？这些在 v0.3 legacy 能用但 v0.8 path 没处理的。

### 6. 内嵌视频接入
- videoClip scene 在 v0.8 中是否可用？
- audio track 的 src_in/src_out（裁剪）是否支持？
- video kind（ADR-017 定义但首版排除）的接入路径？

### 7. BDD scenario coverage
逐条检查 9 个 BDD scenario：
- 已实现 / 部分实现 / 未实现
- 如果未实现，需要什么工作？

### 8. CLI 命令完整性
检查所有 v0.8 相关 CLI：
- `nextframe build` v0.8 路径
- `nextframe validate` v0.8 路径
- `nextframe anchors from-tts/list/validate`
- `nextframe tracks add/list`
- 哪些是 stub（NOT_IMPLEMENTED）？哪些真正可用？

### 9. Lint / 测试覆盖
- `scripts/lint-all.sh` 全过？
- `scripts/lint-anchors.sh` 能拦截不合法的 v0.8 timeline？
- `scripts/lint-boundary.sh` zone 是否覆盖新目录？
- anchor parser 单元测试覆盖率？
- kind validator 测试覆盖率？

### 10. 遗留问题 + 建议 next steps
- 列出所有 `grep -r "NOT_IMPLEMENTED" src/nf-core/ src/nf-cli/src/` 的残留
- 列出所有 `grep -r "TODO\|FIXME\|HACK" src/nf-core/anchors src/nf-core/kinds src/nf-core/engine/build-v08.ts` 的残留
- 列出推荐的 v0.8.1 修复优先级

## Output

写 `tmp/v08-audit-report.md`，每个维度一个 section，每条 ✅/⚠️/❌ + 一行说明。最后一个 section 是优先级排序的 action items。

不改任何代码。只读 + 分析 + 写报告。
