# NextFrame 竞品分析 · v0.1.2

**生成**: 2026-04-21 · 6 subagent 并行 web research · 主 agent 整合
**赛道**: AI 写 HTML / DSL → 视频 自动化模式

## 三件套

| 文件 | 给谁看 |
|---|---|
| [`report.html`](report.html) | **PM** · 7 帧 B 档讲解 · 左右键翻页 · 5 秒扫能捕获 |
| [`data.json`](data.json) | **AI / 跨版本引用** · 8 竞品 × 8 维度 + NextFrame 定位 + 战略建议 |
| [`raw/`](raw/) | **审计追溯** · 6 份 subagent 原始调研 markdown |

## 8 玩家清单

| Tier | 项目 | Stars | 出生 | 关系 |
|---|---|---|---|---|
| 🔴 主威胁 | **Hyperframes** | 8.2k | 2026-03 | 1:1 镜像 · HeyGen 出品 |
| 🟡 龙头 | **Remotion** | 44.1k | 2020 | React + Agent Skills 150K 装机 |
| 🟡 二线 | **Motion Canvas** | 18.4k | 2023 | TS imperative · 0 AI · 程序员窄圈 |
| 🟡 二线 | **Editly** | 5.4k | 2020 | Node JSON · 半停滞(2025-02) |
| 🟡 二线 | **Revideo** | 3.7k | 2024 | YC · pivot 闭源 Midrender |
| 🟢 学 | **Claude Code Video Toolkit** | 926 | 2026 | skills 包分发形态 |
| ⚪ 边缘 | **Etro.js** | 1.1k | ~2020 | 浏览器 WebGL · 非直接竞品 |
| - | **NextFrame**(我们) | 0 | 2026-04-21 | empty shell 起步 1 天 |

## 一句话结论

**已被夹击 · 唯一活路** = Rust + 4K HDR + macOS 壳 + 垂类深做 · 4 个差异化点至少拿下 2 个 · v0.3 必须立刻显出真差异化 · 否则窗口关闭。

## 5 战略建议

| 优先级 | 动作 | 时机 |
|---|---|---|
| **P0** | v0.3 engine 上 4K HDR + Rust 性能硬指标(deterministic frame capture + HDR 验证) | day-1 必上 |
| **P0** | 出 NextFrame Claude Code skills 包(分发通道) | 立刻 |
| **P1** | 挑 1-2 垂类深做(候选: 教育讲解 / 产品演示 / 数据报告 / 4K 屏播) | v0.3-v0.4 |
| **P1** | 学 motion-canvas 的 generator API + Remotion 的 live preview | v0.2-v0.3 |
| **P2** | AI-native 文档(.md URL 后缀 + Accept header) | day-1 铺 |

## 时间警示

```
2020 ────── 2023 ── 2024 ── 2026-03 ── 2026-04-21 ─→ 今
Remotion  M.Canvas Revideo Hyperframes  NextFrame
44.1k     18.4k    3.7k    8.2k(1.5月)  0 (落后 42 天)
                              ↑                 ↑
                          先发占赛道       empty shell
```

**差异化窗口正在关闭** · 必须 v0.3 立刻显出真差异化(4K HDR + Rust 双指标)否则被降维打击。

## 调研方法

- 6 subagent 并行 · `general-purpose` agent · WebSearch + WebFetch
- 每 agent 8 维度: 定位 / 技术架构 / AI 集成 / 输出 / 商业 / DX / 强弱 / 数据
- 主 agent 收 6 份 md → 整合 data.json + 写 report.html
- 1 个 subagent 兼任探索任务 · 挖出 Hyperframes(HeyGen)和 Claude Code Video Toolkit
- 总耗时 ~30 min(6 并发 · 主整合)

## 引用

详细数据 + 维度细节 → [`data.json`](data.json)
原始调研材料 → [`raw/`](raw/)
