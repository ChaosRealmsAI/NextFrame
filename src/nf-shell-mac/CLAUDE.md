# nf-shell-mac (v2.0, skeleton)

**macOS 原生桌面壳**。Rust (objc2 + AppKit + WebKit)。

## 4 面板布局

```
┌──────────────────────────────────────────────┐
│  顶部操作栏（播放/暂停/导出/模式切换）       │  ← NSToolbar
├────────────────────────┬─────────────────────┤
│                        │  右参数面板         │
│   左预览（WebView）    │  (selected track    │
│   play / edit 模式     │   的 keyframes +    │
│                        │   params 编辑)      │
│                        │                     │
├────────────────────────┴─────────────────────┤
│  底部图形化多轨时间线（拖拽 + keyframe 点）  │
└──────────────────────────────────────────────┘
```

## 核心职责

- 装 WKWebView 跑 `nf-runtime`（play + edit 模式）
- 加载 `source.json` + tracks → 通过 `nf-core-engine` 编译 → WebView 吃 `resolved`
- 底部时间线是 Native 绘制（不在 WebView 里）— 精确拖拽性能
- 选中 track → 右面板读 track 的 `describe()` schema 动态渲染表单
- 右面板改值 / 时间线拖动 → 回写 `source.json` + 通知 WebView 刷新

## 边界

- ❌ 不做渲染（WebView 做）
- ❌ 不做编码（nf-recorder 做）
- ✅ 管窗口、菜单、键盘快捷键、拖拽面板 resize
- ✅ 暴露 `--screenshot` / `--eval-script` 给 AI 自验证

## 骨架阶段

- `Cargo.toml` + `src/lib.rs` + `src/main.rs` 占位
- 后续逐步加 window / toolbar / webview / timeline 面板

**骨架阶段仅占位，暂不依赖 objc2 — 保持编译零依赖最小壳。**
