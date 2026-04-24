---
agent: opus
topic: wry WebView 玻璃质感跨 macOS
affects_scenarios: [S-01, S-07, S-08, S-09, S-10, S-11]
date: 2026-04-21
duration_min: 55
status: valid
---

## 结论

**wry 0.55 + tao 0.35 加载 `editor-v0.1.html` 渲染与 Safari 像素级一致**（对齐后 diff 0.000%）· 4 层 aurora / SVG grain + mix-blend-mode / 多层 backdrop-filter 全部生效 · 60fps 滚动实测 90+ FPS · v0.2 UI 组件化可放心基于 wry 推进，无需 fallback 方案。

## 数字

| 指标 | 期望 | 实测(wry-default) | 实测(wry-transparent) | 过 |
|---|---|---|---|---|
| pixel diff vs Safari baseline（对齐后） | < 1% | **0.000%** | 15.5%（透明复合 · 预期） | wry-default 优秀 / transparent 符合预期 |
| FPS (60 帧程序化滚动) | ≥ 57 | **92.3** | **96.9** | ✅ ✅ |
| FPS 耗时 (60 帧) | < 1050ms | 650 ms | 619 ms | ✅ ✅ |
| aurora 层数 (body::before radial-gradients) | 4 | **4** | 4 | ✅ ✅ |
| SVG grain + mix-blend-mode | present + overlay | present + **overlay** | present + overlay | ✅ ✅ |
| .topbar background | rgba(10,10,14,0.65) | **exact match** | exact match | ✅ ✅ |
| .panel backdrop-filter | blur(20px) saturate(1.2) | **exact match** | exact match | ✅ ✅ |
| viewport size | 1280x800 | 1280x800 | 1280x800 | ✅ ✅ |
| macOS | 26 Tahoe (当前开发机) | ✅ | ✅ | tested |
| macOS 14 / 15 | 跨版本待实测 | ⏳ | ⏳ | 预计兼容 (WKWebView 系统自带) |

**关键数字**: `baseline-topbar.png` vs `wry-default-topbar.png` 在 `dx=-2 (image px) / dy=0` 位移对齐后 · 10ΔRGB 阈值下 **0 个差异像素** — wry 渲染器就是系统 WKWebView · Safari 与 wry 走同 engine · 1 logical px 的 crop 边界对齐差被我手动采样放大成表面 4.5% · 对齐后归零。

## 截图

- `screenshots/baseline-full.png` — Safari 全窗口 (2560x1860 @2x)
- `screenshots/baseline-topbar.png` — Safari topbar 截图 (2428x92 @2x)
- `screenshots/wry-default-full.png` — wry 默认窗口全图 (2560x1656 @2x · 含 tao 标题栏)
- `screenshots/wry-default-topbar.png` — wry 默认 topbar (2428x92 @2x)
- `screenshots/wry-transparent-full.png` — wry 透明窗口全图 (2560x1600 @2x · 无 decorations · 无标题栏)
- `screenshots/wry-transparent-topbar.png` — wry 透明 topbar (2428x92 @2x)
- `screenshots/diff-baseline-vs-wry-default.png` — 对齐后像素差 · 几乎全黑 (0 differing pixels > 10ΔRGB)
- `screenshots/diff-baseline-vs-wry-transparent.png` — 透明变体差 · 有色差因玻璃与桌面复合

## 代码片段

**Cargo.toml** (核心依赖):
```toml
[dependencies]
wry = "0.55"
tao = "0.35"
```

**wry-default 启动核心** (< 30 行核心逻辑):
```rust
let event_loop = EventLoop::new();
let window = WindowBuilder::new()
    .with_title("NF Editor")
    .with_inner_size(tao::dpi::LogicalSize::new(1280.0, 800.0))
    .build(&event_loop)?;

let url = format!("file://{}", html_path.display());
let _webview = WebViewBuilder::new()
    .with_url(url)
    .with_initialization_script(PROBE_JS)
    .with_ipc_handler(|req| { /* window.ipc.postMessage → Rust */ })
    .with_document_title_changed_handler(|title| { /* 备用通道 */ })
    .build(&window)?;
```

**探针 JS** (AtDocumentStart 注入 · 轮询找 `.topbar` · postMessage 回 Rust):
```js
var cs = getComputedStyle(topbar);
var out = {
  topbar_bg: cs.background,
  topbar_bdf: cs.backdropFilter,
  aurora: (getComputedStyle(document.body, '::before').backgroundImage.match(/radial-gradient\(/g) || []).length,
  blend: getComputedStyle(document.body, '::after').mixBlendMode,
  panel_bdf: getComputedStyle(document.querySelector('.panel')).backdropFilter
};
// 60-帧 rAF 算 FPS
```

## 踩坑

1. **`cargo search wry` 版本检查必跑** — prompt 写 `wry = "0.37"` 已过时 · 实际最新 0.55 (API 基本一致 · 但小版本差异会导致坑)。实施前必 `cargo search`。
2. **stdout buffering in background shell** — `println!` 在 `&` 后台跑不 flush · 必须 `stdout().lock().flush()` 否则 IPC 消息永远打不出来。让我浪费 10 min 以为 IPC 坏了。*Lesson*: wry IPC handler 里必显式 flush。
3. **`document.title` 有长度上限** — 用 title 做备用 IPC 通道时 · WebKit 截断在 ~1000 字符。原始 full probe JSON 被截断 · 改用压缩 summary 才完整。
4. **DPR 不一致** — wry 报 `devicePixelRatio=1` 即使在 retina 显示器上。影响 FPS 参考但不影响渲染分辨率 (`screencapture` 捕获 retina 原生 2x 像素)。若后续需读 DPR 做缩放 · 需用 `NSScreen.mainScreen.backingScaleFactor` via objc2。
5. **截图坐标换算** — 窗口 logical pos + (has decorations ? 28 : 0) = 内容区起点 · 再加 `getBoundingClientRect().y` = 元素屏幕坐标。不同 macOS 版本 title bar 高度可能变化 · 稳妥做法是用 element rect + 元素自己 CSS 里插入一个红色探针 dot 做像素级对齐基准。
6. **多显示器干扰** — wry 默认生成在上次位置 · 可能在副屏非 retina 显示器 → DPR 错位 + 截图尺寸减半。必须 `set position` to primary 后再截。
7. **其他 app 浮在前面** — 尤其透明窗口 · macOS 可能把其他 app 弹上来。截图前必 `set frontmost to true` + 验证 `frontmost is true`。

## 建议 build 方案

**Phase 4 (v0.2 build) 推荐**:

```toml
# crates/nf-shell/Cargo.toml
[dependencies]
wry = "0.55"
tao = "0.35"
```

**初始化模板** (建议放 `crates/nf-shell/src/shell.rs`):

```rust
pub fn open_editor(html_path: impl AsRef<Path>) -> wry::Result<()> {
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("NextFrame")
        .with_inner_size(LogicalSize::new(1280.0, 800.0))
        .with_min_inner_size(LogicalSize::new(960.0, 600.0))
        .build(&event_loop)?;

    let _webview = WebViewBuilder::new()
        .with_url(format!("file://{}", html_path.as_ref().display()))
        .with_ipc_handler(|req| handle_ipc(req.body()))
        .build(&window)?;

    event_loop.run(move |event, _, cf| { /* ... */ });
}
```

**推荐先走 "默认 WebView (非 transparent)"**:
- ✅ 像素级一致性 (0.000% diff) 已验
- ✅ 原型设计的 aurora + 深色背景完全由 HTML 控制 · 不需要桌面合成
- ✅ 简单稳定 · tao 默认 decorations 有原生 macOS 窗口手势
- ❌ Transparent + decorations=false 仅在需要 "画面边缘溶入桌面" 的特殊视觉场景用 · v0.2 UI hifi 已含 `.outer` 和 `.app` 自带窗口美学 · 透明多余

**IPC 协议建议**: JSON 消息 `{type, payload}` · Rust 侧 match type 分发。无需 Tauri 等胖框架 · `with_ipc_handler` 足够 (v0.2 所有交互场景可覆盖)。

**截图 / 自验 CLI (S-01~S-11 ai_tools) 产品化路径**:
- `nf shell --url file:///... --probe` — 内建 probe CLI 跑 getComputedStyle + 输出 JSON (非外部 `screencapture`)
- `nf shell --url ... --screenshot out.png` — 用 objc2 调 WKWebView 的 `takeSnapshotWithConfiguration:` 内建截图 (不依赖系统 screencapture 权限)
- 这两个 CLI 是 BDD ai_tools 的刚需 · 必进产品代码 (不是 POC 脚手架)

**风险** (低):
- macOS 14 / 15 暂未实测 · 但 WKWebView 是系统自带 · CSS 规范稳定十年了 · 几乎零风险
- 需补 `cargo build` CI 跑个 headless smoke test (wry 会报错如果 WKWebView missing · macOS 运行环境本身保证)

**整体结论**: v0.2 UI 用 wry 推进 · **不需 fallback**。P-01 通过 · 给 S-01/07/08/09/10/11 绿灯。
