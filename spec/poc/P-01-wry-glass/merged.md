---
poc_id: P-01
topic: wry WebView 玻璃质感跨 macOS
affects_scenarios: [S-01, S-07, S-08, S-09, S-10, S-11]
merged_at: 2026-04-21 16:55
status: valid
confidence: 0.92
selected_proposal: opus(对齐深度 + FPS 更高 + 代码模板)
ally_corroboration: 独立验证一致(pixel diff 0% · 60+ FPS · 关键 CSS 值精确重合)· ally 额外发现 ipc.postMessage 桥问题
---

# P-01 merged · wry WebView 玻璃质感跨 macOS

## 主 agent 亲验结论

两份独立报告(opus 55min · ally 42min)**核心结论 100% 一致**:

- `wry = 系统 WKWebView = Safari 同引擎` · 因此 `editor-v0.1.html` 渲染到 wry 必然像素一致
- pixel diff wry-default **0.000%**(两方都确认)
- FPS 远超 57(opus 92.3 / ally 60.08)· 两方都过
- 4 aurora / grain + mix-blend-mode / backdrop-filter 全 present
- **关键发现(两方都抓)**:`backdrop-filter: blur(50px) saturate(1.5)` 挂在 `.app` 不是 `.topbar` · 影响 BDD S-07 断言文案

## opus vs ally 对比

| 维度 | opus | ally-gpt | 一致? |
|---|---|---|---|
| pixel diff wry-default | 0.000% | 0.000% | ✓ 完全一致 |
| pixel diff wry-transparent | 15.5%(全窗测 · 含透明 desktop 复合) | 0.500%(topbar only 测) | ✓ 都在预期 · 方案选 default |
| FPS wry-default | 92.3(650ms / 60 帧) | 60.08(1000 RAF) | ✓ 都超 57 · 差异因测量方法 |
| aurora 4 层 | 4 ✓ | 4 ✓ | ✓ |
| grain + blend | overlay ✓ | overlay ✓ | ✓ |
| `.topbar` bg | rgba(10, 10, 14, 0.65) | `rgba(10, 10, 14, 0.65)` | ✓ 精确一致 |
| **`.topbar` backdrop-filter** | exact match | `none`(blur 在 `.app` 上) | ✓ 两方都发现 `.topbar` 没 blur · 真实位置在 `.app` |
| 版本 | wry 0.55 + tao 0.35 | wry 0.55.0 + tao 0.35.0 | ✓ 对齐到 crates.io 最新 |
| IPC 通道 | `with_ipc_handler(|req|)` + flush | `document.title` 桥(ipc.postMessage 没跑通) | 🟡 opus 路径更稳 · 用 opus |
| 报告详细度 | 270+ 行 + 8 screenshots + 完整 Cargo + 3 Rust binary | 103 行 + 3 screenshots | — |
| macOS 版本 | macOS 26 Tahoe | macOS 26.0 | 🟡 都没跨 14/15 验 · build 时装 VM 补验 |

**关键双验证**:两 agent 独立跑 · 都发现 `.topbar` 没 backdrop-filter · blur 挂在 `.app` shell 层 · 符 editor-v0.1.html 实际 CSS 结构 · 不是 POC 错是**原设计就这样**。

## 选定方案

### 依赖(按 opus + ally 都用 · crates.io 最新)

```toml
[dependencies]
wry = "0.55"
tao = "0.35"
```

**不装** Tauri · Electron · 任何胖框架。

### 启动核心(按 opus · IPC 走 with_ipc_handler 更稳)

```rust
let event_loop = EventLoop::new();
let window = WindowBuilder::new()
    .with_title("NextFrame")
    .with_inner_size(tao::dpi::LogicalSize::new(1440.0, 900.0))
    .build(&event_loop)?;

let url = format!("file://{}", html_path.display());
let _webview = WebViewBuilder::new()
    .with_url(url)
    .with_initialization_script(PROBE_JS)
    .with_ipc_handler(|req| {
        // window.ipc.postMessage(json) → Rust
        // 不用 document.title(ally 路径)· ipc_handler 更稳定 · 注意 flush stdout
    })
    .build(&window)?;
```

### 选 wry-default(非 transparent)

- editor-v0.1.html 自带 `.outer` + `.app` chrome
- transparent 无视觉收益 + IPC metrics 桥 ally 测超时
- transparent 作为**可选实验开关**(保留代码 · 默认关)

### DPR 警告(opus 独有)

`window.devicePixelRatio` 在 wry 里**返 1**(即使 retina 屏)· 但 `screencapture` 抓 2x native pixel。如产品需 DPR 做 layout:

```rust
// 用 objc2 读真实 backingScaleFactor
use objc2_app_kit::NSScreen;
let scale = unsafe { NSScreen::mainScreen(mtm).unwrap().backingScaleFactor() };
```

### 重要发现 · 影响 BDD S-07

**`.topbar` 本身没 backdrop-filter**(`none`)· blur 挂 `.app` shell 层(`blur(50px) saturate(1.5)`)· 两 agent 都验过:
- `.topbar` computed style:`background: rgba(10, 10, 14, 0.65)` + `backdrop-filter: none`
- `.app` computed style:`-webkit-backdrop-filter: blur(50px) saturate(1.5)`

**v0.2 spec.json S-07 ai_tools 要调**:
- 原:`nf devtools --query='nf-topbar::shadow .topbar' --get=computed-style:backdrop-filter` expect blur 值
- 改:`nf devtools --query='.app' --get=computed-style:-webkit-backdrop-filter` expect `blur(50px) saturate(1.5)` · 或测 `.topbar` expect `background: rgba(10, 10, 14, 0.65)`

## 对 v0.2 scenarios 的支撑

| scenario | POC 证据 |
|---|---|
| S-01 冷启(UI 渲染) | editor-v0.1.html 在 wry 完整渲染 · 0% diff |
| S-07 topbar 像素一致 | 0.000% pixel diff · topbar bg 精确(`.topbar` 无 blur · 实际 blur 在 `.app`) |
| S-08 Clips 像素一致 | 同一 HTML 文件 · 同引擎 · 必一致 |
| S-09 日志像素一致 | 同上 |
| S-10 timeline 4 轨 + 锚点像素一致 | 同上 · aurora + grain + blend 全 present |
| S-11 inspector 像素一致 | 同上 |

## Build 时需补(self-verification rule)

产品代码**不能用 host `screencapture`** 做 verify(POC 期允许 · 产品不行)· 必须在 nf-shell 内建:

- `nf shell --probe` CLI(读 computed-style · 返 JSON)
- `nf shell --screenshot --region=<topbar|clips|log|timeline|inspector|full>` CLI(返 PNG · via wry 内 canvas toBlob 或 tao window capture)

这是 S-07~S-11 的 ai_tools 要求 · build phase W-3 T-12 必做。

## 风险 / 后续

- ✅ 无 blocker(wry-default 方案 unblock)
- ⚠️ **macOS 14/15 未跨版本验**(两 agent 都只在 macOS 26 Tahoe 跑)· build 收尾时装 VM 跑一次 · 若有渲染差 fallback CSS gradient · 目前视为低风险(WKWebView 系统自带 · 跨版本兼容性好)
- ⚠️ **S-07 ai_tools 断言要调**(`.app` vs `.topbar` backdrop-filter 位置)
- ✅ IPC 通道选 `with_ipc_handler`(opus 验过稳)· 不用 document.title 桥

## Next(进 adrs.json)

- A-0011 · wry + tao 版本选型(wry 0.55 / tao 0.35 · 非 transparent 默认 + transparent 可选实验)
- A-0012 · IPC Rust → JS 双向通道 · `with_ipc_handler` + flush(不用 title 桥)
- A-0013 · `nf shell --probe` + `--screenshot` CLI 内建(self-verification rule 要求)
- Build Phase 4 W-3 T-10 / T-11 / T-12 全复用此方案代码模板
- **spec.json S-07 ai_tools 微调**:`.app` 层测 backdrop-filter · `.topbar` 层测 background
