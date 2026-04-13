# Module Map — NextFrame

6 大模块，17k 行产品代码，591 commits。

## shell (Rust, 1234 lines)

macOS 桌面壳 — 窗口、WebView、AI HTTP API。

| 子模块 | 文件 | 职责 |
|--------|------|------|
| window | main.rs(23), app.rs(207) | TAO 窗口、WRY WebView、事件循环 |
| ai_ops | app_control.rs(265), appctl_script.rs(114), screenshot.rs(222) | AI HTTP API: /eval /screenshot /navigate /status |
| ipc | http.rs(96), ipc.rs(68) | HTTP 解析 + bridge IPC 桥接 |
| protocol | protocol.rs(239) | 文件服务、路由、shell 初始化脚本 |

## bridge (Rust, 3027 lines)

核心业务逻辑 — 31 个 IPC 方法。

| 子模块 | 文件 | 职责 |
|--------|------|------|
| dispatch | lib.rs(159) | method → handler 路由 |
| domain | project(96), episode(121), segment(79), timeline(36), scene(60) | 项目三级结构 + 时间线 + 场景 |
| storage | fs(261), autosave(235), recent(258) | 文件系统、自动保存、最近项目 |
| export | export(375), export_runner(170), recorder_bridge(92) | 导出任务 → spawn recorder |
| codec | ffmpeg(324), encoding(136) | FFmpeg 命令构建、编码选项 |
| util | validation(129), dialog(212), compose(118), path(38), time(50), preview(65), log(21), trace(7) | 校验、对话框、工具 |

IPC 方法 31 个：fs(8) + 项目管理(6) + 时间线(2) + 导出(4) + 自动保存(4) + 最近项目(3) + 其他(4)

## recorder (Rust, 6900 lines)

视频录制引擎 — Timeline → 帧捕获 → FFmpeg → MP4。

| 子模块 | 文件数 | 行数 | 职责 |
|--------|--------|------|------|
| core | 9 | 1969 | 主录制循环、并行协调、计划、时钟、捕获 |
| api | 5 | 984 | 公共 API + 并行子系统(cli/probe/slices/group) |
| encoder | 4 | 1261 | FFmpeg 管道、像素转换、编码设置 |
| parser | 6 | 1350 | timeline.json/manifest/SRT 解析 |
| webview | 4 | 902 | WKWebView 生命周期、JS 注入、IOSurface 截图 |
| overlay | 3 | 454 | 性能指标、时间码叠加 |
| server | 2 | 324 | 本地 HTTP 帧服务器 |

## runtime/web (JS+CSS+HTML, 5000 lines)

浏览器编辑器 UI — 运行在 WKWebView 里。

| 子模块 | 文件数 | 行数 | 职责 |
|--------|--------|------|------|
| core | 3 | 1329 | engine-v2.js 渲染引擎 + IPC 桥接 + 共享工具 |
| editor | 6 | 459 | 首页、项目列表、编辑器页面 |
| preview | 4 | 604 | DOM 渲染、播放控制、时间尺 |
| pipeline | 9 | 1013 | v0.4 生产线：脚本→配音→素材→组装→输出 |
| ui | 6 | 467 | 面包屑、导出面板、画布拖拽等通用组件 |

## scenes-v2 (JS, 1900 lines)

25 个场景组件 × 3 种比例（16:9 / 9:16 / 4:3）。

| 分类 | 组件 |
|------|------|
| 文字排版 | headline, bulletList, codeBlock |
| 数据可视化 | barChart, numberCounter |
| 卡片/UI | calloutCard, subtitleBar, featureGrid |
| 特效/背景 | auroraGradient, particleFlow, vignette |

## nextframe-cli (Node.js, ~5000 lines)

CLI 工具 — AI 唯一入口。

| 子模块 | 命令 | 职责 |
|--------|------|------|
| project | project-new/list/config, episode-new/list, segment-new/list | 三级结构管理 |
| timeline | new, validate, layer-add/move/resize/set/remove | 时间线创建和编辑 |
| render | build, preview, frame, render, scenes, lint-scenes | 打包、截图、MP4 渲染 |
| pipeline | pipeline-get, script-set/get, audio-set/get, atom-add/list/remove, output-add/list/publish | v0.4 生产线 |
| app | eval, screenshot, navigate, click, status, diagnose | AI 操控桌面端 |
| fx | effects/(7), filters/(5), transitions/(4) | 视觉特效库 |

## 跨模块依赖

```
cli --HTTP--> shell --链接库--> bridge --子进程--> recorder
                |                  |                  |
                +--文件服务-->  runtime/web  <--WebView--+
                                   |
                               scenes-v2
```
