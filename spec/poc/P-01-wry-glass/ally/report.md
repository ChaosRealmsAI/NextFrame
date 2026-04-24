---
agent: ally-gpt
topic: wry WebView 玻璃质感跨 macOS
affects_scenarios: [S-01, S-07, S-08, S-09, S-10, S-11]
date: 2026-04-21
duration_min: 42
status: partial
---

## 结论

wry 默认 WKWebView 对 `editor-v0.1.html` 的 topbar 区域与 Safari baseline 像素一致，核心玻璃 CSS、aurora、grain 和 60fps 滚动通过；透明无边框路径可渲染并与 baseline 差异 0.50%，但透明路径指标回传未跑通，且本机是 macOS 26.0，不等同 macOS 15/14 覆盖。

## 数字

| 指标 | 期望 | 实测 | 过 |
|---|---:|---:|---:|
| pixel diff: Safari vs wry default | < 1% | 0.000% | ✓ |
| pixel diff: Safari vs wry transparent | < 1% | 0.500% | ✓ |
| FPS: wry default 1000 RAF scroll frames | ≥ 57 | 60.08 | ✓ |
| aurora 层数 | 4 | 4 | ✓ |
| SVG grain + blend mode | SVG + overlay | true + overlay | ✓ |
| `.topbar` background | rgba(10,10,14,.65) | `rgba(10, 10, 14, 0.65)` | ✓ |
| glass blur computed style | blur(50px) saturate(1.5) | `.app`, not `.topbar` | ✓ |
| macOS 14/15 | 跑通 | 未覆盖；本机 macOS 26.0 | ✗ |

截图文件大小:

| 文件 | bytes |
|---|---:|
| `screenshots/baseline-topbar.png` | 28,932 |
| `screenshots/wry-default-topbar.png` | 28,839 |
| `screenshots/wry-transparent-topbar.png` | 33,067 |

Computed style 摘要来自 `metrics/wry-default.json`: `.topbar` 背景为 `rgba(10, 10, 14, 0.65)`；`.topbar` 自身 `backdrop-filter` 为 `none`，因为原型把 `blur(50px) saturate(1.5)` 放在 `.app` shell 上；`.app` 的 `-webkit-backdrop-filter` 返回 `blur(50px) saturate(1.5)`。

## 截图

![Safari baseline](screenshots/baseline-topbar.png)

![wry default](screenshots/wry-default-topbar.png)

![wry transparent](screenshots/wry-transparent-topbar.png)

## 代码片段

```rust
let mut builder = WebViewBuilder::new()
    .with_url(file_url(Path::new(EDITOR_HTML))?)
    .with_initialization_script(transparent_init_script(transparent))
    .with_on_page_load_handler(move |event, _| {
        if measure_on_load && matches!(event, PageLoadEvent::Finished) {
            let _ = load_proxy.send_event(UserEvent::RunMeasure);
        }
    })
    .with_document_title_changed_handler(move |title| {
        if let Some(body) = title.strip_prefix("NFPOC:") {
            let _ = title_proxy.send_event(UserEvent::Ipc(body.to_string()));
        }
    });

if transparent {
    builder = builder.with_transparent(true);
}
```

```js
const bodyBefore = getComputedStyle(document.body, '::before');
const bodyAfter = getComputedStyle(document.body, '::after');
const appStyle = getComputedStyle(document.querySelector('.app'));
// 1000 requestAnimationFrame ticks scroll document.scrollingElement.
document.title = 'NFPOC:' + JSON.stringify({
  app: { webkitBackdropFilter: appStyle.webkitBackdropFilter },
  aurora: { layerCount: (bodyBefore.backgroundImage.match(/radial-gradient/g) || []).length },
  grain: { hasSvgNoise: bodyAfter.backgroundImage.includes('data:image/svg+xml'), mixBlendMode: bodyAfter.mixBlendMode },
  scroll: { frames, elapsedMs, fps: frames * 1000 / elapsedMs }
});
```

## 踩坑

- crates.io 当前稳定版是 `wry 0.55.0` / `tao 0.35.0`，不是 prompt 中旧的 `0.37` / `0.27`。
- `window.ipc.postMessage` 在本机 WKWebView 路径中未回传；`evaluate_script_with_callback` 也没有等待 Promise 完成。最终默认路径用 `document.title` 作为紧凑 metrics 回传桥。
- 透明无边框窗口截图可渲染，但 `document_title_changed` metrics 桥在 transparent path 超时；透明路径只保留截图和 pixel diff。
- `screencapture` 在 Retina 屏输出 2x PNG；三个 topbar PNG 都是 1552x92。

## 建议 build 方案

Phase 4 可以采用 `wry = "0.55.0"` + `tao = "0.35.0"`，默认窗口路径可直接承载现有 `editor-v0.1.html` 视觉。产品代码里不要用 title 传 metrics；应接 NextFrame 自己的 command/event bus，或另建稳定 native bridge。

透明模式建议先作为可选实验开关:

```rust
WindowBuilder::new()
    .with_decorations(false)
    .with_transparent(true);
WebViewBuilder::new()
    .with_transparent(true)
    .with_initialization_script("document.documentElement.classList.add('nf-transparent-webview')");
```

CSS 上保持玻璃 blur 在 `.app` shell 层；如果 BDD 明确抽 `.topbar` 的 `backdrop-filter`，需要同步更新断言或把 blur 规则移到 `.topbar`。
