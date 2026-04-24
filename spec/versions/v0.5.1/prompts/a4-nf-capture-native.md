# A4 · `nf capture` · 产品内建**整窗截图**(含 macOS chrome)

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4`(基于 v0.5.0-299177e4 · 已在改 drag + inset)

**背景(为啥要)**:

- `nf screenshot` 是 webview 内 DOM render 截图 · 不含 macOS 窗口 chrome(traffic light / titlebar / window shadow)
- charter P9 + self-verification rule 硬约束:**验证能力内建进产品 · 禁调系统 screencapture**(那是人类工具 · AI 在 CI / 无 GUI session 都用不上)
- v0.5.1 要验 traffic light 居中对齐 + 可拖拽 · **必须能截出真窗口外观**(含 chrome)· 当前只能靠 `screencapture` 系统命令 · 违 rule
- AI 每版本都要能"肉眼"对比视觉 · 这是基建能力 · 一次做好后续所有版本受益

## 目标

新加 CLI:

```sh
nf capture --project=X --episode=Y --out=path.png [--window-id=w-1]
```

行为:
- 找到 nf-shell 当前窗口(默认 focused · 或按 `--window-id` 指定)
- 通过 macOS CoreGraphics **`CGWindowListCreateImage`** 抓整窗 bitmap(含 chrome:traffic light · titlebar · shadow)
- 编码 PNG 写 `--out`
- 返 JSON `{"out":"path.png","bytes":N,"width":W,"height":H,"window_id":"w-1","window_number":NNN}`
- 退出 0 · 失败 JSON error + exit 非 0

## 干啥

### Step 1 · 加依赖(Cargo.toml workspace)

`[workspace.dependencies]` 加:
```toml
objc2 = { version = "0.5", optional = true }
objc2-foundation = { version = "0.2", optional = true }
objc2-app-kit = { version = "0.2", optional = true }
objc2-core-graphics = { version = "0.2", optional = true }
objc2-image-io = { version = "0.2", optional = true }
```

若 crate 版本 API 跟这些不上 · 查 docs.rs 最新版本的 `CGWindowListCreateImage` binding。备选:用 raw `extern "C"` FFI + `core-graphics = "0.24"` + `core-foundation`。

`[target.'cfg(target_os = "macos")'.dependencies]` 在 `crates/nf-shell/Cargo.toml` 声明 · 非 macOS 该 CLI 返"unsupported platform"。

### Step 2 · `crates/nf-shell/src/capture.rs`(新文件)

```rust
#[cfg(target_os = "macos")]
pub fn capture_window_by_number(window_number: u32, out: &Path) -> Result<CaptureResult, String> {
    use objc2_core_graphics::{CGWindowListCreateImage, CGRect, CGPoint, CGSize};
    // 或走 extern "C" FFI 若 objc2-core-graphics API 不匹配

    // 1. CGRectNull → use window's own bounds
    let rect = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(0.0, 0.0));

    // 2. options: kCGWindowListOptionIncludingWindow(1 << 3)
    // 3. flags: kCGWindowImageBoundsIgnoreFraming(1 << 0) · NOT set 以包含 shadow
    //           kCGWindowImageBestResolution(1 << 1) · retina 抓原分辨率
    let flags = 0u32 | (1 << 1); // best resolution · 不忽略 framing

    let image = unsafe {
        CGWindowListCreateImage(rect, 1 << 3, window_number, flags)
    };
    if image.is_null() { return Err("capture returned null".into()); }

    // 4. Encode PNG via CGImageDestination · save to out
    // ...
}
```

不用 objc2-core-graphics 的话可走:

```rust
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCreateImage(
        rect: CGRect,
        list_option: u32,
        window_id: u32,
        image_option: u32,
    ) -> *mut CGImageRef;
}
```

### Step 3 · 找 window_number(macOS 原生 ID · 区别于 nf 的 "w-1" 逻辑 ID)

在 `window_manager.rs` 或 `webview.rs` 里 · 建窗口后拿:

```rust
use tao::platform::macos::WindowExtMacOS;
let ns_window: *mut std::ffi::c_void = window.ns_window();
// ns_window 是 NSWindow 指针 · call [ns_window windowNumber]
```

存到 `WindowManager` 里 `window_numbers: HashMap<String, u32>`(逻辑 ID → native number)。

### Step 4 · IPC op · `CaptureWindow`

`events.rs` 加:
```rust
CaptureWindow {
    request: IpcRequest,
    ack: oneshot::Sender<IpcResponse>,
}
```

`handlers/app.rs`(或新建 capture handler)加 `capture_window(manager, req, ack)`:
1. 从 req.params 拿 project/episode/window_id · 用 manager.window_numbers 查 native number
2. 调 `capture::capture_window_by_number(number, &out)`
3. 返 JSON `{out, bytes, width, height, window_id, window_number}`

`ipc_server.rs` dispatch 加 `"capture"` op → `UserEvent::CaptureWindow`
`main.rs` event loop 加 match arm。

### Step 5 · CLI 子命令

`crates/nf-cli/src/commands/mod.rs` 加:

```rust
#[derive(Debug, Args)]
pub struct CaptureArgs {
    #[arg(long, help = "Project slug")]
    pub project: String,
    #[arg(long, help = "Episode slug")]
    pub episode: String,
    #[arg(long, help = "Output PNG path", value_name = "PATH")]
    pub out: PathBuf,
    #[arg(long, help = "Window ID (default: focused)")]
    pub window_id: Option<String>,
}
```

主 CLI enum 加 `Capture(CaptureArgs)` · dispatch 走 IPC。

### Step 6 · 单测 + e2e

单测:
- `capture_png_magic_bytes` · capture 产出文件 header 是 `\x89PNG`
- `capture_missing_window` · 不存在 window_id 返 error

e2e:
- 启 nf-shell + create project/episode + open + `nf capture --out=tmp/cap.png`
- `file tmp/cap.png` 必 PNG · 宽高 ≥ 1440x900(含 chrome 会稍多)
- 用 Python PIL 或 `sips -g pixelWidth -g pixelHeight` 验尺寸

## 硬约束

- 不靠 `screencapture` 系统命令 · 内建 CoreGraphics
- 非 macOS 平台该 CLI 报 "unsupported platform" + exit · 不影响 workspace 其他 crate
- clippy deny unsafe_op_in_unsafe_fn OK · `unsafe` 块带 `// SAFETY:` 注释
- 保留现有 `nf screenshot`(DOM 截图 · 留作 WC pixel regression 用)· 不改
- 时间预算 60-90min

## 验收

- `cargo check/clippy --workspace -- -D warnings` 零 warning
- `cargo test --workspace --lib` · 26 → 28 pass(+2 capture tests)
- `cargo build --release --bins`
- **真 e2e**(ally 自跑):
  ```sh
  HOME="$PWD/tmp/a4" ./target/release/nf-shell &
  HOME="$PWD/tmp/a4" ./target/release/nf projects create --slug=a4-demo --name='A4'
  HOME="$PWD/tmp/a4" ./target/release/nf episodes create --project=a4-demo --slug=ep-01 --duration=10
  HOME="$PWD/tmp/a4" ./target/release/nf open --project=a4-demo --episode=ep-01
  HOME="$PWD/tmp/a4" ./target/release/nf capture --project=a4-demo --episode=ep-01 --out=tmp/a4-cap.png
  file tmp/a4-cap.png  # 必 PNG · width ≥ 1440(逻辑)or ≥ 2880(retina 2x)
  sips -g pixelWidth -g pixelHeight tmp/a4-cap.png
  ```
- 主 agent 拿 PNG `Read` 肉眼验:窗口左上角看到红黄绿 3 圆按钮 + 阴影 + topbar 内容 · 不是纯 webview content

## 产出

- `A4-REPORT.md` · 改了哪些文件 + capture 实现要点(FFI / objc2 选哪条)+ e2e 输出 + PNG SHA-256
- `tmp/a4-cap.png`(示例截图 · 主 agent 亲 Read 验)
- NO git commit(主 agent 统一)
