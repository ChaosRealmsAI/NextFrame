# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI 视频引擎 — 把结构化信息变成视频。输入 JSON，输出可播放 HTML 或 4K MP4。场景不限于自媒体：教育、产品演示、数据报告、内部培训、开源项目介绍。

## 当前状态（2026-04-19）：v1.40 Track ABI v2 spec lock 完成 · v1.41/42/43 可并行

**v0.x 探索期于 2026-04-17 结束并硬重置**（commit `61d4aa0`）· v1.0 从零重启 · v1.12.5 + v1.14 recorder + v1.15 parallel-record + v1.20 wry-shell + v1.22 mp4-export 完成（见 `spec/roadmap.json history`）。

**v1.40 Track ABI v2 spec lock**（2026-04-19 done · 纯 spec · ADR-063）：
- L1/L2/L3 三级 · L1 静态（HTML/CSS/SVG · 90% Track · 现有 7 kinds 全兼容）· L2 动态（+mount/update/unmount · Canvas/WebGL/Lottie）· L3 组合（+compose 展开多子 Track）
- 禁 iframe · 保 innerHTML 单挂载 · L2 update(t) 对 t 幂等（recorder 精确复现前提）
- 11 lint gates（6 既有 + 5 新 · name/description/use_cases/level/l2-hooks-complete）
- `spec/versions/v1.40/spec-lock.html` 汇总讲透（gitignored · 本地 open）
- 契约锚点：ADR-063 · `spec/adrs.json` / `spec/interfaces.json` nf-tracks 扩 5 contract / `spec/bdd/v1.40/track-abi-v2.json` 4 场景
- 解锁：v1.41 runtime L2 调度 · v1.42 source.json v2（data/theme/$ref）· v1.43 lint gates + 老 Track 补字段 · 三分支可并行

**已有能力**（src/ 下活 crate）：
| Crate | 能力 |
|---|---|
| `nf-cli` | `nf build / validate / anchors / lint-track / schema / new` (v1.1+) |
| `nf-core-engine` | source → resolved → bundle.html 三阶段编译 |
| `nf-runtime` | browser 运行时 · boot + RAF + getStateAt · 3 模式（v1.8 扩 data-nf-persist） |
| `nf-tracks` | scene (v1.1) + chart (v1.6) + video (v1.8) Track kinds |
| `nf-tts` | **v1.12 一步到位迁移** · Edge + Volcengine + whisperX 字级对齐 · 4 产物默认（mp3+timeline+srt+karaoke.html）· 详见 `src/nf-tts/CLAUDE.md` |

**v1.12 系列完成链**：
- v1.12.0 迁 v0.8 nf-tts 4802 行
- v1.12.1 timeline 扁平 schema + flat output + workspace lints（3 并行 subagent）
- v1.12.2 karaoke.html 作为 4th 默认产物（self-contained player）
- v1.12.3 CLI help 扩成 AI-agent playbook（162 行 + 3 subcommand long_about）
- v1.12.4 sonnet 盲测找到 2 真 bug · 修 bare `--rate -10%` + DURATION ESTIMATION 表
- v1.12.5 status.done duration_ms 对齐 timeline.json (aligned vs synth-raw 统一)

**下一版 idle · 等用户 kickoff**（roadmap current: v1.14.0 idle）

**归档（本地 `.gitignore` 不进仓）**：`archive/*.tar.gz`
- `v0.x-src-final.tar.gz` · `v0.x-spec-full.tar.gz` · `v0.8-legacy.tar.gz`（nf-tts 源 · 已迁）· `v1.0-legacy.tar.gz` · `v2.0-poc-source.tar.gz`

需要参考历史：解压到 `/tmp/` · **不要**挪回主仓。

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
