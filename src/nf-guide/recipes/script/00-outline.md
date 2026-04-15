# Step 0: 定结构（Agent 干）

## CLI

无 — outline 只是 Agent 心智模型，不写文件。决定后直接进 Step 1 写每段。

## 输入

- 主题描述（用户给的目标）
- 可选：参考素材（如本 episode 的 clips/cut_report.json，知道有哪些视频段可用）

## 产出（gate: outline-set）

Agent 心里有清晰的 N 段计划。可选写到本地 scratch 文件（不入 pipeline.json）。

---

## 给 Agent 的提示词

你是短视频脚本总策划。决定本期视频分几段、每段干什么、整体走向。

### 先选叙事方法（12 选 1，不许自由发挥）

| 方法 | 适合 |
|------|------|
| Cognitive Gap | 科普 / 反直觉 / 打破常识 |
| In Medias Res | 故事 / 调查 / 戏剧事件 |
| Countdown Ladder | 排名 / 推荐 / "best of" |
| Transformation Arc | 改造 / case study / before-after |
| Problem-Agitation-Solution | 痛点 / 解决方案 |
| Promise-Proof-Payoff | 教程 / 承诺式 |
| Clarify-Contrast | 对比 / 选型 |
| Myth-Reality | 辟谣 / 误解澄清 |
| Story-Arc-3Act | 纪录片 / 深度报道 |
| Hook-Rhythm | 娱乐 / 感官向 |
| Prediction-Evidence | 趋势 / 预言 |
| Challenge-Experience | 挑战 / 亲身实验 |

**完整方法论**：`spec/reference/narrative-methods.md`
**真实爆款案例（24 个带数据）**：`spec/reference/viral-cases.md`

### 决策维度

1. **总时长**：60s / 90s / 3min / 10min？
2. **段数**：3-7 段最佳。少于 3 段太单薄，多于 7 段记不住
3. **节奏**：开头钩子 → 展开 → 高潮 → 落点
4. **角色 / 视角**：第一人称 / 旁白 / 对话？

### 每段的角色（role）

| role | 干什么 | 时长占比 |
|------|--------|---------|
| 钩子 | 抓注意力，3 秒内决定划不划走 | 5-10% |
| 痛点 | 引出问题或矛盾 | 10-15% |
| 方案 | 给答案 / 揭秘 / 教 | 30-40% |
| 例证 | 案例 / 数据 / 故事 | 20-30% |
| 升华 | 总结 / 价值观 / call-to-action | 10-15% |

### 输出

把这份脑图写到 scratch 文件（如 `/tmp/script-outline-{episode}.md`）：

```markdown
# 脚本结构

- 总时长：~XX 秒
- 段数：N 段
- 主线：一句话主旨

## 每段大纲
1. **段 1 [钩子]** — 一句话讲什么，~10 秒
2. **段 2 [痛点]** — 一句话，~15 秒
...
```

写完进 Step 1 写每段。
