# NextFrame

**AI-native video engine.** JSON in, video out. 让 AI agent 把结构化信息变成可播放视频 — 不是给人点按钮的 GUI,是给 LLM 调用的 CLI 状态机.

场景:教育 · 产品演示 · 数据报告 · 访谈切片 · 开源项目介绍. 凡是"能描述成数据"的,都能渲染出来.

## 架构分层 (Cargo workspace · 12 crates)

```
crates/
├─ 应用层 ─────────────────────────────────────────────────────────────
│  ├─ nf-cli           入口 `nf` 命令 · clap + Karaoke subcommand
│  └─ nf-shell         Mac 桌面外壳(wry + tao) · 🟡 v0.4+ 填实现
│
├─ 引擎层 ─────────────────────────────────────────────────────────────
│  ├─ nf-engine        JSON → render 核心 · frame(t, json) = pixels · 🟡 v0.4+
│  └─ nf-runtime       play/preview/export 3 模式 · 🟡 v0.4+
│
├─ Clips Pipeline ────────────────────────────────────────────────────
│  ├─ nf-source        CLI 合一入口(download/transcribe/align/cut/preview)
│  ├─ videocut-core    plan/srt/sentence/time/media/preview 共享
│  ├─ videocut-download    yt-dlp 封装
│  ├─ videocut-transcribe  whisperx 封装
│  ├─ videocut-align       脚本对齐 + 模糊匹配
│  └─ videocut-cut         ffmpeg 切片拼接
│
├─ TTS ───────────────────────────────────────────────────────────────
│  └─ nf-tts           Edge/Volcengine TTS + WhisperX 字级对齐 + karaoke.html
│
└─ Prompt 状态机 ─────────────────────────────────────────────────────
   └─ nf-guide         flows/{clips,audio,produce,script,component,design,shared}
                       AI agent 读 md 一步步执行 · 不是 CLI wrapper · 是 prompt 库
```

## 端到端 demo · 6 步 clips pipeline

从 YouTube URL 到可播放 HTML(双行字级同步字幕):

```bash
EPISODE=tmp/demo/projects/youtube/me-at-the-zoo

# Step 00 · 下载(真网络)
yt-dlp -o $EPISODE/sources/src.mp4 "https://www.youtube.com/watch?v=jNQXAC9IVRw"

# Step 01 · 转写(whisperx 词级)
whisperx $EPISODE/sources/src.mp4 --output_dir $EPISODE/sources/ --output_format json

# Step 02 · 规划 highlight(AI agent 自己读 sentences.json 挑 + 写 plan.json)
cat crates/nf-guide/flows/clips/02-plan.md  # 给 AI 的 prompt

# Step 03 · ffmpeg 切
# Step 04 · LLM 翻译(AI agent 自己翻 · 算字级时间)
# Step 06 · 生成 index.html(clips pipeline 终点)
cargo run -p nf-cli -- karaoke $EPISODE
open $EPISODE/clips/index.html   # sidebar 切 + video 控件 + 双行字幕 + 字级高亮
```

**完整指南**: 每步读 `crates/nf-guide/flows/clips/0N-*.md` · AI agent 按 prompt 跑 bare CLI.

## AI 视角: "以 CLI 为本" 为啥

- **弱模型盲测过** — Claude Haiku 4.5 按 prompt md 6 步无 stumble 跑通(端到端 19 min)
- **每步 self-contained** — 输入输出 JSON · 下游不需懂上游实现
- **产品代码内建自验** — `nf karaoke` 产物合规即 exit 0 · 不靠外部工具
- **lint-denied** — workspace 禁 `unwrap/expect/panic/unreachable/todo/wildcard_imports` · AI 写不出烂代码

## 开发

```bash
# 检查全 workspace
cargo check --workspace
cargo clippy --workspace --all-targets   # lint deny 必过

# 跑全链 demo
cargo run -p nf-cli -- karaoke tmp/haiku-clips-v3/projects/youtube/me-at-the-zoo-v3
```

**toolchain**: rustc 1.86+ · edition 2024.

## 版本进度

看 `git log --oneline -30` + `spec/roadmap.json` + `spec/devlog/`.  CLAUDE.md 不记版本日志(rule `self-evolution-dna`).

**当前**: v0.3.0 done (归档 3 模块迁入 + clips 6 步打通 + haiku v3 盲测通过). 下版 v0.4.0 draft = JSON 引擎 + frame pure.

## License

MIT(code) · UNLICENSED(归档参考代码 · reference/ 仅本地不入构建).
