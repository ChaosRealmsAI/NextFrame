# A1 · Mac Traffic Light 原生对齐 + 真数据驱动 UI

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.0-299177e4`(基于 v0.2-integration 32a39252)

**目标**: 让 `nf open --project=X --episode=Y` 打开真 Mac 桌面 app · 左上角原生红黄绿 traffic light 3 按钮(关/最小化/zoom)+ 拖 topbar 移窗 + 边缘 resize · UI 真显 project/episode slug(不显硬编码 `next-frame` / `12.45`)。

## 🔴 硬铁律 · 抄 reference 稳态 · 不要自己发挥

**必读**:`reference/nf-shell-mac-v1.21/NOTE.md` 全文 · 这是**用户改过 5+ 次对齐 fix 的最终稳态方案** · 违一条必犯病。

关键:
- `with_titlebar_transparent(true) + with_title_hidden(true) + with_fullsize_content_view(true) + with_traffic_light_inset(LogicalPosition::new(18.0, 18.0)) + with_resizable(true) + with_min_inner_size(LogicalSize::new(960.0, 600.0))`
- HTML topbar `height: 48px · padding-left: 80px · -webkit-app-region: drag` · 按钮 `no-drag`
- `use tao::platform::macos::WindowBuilderExtMacOS;`(导入方法才能找到)

**参考代码**:`reference/nf-shell-mac-v1.21/main.rs:400-415` 是 builder 原文。抄过去改变量名即可。

## 干啥(3 件事 · 按序)

### Step 1 · traffic light 对齐

改 `crates/nf-shell/src/window_manager.rs`(或 `webview.rs` · 看当前代码在哪建 window):

```rust
use tao::platform::macos::WindowBuilderExtMacOS;

let window = WindowBuilder::new()
    .with_title("NextFrame")
    .with_inner_size(LogicalSize::new(1440.0, 900.0))
    .with_position(LogicalPosition::new(120.0, 80.0))
    .with_resizable(true)
    .with_min_inner_size(LogicalSize::new(960.0, 600.0))
    .with_title_hidden(true)
    .with_titlebar_transparent(true)
    .with_fullsize_content_view(true)
    .with_has_shadow(true)
    .with_traffic_light_inset(LogicalPosition::new(18.0, 18.0))
    .build(&event_loop)?;
```

### Step 2 · HTML topbar 配合

改 `frontend/nf-components/shell.css`(或各 component CSS):
- `.nf-topbar` 或等效选择器:`height: 48px · padding-left: 80px · -webkit-app-region: drag`
- 按钮/输入/链接:`-webkit-app-region: no-drag`
- **不要**设 topbar background-color(保透明 · 让 titlebar 透)
- **不要**在 HTML 里画 traffic light dots(原生的会浮在上面 · 原型里有就删)

check `frontend/nf-components/index.html` + `shell.css` 是否已有 traffic-lights 画的 HTML dots · 有就删。

### Step 3 · 真数据驱动 UI

T-18 已建 wry custom protocol `nextframe://frontend/index.html?project=X&episode=Y` + URL parse + setAttribute · **但截图看 UI 显 `project-id="next-frame"` 硬编码** · 说明某环节没通。诊断 + 修:

1. 检查 `crates/nf-shell/src/webview.rs:61` URL 构造是否真带 query params
2. 检查 `frontend/nf-components/src/index.ts:47` `URLSearchParams(window.location.search)` 在 wry custom_protocol 下是否真拿到 query(可能 wry 把 query 砍了 · 需用 hash 或 IPC 补)
3. **备方案**:如 URL search 不可用 → 开启后走 IPC postMessage · frontend 初始化时 `window.ipc.postMessage({op:'session.init'})` · rust 回 `{project,episode}` · index.ts 拿到再 setAttribute

4. 同时把 `frontend/nf-components/index.html` 里的**硬编码值清掉**:
   - `<nf-topbar project-id="next-frame" episode-id="ep-01">` → 改成空或 placeholder
   - `<nf-timeline duration="60" current-time="12.45">` → 空值 · 等 setAttribute 填
   - 或:改 HTML 成真 placeholder 骨架 · 用 JS 从 IPC 响应填

5. 组件 `nf-clips` 从 IPC 拉 clips 列表 · 渲染真 label/duration(不 mock.json)

## 硬约束

- **不加新依赖** · tao/wry 0.35/0.55 已有
- **不改 IPC 协议**(T-18 的 postMessage op 命名保留)
- **不动 CRUD handler 逻辑**(只读 IPC · 不改 projects/episodes/clips 业务)
- **保留 browser/mock 模式**(W-4 pixel regression 不破)
- 时间预算 60-90min · blocker >15min 写报告停

## 验收

- `cargo check --workspace` 零 warning
- `cargo clippy --workspace --all-targets -- -D warnings` 零 warning
- `cargo test --workspace --lib` 仍 ≥18 pass · 不退
- `frontend/nf-components && npm run check && npm run build` 过
- **真 e2e**:
  ```sh
  cd .worktrees/v0.5.0-299177e4
  cargo build --release --bins
  mkdir -p tmp/demo-home
  HOME="$PWD/tmp/demo-home" ./target/release/nf-shell &
  sleep 2
  HOME="$PWD/tmp/demo-home" ./target/release/nf projects create --slug=demo-v0.5 --name='v0.5 演示'
  HOME="$PWD/tmp/demo-home" ./target/release/nf episodes create --project=demo-v0.5 --slug=ep-01 --duration=60
  HOME="$PWD/tmp/demo-home" ./target/release/nf clips create --project=demo-v0.5 --episode=ep-01 --slug=intro --label='开场' --track=scene --start=0 --end=10
  HOME="$PWD/tmp/demo-home" ./target/release/nf open --project=demo-v0.5 --episode=ep-01
  sleep 2
  HOME="$PWD/tmp/demo-home" ./target/release/nf screenshot --project=demo-v0.5 --episode=ep-01 --out=tmp/a1-final.png
  file tmp/a1-final.png
  ```
- **probe.outerHTML 验**:screenshot 返的 `probe.outerHTML` 里 `project-id="demo-v0.5"`(不是 `next-frame`)+ `episode-id="ep-01"`
- **视觉验**(report 附一张截图 SHA + 说明):窗口左上角红黄绿可见 · topbar 左留空给按钮 · 无灰条 · 边缘可 resize(试拖右下角)

## 产出

- `A1-REPORT.md` at worktree root · 改了哪些文件 + 每 Step 证据 + e2e 输出
- NO git commit(主 agent 统一 commit)
