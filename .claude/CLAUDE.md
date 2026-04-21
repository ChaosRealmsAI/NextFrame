# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入 JSON，输出可播放 HTML 或 4K MP4。场景不限于自媒体：教育、产品演示、数据报告、内部培训、开源项目介绍。

> 版本进度 / 最近做了啥 / 当前 phase → 看 `git log` + `spec/roadmap.json` + `spec/overview.html`。**本文件不记版本日志**（rule `self-evolution-dna`）。

> 当前状态: **empty shell**（2026-04-21 v0.x 探索期全量归档物理删除 · v0.1.0 从零重走新模式）. src/ 空 · spec/ 空骨架（`devlog/01.md` + `roadmap.json` + `charter.json`）. 技术栈 / 模块 / 能力由 v0.1.0 kickoff 定.

## worktree 规范

每版本独立 worktree · main 不直接改版本代码:

```bash
SESSION_SHORT=${CLAUDE_SESSION_ID:0:8}
git worktree add .worktrees/v{X}-${SESSION_SHORT} -b v{X}-${SESSION_SHORT}
ln -s /Users/Zhuanz/bigbang/NextFrame/spec .worktrees/v{X}-${SESSION_SHORT}/spec
```

`spec/` 是独立仓（`ChaosRealmsAI/NextFrame-spec` · 主仓 gitignored）· symlink 共享 —— 所有 worktree 共用主仓一份 spec · 改 spec 零冲突. 完事 `git worktree remove` + `git branch -d` 清干净.

## 写代码前（强制）

1. `git log --oneline -30` 看最近发生啥
2. 读 `spec/versions/v{current}/kickoff/playbook.json`（没有 = 还没 kickoff，先 kickoff 再干）
3. 读 `spec/design/DESIGN.md`（做任何 HTML / UI 前必查）
4. 产品代码必走 kickoff → plan → execute 三 phase，不跳步

## 基线 lint（workspace 级 deny）

```toml
[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
unreachable = "deny"
todo = "deny"
wildcard_imports = "deny"
```

FFI / `unsafe` 需 `#[allow(...)]` + 一句注释说明理由。

## 视觉设计（跨版本基础）

- `spec/design/DESIGN.md` 分两段：§1-§13 **产品类**（hifi / mockup / 真实 app UI）+ §14-§17 **讲解类**（PM 文档 / brief / walkthrough 等 5 铁律）
- CSS 只用 `var(--token-*)`，禁硬编码色值 / 字号
- 新建 UI 前查 `examples/`，没有对应 example 先跑 `design-system` skill 补

## AI 自验:产品内建 CLI(`nf`)

**人类能操作的 · 产品有对应 CLI**(见 rule `self-verification`)· 改 UI/视觉/窗口 chrome 必跑 · 不让用户当 QA。

| 命令 | 干啥 |
|---|---|
| `nf capture --project=X --episode=Y --out=PATH.png` | **原生 window PNG**(含 chrome / titlebar / 🚦 / 阴影)· AI 视觉验证唯一出口 · 看"用户真实看到啥" |
| `nf screenshot --project=X --episode=Y --out=PATH.png` | DOM-only 截图(看不到 chrome) |
| `nf open --project=X --episode=Y` | 启动/聚焦窗口 |
| `nf ps` | 列窗口 |
| `nf state --key=KEY` | 读 UI state |
| `nf click --selector=CSS` | 模拟点击 |
| `nf devtools` | DOM 调试 |
| `nf quit` | 关 app |

**改 window chrome / traffic light / titlebar = 必 `nf capture` + Read PNG 肉眼量**。禁 `screencapture` 系统命令(违 self-verification rule)。禁只 `nf screenshot`(DOM-only 看不到 chrome 对齐)。

## tmp / 临时文件(🔴 版本隔离)

临时产出一律写 **`spec/versions/v{X}/tmp/`**(如 `spec/versions/v0.5.1/tmp/y34.png`)· **禁根目录 `tmp/`**(多 session 并行撞)· **禁系统 `/tmp`**。见 rule `project-structure`。`.gitignore` 已加 `spec/versions/*/tmp/`。

## 跨会话通讯

见 `~/.claude/rules/project-brain.md`（读写闭环）+ `commit-format.md`（提交格式）。新会话先读 git log + `spec/versions/v{current}/` + DESIGN.md，做完必须写回。
