# POC P-01 · wry WebView 玻璃质感跨 macOS

**课题**: wry + tao 用系统 WKWebView 渲染 · `backdrop-filter: blur(50px) saturate(1.5)` + 多层 aurora radial-gradient + SVG grain noise + mix-blend-mode 能否跟 Safari 打开 `editor-v0.1.html` 像素级一致?macOS 14 Sonoma + macOS 15 Sequoia 都能跑吗?60fps 滚动不卡顿?

**背景 + affects_scenarios**: v0.2 UI 视觉 === hifi editor-v0.1.html(S-07 topbar / S-08 clips / S-09 log / S-10 timeline / S-11 inspector 共 5 visual scenarios)· S-01 启动也含整 UI 渲染。若 wry WebView 不能 100% 还原 · 所有 visual BDD 挂 · 组件化白做。这是 v0.2 最大技术风险。

## 方案要求

**对比 3 种渲染路径**(每种产一张截图 + 文件大小 + 关键 computed-style 抽取):

1. **Baseline**: `open -a Safari spec/design/prototypes/editor-v0.1.html` + playwright 抓 topbar 区域截图 → `baseline-topbar.png`
2. **wry 默认**: Rust binary · `wry::WebViewBuilder::new(window).with_url("file://...")` 加载同一 HTML · tao window 840x640 · 截 window 内容 · `wry-topbar.png`
3. **wry + transparent**: `wry::WebViewBuilder::new(window).with_transparent(true).with_initialization_script("...")` · tao window decorations=false · 页面再套一层 window-chrome mockup · 看玻璃外观是否更通透

**工具**:
- `pixelmatch baseline-topbar.png wry-topbar.png diff.png 0.05` → 差异像素数(期望 < 1% · 容忍字体 hint)
- 抽 `.topbar` computed-style:`background`(期望含 `rgba(10, 10, 14, 0.65)` 或等价)· `backdrop-filter`(期望含 `blur(50px)` 或 macOS 系统实现值)
- SVG grain noise:`body::after` 的 `mix-blend-mode: overlay` 能否生效(检查 getComputedStyle)
- FPS 测:`requestAnimationFrame` 滚动 body · 计 60 frame 总耗时 · 期望 < 1050ms(即 ≥ 57fps)

## 实施步骤

1. 在你独立 worktree 里(`.worktrees/v0.2-poc-P-01-{opus|ally}`)建 Rust cargo proj:`cargo new poc-wry-glass` or 复用 main 仓的 `crates/nf-shell` 做实验性分支
2. `Cargo.toml` 加 `wry = "0.37"` · `tao = "0.27"` · 最新 stable 版本(检查 crates.io)
3. `src/main.rs` 写 3 个 `cargo run --bin wry-default / wry-transparent / baseline-open` 变体
4. 每次运行截图:`nf screenshot` CLI 不存在 · 用 macOS 自带 `screencapture -R x,y,w,h file.png`(POC 期允许 · 非产品代码)· 或调 Rust `xcap` crate 拿当前活动 window PNG
5. 跑 pixelmatch(`npm i -g pixelmatch-cli` 或 Rust 版)
6. 抽 computed-style 用 `WebView::evaluate_script` 跑 `getComputedStyle(document.querySelector('.topbar'))` 返结果

## 验收数字

- [ ] baseline-topbar.png vs wry-default-topbar.png · pixel diff < 1%(同 WebView 引擎 · 应该近乎 0)
- [ ] 4 层 aurora radial-gradient 都 render(不 clip 不缺)
- [ ] SVG grain noise + mix-blend-mode 生效(肉眼 + getComputedStyle 验)
- [ ] 滚动 1000 帧 · 平均 FPS ≥ 57
- [ ] macOS 15 本机跑通 · macOS 14 若无机器就记 "待跨版本验"

**若不过**: 写结论 "v0.2 需 fallback 到 CSS gradient 伪玻璃"(不用 backdrop-filter · 也保留紫色渐变)+ 风险评估。

## 输出要求

你(subagent · opus 或 ally)产出放:
- **opus 执行**:`spec/poc/P-01-wry-glass/opus/`
- **ally 执行**:`spec/poc/P-01-wry-glass/ally/`

文件:
- `report.md`(**必带 frontmatter**):
  ```
  ---
  agent: opus | ally-gpt
  topic: wry WebView 玻璃质感跨 macOS
  affects_scenarios: [S-01, S-07, S-08, S-09, S-10, S-11]
  date: 2026-04-21
  duration_min: <花的分钟数>
  status: valid | invalid | partial
  ---

  ## 结论
  (1 句话答课题)

  ## 数字
  | 指标 | 期望 | 实测 | 过 |
  |---|---|---|---|
  | pixel diff | < 1% | X% | ✓ / ✗ |
  | FPS | ≥ 57 | X | ✓ / ✗ |
  | aurora 层数 | 4 | X | ✓ / ✗ |

  ## 截图
  (3 张对比 · 插入相对路径)

  ## 代码片段
  (关键 Rust + HTML · < 50 行)

  ## 踩坑
  (版本冲突 / API 改动 / macOS 系统限制)

  ## 建议 build 方案
  (Phase 4 怎么用 · wry version + init script 模板)
  ```
- `src/`(Rust 源码 · 完整可 `cargo run`)
- 3 PNG 截图

**不许**:
- 跳过实测靠"应该可以"(ai-coding-mindset §6 违规)
- 只产文档不产可跑代码
- 装超大 CDN 依赖(保持 < 50MB 总)

**时间预期**: 30-60 min 这个 POC 应该完。超过 90 min 上报 blocker。
