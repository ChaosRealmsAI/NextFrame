# 审美 Quick-Ref · Sonnet 2 分钟过一遍

**场合**：写 scene / 挑 theme / 过 produce 前后各过一次。硬规则 15 条，任何 ❌ → 回去改。

**详情** → `spec/cockpit-app/references/aesthetics/`（9 个 md · 1095 行）
- 00-index 总览 · 01 动画 · 02 短视频 · 03 横屏解说 · 04 竖屏
- 05 PPT 极简 · 06 剪辑 · 07 色彩字体 · 08 完整 checklist

---

## 15 条硬规则（每条一行）

### 质感（awwwards 级 · 第 0 条，最先查）
0. 每个 scene 至少 2 条：mesh 背景 / glass backdrop-filter / blur halo / 多层 shadow / SVG grain / t-driven 周期动画 / gradient text。纯色块 + 单层 shadow + 无 texture = low，回去改。详见 `component/02-craft.md §12`。

### 节奏 · 运动
1. 每 3s 内至少一次视觉变化（抖音/Fireship/Kurzgesagt 共同规律）
2. 动画用 cubic-bezier / spring，禁 linear（旋转 / 进度条除外）
3. 动效时长 200ms-1500ms 区间
4. 同一时刻只有 1 个主角在动，其他静止或微动

### 视觉 · 构图
5. 留白 ≥ 30%（至少屏幕 30% 是负空间）
6. 有明确视觉焦点（主体占 ≥ 30% 屏幕）
7. 配色 ≤ 5 种（含背景）
8. 避开纯黑 #000 / 纯白 #fff（用 #0a0a0a / #f5f5f5）

### 文字 · 层级
9. 主文字字号 ≥ 48px（16:9）/ ≥ 80px（9:16）
10. 字号层级差 ≥ 1.5x（主副差异够明显）
11. 禁 Arial / Helvetica / Times / Comic Sans（用苹方 / 思源 / Inter / SF Pro）

### 信息 · 意图
12. 3 秒内能被没看过的人理解
13. 只讲 1 件事（句子里有"还有 / 同时" → 拆）
14. Hook scene t=0 就有视觉 / 信息冲击（禁黑屏过渡）
15. timeline 有呼吸感（scene 时长不全一样）

---

## 5 条 bonus（拉满专业感）

16. 至少 1 个 overshoot 动画（弹性 bezier(0.175, 0.885, 0.32, 1.275)）
17. scene 间考虑 J-cut / L-cut（音画错峰）
18. 数字类信息做"从 0 计数"动画
19. 首帧能当封面
20. 关键动画点有配套声效标记

---

## 5 秒版（时间紧时）

每 3s 变化？只一个主角动？字够大？配色 ≤ 5？3 秒能看懂？

5 YES → 过 · 任何 NO → 改。
