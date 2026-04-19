# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入 JSON，输出可播放 HTML 或 4K MP4。场景不限于自媒体：教育、产品演示、数据报告、内部培训、开源项目介绍。

> 版本进度 / 最近做了啥 / 当前 phase → 看 `git log` + `spec/roadmap.json` + `spec/overview.html`。**本文件不记版本日志**（rule `self-evolution-dna`）。

## 已有能力（src/ 下活着的 crate）

| Crate | 能力 |
|---|---|
| `nf-cli` | 命令行入口 · `nf build / validate / anchors / lint-track / schema / new / karaoke` |
| `nf-core-engine` | 编译器 · source → resolved → bundle.html 三阶段 |
| `nf-runtime` | 浏览器运行时 · boot + RAF + `getStateAt(t)` · play/edit/record 三模式 |
| `nf-tracks` | Track 家族（scene / chart / video / audio / subtitle …）+ ABI lint gates |
| `nf-tts` | TTS 合成 · Edge + Volcengine + whisperX 字级对齐 · 详见 `src/nf-tts/CLAUDE.md` |
| `nf-guide` | AI agent 工具链分发器（clips / produce / audio / script …） |
| `nf-recorder` | 外驱 runtime + 像素采样 → MP4（含时间切片并行） |
| `nf-shell` | 跨平台桌面壳（wry + tao · macOS / Windows / Linux） |
| `nf-shell-mac` | macOS 专属旧路径（保留历史 · 详见 roadmap history） |
| `nf-publish` | 发布器（douyin / bilibili / youtube / wechat） |

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

## tmp / 临时文件

临时产出一律写项目根 `tmp/`，禁写系统 `/tmp`。已进 `.gitignore`。

## 跨会话通讯

见 `~/.claude/rules/project-brain.md`（读写闭环）+ `commit-format.md`（提交格式）。新会话先读 git log + `spec/versions/v{current}/` + DESIGN.md，做完必须写回。
