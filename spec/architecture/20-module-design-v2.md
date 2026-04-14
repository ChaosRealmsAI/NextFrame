# Module Design v2 — NextFrame 全模块架构

## 总览

11 个模块，57k 行产品代码。按职责分 4 层。

```
NextFrame/
├── Cargo.toml              ← workspace 根
├── README.md
├── scripts/                ← CI/lint 脚本（不在 src/ 里）
├── spec/                   ← 规范文档
├── poc/                    ← 实验
└── src/
    ├── 应用层 ──────────────────────────
    │   ├── nf-shell/       ← macOS 桌面壳         1,356 lines  Rust
    │   ├── nf-cli/         ← Node CLI 工具        13,520 lines JS
    │   └── nf-publish/     ← 7 平台自动发布        8,989 lines  Rust+Shell
    │
    ├── 核心层 ──────────────────────────
    │   ├── nf-bridge/      ← IPC 核心逻辑          7,291 lines  Rust
    │   ├── nf-recorder/    ← 视频录制引擎          8,726 lines  Rust
    │   └── nf-tts/         ← TTS 语音合成          4,306 lines  Rust
    │
    ├── 运行时 ──────────────────────────
    │   └── nf-runtime/     ← Web 编辑器 UI         9,351 lines  JS+CSS
    │
    └── 共享库 ──────────────────────────
        └── crates/
            ├── nf-cut-core/     ← 剪辑核心类型
            ├── nf-cut/          ← ffmpeg 裁剪
            ├── nf-download/     ← yt-dlp 下载
            ├── nf-transcribe/   ← Whisper 转录
            ├── nf-align/        ← WhisperX 对齐
            └── nf-source/       ← 素材管理入口
```

## 依赖方向（单向，禁止循环）

```
应用层 → 核心层 → 共享库
         ↓
      运行时（被 shell 和 recorder 加载）
```

具体：
- nf-shell → nf-bridge（链接库）→ nf-recorder（子进程）
- nf-shell → nf-runtime（文件服务）
- nf-recorder → nf-runtime（WebView 加载）
- nf-cli → nf-shell（HTTP）
- nf-publish → 独立（macOS WKWebView）
- nf-tts → 独立（Edge/Volcengine API）
- crates/* → nf-cut-core（共享类型）

## 各模块内部结构规范

### nf-shell (1,356 lines)
```
src/nf-shell/src/
├── main.rs
├── window/         ← 窗口生命周期
├── ai_ops/         ← AI HTTP API
├── ipc/            ← bridge 桥接
└── protocol.rs     ← 文件服务
```

### nf-bridge (7,291 lines)
```
src/nf-bridge/src/
├── lib.rs          ← dispatch 路由
├── domain/         ← project/episode/segment/timeline/scene
├── storage/        ← fs/autosave/recent
├── export/         ← lifecycle/runner/recorder_bridge
├── codec/          ← ffmpeg/encoding
├── util/           ← validation/dialog/compose/path/time/preview/log
└── tests/          ← 15 个测试子模块
```

### nf-recorder (8,726 lines)
```
src/nf-recorder/src/
├── main.rs + lib.rs
├── api/            ← 公共 API + 并行子系统
├── record/         ← 主循环 setup/frame_loop/cleanup
├── encoder/        ← FFmpeg 管道
├── parser/         ← timeline/manifest/srt 解析
├── webview/        ← WKWebView 控制
├── overlay/        ← 性能叠加层
├── server/         ← HTTP 帧服务器
└── 独立文件         ← clock/capture/progress/util/parallel
```

### nf-runtime (9,351 lines)
```
src/nf-runtime/web/src/
├── core/           ← 渲染引擎 + IPC + 共享工具
│   ├── engine/     ← easing/layout/render
│   ├── shared/     ← color/font/easing
│   └── app-bundle.js
├── components/     ← 25 个场景组件
├── editor/         ← home/project/editor 页面
├── ui/             ← 通用组件
├── preview/        ← DOM 预览 + 播放控制
├── pipeline/       ← v0.4 生产线 5 阶段
└── styles/
```

### nf-tts (4,306 lines)
```
src/nf-tts/src/
├── main.rs + lib.rs
├── backend/        ← Edge(WebSocket) + Volcengine(HTTP)
├── cli/            ← clap 命令
├── queue/          ← 并发调度器
├── cache/          ← 内容寻址缓存
├── output/         ← SRT/manifest/事件
├── whisper/        ← WhisperX 对齐
└── config.rs + lang.rs
```

### nf-publish (8,989 lines)
```
src/nf-publish/src/
├── main.rs
├── commands/       ← 按类型分：navigation/tab/input/query/system
├── state/          ← tabs/persistence/session/navigation/events
├── ui/             ← window/toolbar/menu
├── keyboard/       ← shortcuts/input
├── delegates.rs
├── eval.rs
└── polling.rs
scripts/            ← 7 平台发布脚本
skills/             ← AI skill 定义
```

### nf-cli (13,520 lines)
```
src/nf-cli/src/
├── cli/            ← 34+ 命令处理器
├── scenes/         ← 50+ 场景模板
├── engine-v2/      ← 无头渲染引擎
├── effects/        ← 7 个特效
├── filters/        ← 5 个滤镜
├── transitions/    ← 4 个转场
├── targets/        ← youtube/tiktok 输出
├── views/          ← 布局预设
├── timeline/       ← 类型定义
└── ai/             ← AI 集成
```

### crates/ (2,946 lines)
```
src/crates/
├── nf-cut-core/    ← 共享类型：Sentence, CutReport, SRT 解析
├── nf-cut/         ← ffmpeg 精确裁剪
├── nf-download/    ← yt-dlp 下载
├── nf-transcribe/  ← Whisper 转录（分块防幻觉）
├── nf-align/       ← WhisperX 对齐
└── nf-source/      ← 素材管理 CLI 入口
```

## Cargo workspace 规范

所有 Rust crate 必须在 workspace members 里：
```toml
[workspace]
members = [
  "src/nf-shell",
  "src/nf-bridge",
  "src/nf-recorder",
  "src/nf-tts",
  "src/nf-publish",
  "src/crates/nf-cut-core",
  "src/crates/nf-download",
  "src/crates/nf-transcribe",
  "src/crates/nf-align",
  "src/crates/nf-cut",
  "src/crates/nf-source",
]
```

所有 crate 必须继承 workspace lint：
```toml
[lints]
workspace = true
```

## 质量门禁

| 维度 | 规则 |
|------|------|
| 产品代码 | 单文件 ≤ 500 行 |
| 测试文件 | 单文件 ≤ 800 行 |
| Clippy | 6 条 deny，零 warning |
| JS var | 零 var，全 let/const |
| console.log | 仅 bridge IPC 日志 |
| unsafe | 每处有 SAFETY 注释 |
| 依赖方向 | 单向无环 |
| 命名 | 全部 nf- 前缀 |
| CI | scripts/lint-all.sh 全过 |

## 待完成

- [ ] nf-publish 加入 workspace members
- [ ] nf-cli 内部结构审计（13k 行，最大模块）
- [ ] scenes-v2 组件去重（8 组 × 3 比例 85% 重复）
- [ ] scripts/ 从 src/ 移到根目录
