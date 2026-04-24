# NextFrame 质量体系 · 索引

**7 维**(4 硬门禁 + 3 软报告)· 跨版本沉淀 · 每版本收尾必跑 `scripts/audit.sh`。

## 硬门禁(不过不合并)

| 维度 | 标准文件 | 查啥 | check 命令 |
|---|---|---|---|
| **G1 · 编译 + lint** | [general/G1-code.md](general/G1-code.md) | cargo check 零 warning · clippy deny · tsc --noEmit 零 error | `make check` |
| **G2 · 架构边界** | [general/G2-architecture.md](general/G2-architecture.md) | crate 依赖方向单向 · cli→shell/runtime→engine · frontend→無 Rust | `scripts/audit-arch.sh` |
| **P1 · frame pure** | [project/P1-frame-pure.md](project/P1-frame-pure.md) | frame(t,j) ≡ frame(t,j) · 禁 Date.now/未 seed random/未缓存网络 | property test + grep |
| **P2 · 3 模式像素一致** | [project/P2-three-modes.md](project/P2-three-modes.md) | pixel-diff(play, preview, export) = 0 | runtime diff harness |

## 软报告(跑趋势 · 满分 A=10)

| 维度 | 标准文件 | 查啥 | check 命令 |
|---|---|---|---|
| **G3 · AI 可操作** | [general/G3-agent-experience.md](general/G3-agent-experience.md) | CLI 有 --help + JSON schema · 错误给回收指引 · 产品内建 self-verify CLI | grep + manual review |
| **P3 · 视觉 token** | [project/P3-visual-tokens.md](project/P3-visual-tokens.md) | CSS 禁硬编码色/字号 · 必 `var(--token-*)` | grep 模式 |
| **P4 · 零框架防倒退** | [project/P4-no-framework.md](project/P4-no-framework.md) | package.json / Cargo.toml 禁 react/vue/electron/tauri | grep |

## 一键

```bash
./scripts/audit.sh                 # 跑 7 维 · 出 spec/quality-reports/{date}.md
./scripts/audit.sh --gate-only     # 只跑 4 门禁(快)
./scripts/audit.sh --report-only   # 只跑 3 软报告
```

## 评分卡

`scorecard.md` — 每次 audit 跑完写回 · 跨版本看趋势 · 连续退化 → feishu-notify 警告。

## 关联

- **charter principles**: G1=lint baseline · P1=P3 原则 · P2=P4 原则 · P4=P7 HTML 生态 / tech-decision rule
- **CLAUDE.md**: lint deny 6 条 · tmp/ 约束 · 设计系统硬约束
- **rules**: `tech-decision` · `self-verification` · `agent-usability` · `ai-coding-mindset` §6 POC

## 版本卡口

按 `quality-system` skill 两个强制卡口:

- **开头**: `version-skeleton-lint` 第 1 步 invoke 本 skill 判断要不要补维度
- **收尾**: `version-verify` 通过后 invoke 本 skill 跑评分卡

## 演进

本 index 跨版本稳定 · 新增维度走 `quality-system` skill "建立"模式补 md 文件 · 不原地改历史标准。
