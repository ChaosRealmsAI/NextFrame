# NextFrame 评分卡

**7 维**(4 硬门禁 + 3 软报告)· 每次 `./scripts/audit.sh` 跑完更新。

## 维度定义

| # | 维度 | 硬度 | 标准 | check 主命令 |
|---|---|---|---|---|
| G1 | 编译 + lint | 门禁 | [general/G1-code.md](general/G1-code.md) | `make check` |
| G2 | 架构边界 | 门禁 | [general/G2-architecture.md](general/G2-architecture.md) | `scripts/audit-arch.sh` |
| P1 | frame pure | 门禁 | [project/P1-frame-pure.md](project/P1-frame-pure.md) | `cargo test frame_is_pure` + grep |
| P2 | 3 模式像素 | 门禁 | [project/P2-three-modes.md](project/P2-three-modes.md) | `cargo test three_modes_pixel_equal` |
| G3 | AI 可操作 | 报告 | [general/G3-agent-experience.md](general/G3-agent-experience.md) | `scripts/audit-ai.sh` |
| P3 | 视觉 token | 报告 | [project/P3-visual-tokens.md](project/P3-visual-tokens.md) | `scripts/audit-tokens.sh` |
| P4 | 零框架防倒退 | 报告 | [project/P4-no-framework.md](project/P4-no-framework.md) | `scripts/audit-framework.sh` |

## 评分刻度(所有维度统一)

| 分 | 语义 |
|---|---|
| **A = 10** | 完全符合 · 零违约 |
| **B = 8** | 基本符合 · 轻微瑕疵可接受 |
| **C = 6** | 部分符合 · 有违约但可控 |
| **D = 4** | 违约严重 · 需修 |
| **F = 0** | 崩坏 · 不能发版 |
| **N/A** | 本维度在当前版本不适用(代码未建 / 产物不存在)· 不进总分 |

## 门禁规则

- 4 硬门禁(G1/G2/P1/P2)任一 **D/F = 阻合并**
- 3 软报告(G3/P3/P4)**不阻合并** · 但连续 2 次退化 → `feishu-notify` 警告
- N/A 不进总分计算 · 但标清楚下版本必升

## 报告模板(audit.sh 产出格式)

```markdown
# NextFrame 质量审计 · {YYYY-MM-DD HH:MM}

**版本**: v0.1.1 (phase=build)
**总分**: 6.7 / 10 (3 维 N/A · 4 维计分)
**门禁**: 1 绿 / 0 红 / 3 N/A
**趋势**: 基线(首次)

## 维度打分

| # | 维度 | 分 | 变化 | 说明 |
|---|---|---|---|---|
| G1 | 编译 + lint | A | — | make check 三绿 · 0 warning |
| G2 | 架构边界 | A | — | 0 违约 · deps 空 |
| P1 | frame pure | N/A | — | engine 未实现 |
| P2 | 3 模式像素 | N/A | — | runtime 未实现 |
| G3 | AI 可操作 | D | — | 骨架仅占位 main · 无 --help / schema |
| P3 | 视觉 token | N/A | — | 无产品 CSS |
| P4 | 零框架防倒退 | A | — | Cargo + npm 依赖干净 |

## 需关注(下版本必修)

- [ ] P1/P2 在 v0.3 engine/runtime 建立时必 day-1 上 property test + diff harness
- [ ] G3 在 v0.2 CLI subcommands 落地时补 --help + 错误恢复指引

## 历史趋势

| 日期 | G1 | G2 | P1 | P2 | G3 | P3 | P4 | 总分 |
|---|---|---|---|---|---|---|---|---|
| 2026-04-21 | A | A | N/A | N/A | D | N/A | A | 6.7 |
```

## 跑

```bash
./scripts/audit.sh                # 全量(7 维)
./scripts/audit.sh --gate-only    # 只跑 4 门禁
./scripts/audit.sh --report-only  # 只跑 3 报告
```

产物写到 `spec/quality-reports/{YYYY-MM-DD}.md` · 历史趋势表累积。

## 何时跑

- **版本收尾**(version-verify 通过后 · 关版本前 · 硬卡口)
- **大 PR 合并前**(> 500 行 diff)
- **新会话接手**(先跑一次 · 了解水位)
- **每周五**(autopilot cron 可配 · 跑趋势图)

## 演进

- 版本收尾发现"应管但未立"的维度 → 走 `quality-system` skill 建立模式补维度
- 不原地改历史基线刷分
- 新增维度加到本 scorecard + 加 check 脚本 + 加 audit.sh 调用
