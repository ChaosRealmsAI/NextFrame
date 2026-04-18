# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入 JSON，输出可播放 HTML 或 4K MP4。场景不限于自媒体：教育、产品演示、数据报告、内部培训、开源项目介绍。

## 当前状态：空壳，等 v1.0 kickoff

**v0.x 探索期于 2026-04-17 结束并硬重置**（commit `61d4aa0`）。过去所有 src / spec 打包归档，主仓只剩壳，等 v1.0 重新起步。

**保留在主仓的东西**：

| 路径 | 干啥用 |
|---|---|
| `.claude/` | rules / skills / hooks / settings（全套配置） |
| `spec/design/` | `DESIGN.md` + `tokens.css` + examples（产品类 + 讲解类两套规范） |
| `spec/versions/v1.0/` | `kickoff/` + `decisions/` 目录（空，等 kickoff 填） |
| `animation-gallery/` | 动画研究样片（用户指定保留） |
| `scripts/` + `ban_frameworks.toml` | lint / arch 测试基线（v1.0 按需启用） |
| `Cargo.toml` | empty workspace（`members = []`，v1.0 加成员） |

**已归档（本地 `.gitignore` 不进仓）**：`archive/*.tar.gz`
- `v0.x-src-final.tar.gz` — 7 crate workspace（nf-core-app / engine / tracks / runtime / shell-mac / recorder / cli）
- `v0.x-spec-full.tar.gz` — 完整旧 spec（roadmap / adrs / BDD / POC 等）
- `v0.8-legacy.tar.gz` / `v1.0-legacy.tar.gz` / `v2.0-poc-source.tar.gz` — 各时代 src 快照

需要参考历史设计：解压对应 tar.gz 到 `/tmp/` 查看，**不要**挪回主仓。

## 写代码前（强制）

1. 先读 `git log --oneline -30` 看最近发生啥
2. 读 `spec/versions/v{current}/kickoff/playbook.json`（没有 = 还没 kickoff，先 kickoff 再干）
3. 读 `spec/design/DESIGN.md`（做任何 HTML / UI 前必查）
4. 产品代码必须经过 kickoff → plan → execute 三 phase，不跳步

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

## tmp / 临时文件

临时产出一律写项目根 `tmp/`，禁写系统 `/tmp`。已进 `.gitignore`。

## 跨会话通讯

见 `~/.claude/rules/project-brain.md`（读写闭环）+ `commit-format.md`（提交格式）。新会话先读 git log + `spec/versions/v{current}/` + DESIGN.md，做完必须写回。
