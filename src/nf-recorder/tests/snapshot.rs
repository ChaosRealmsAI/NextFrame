//! T-18 · nf-recorder snapshot 子命令 end-to-end test.
//!
//! 流程（抄 T-12 `wkwebview_async_seek` 的 harness=false 模型）：
//! 1. `NSApplication` 在 main thread 启动 · `harness = false` + 自定 `fn main`.
//! 2. 写 inline bundle（全红 body + `window.__nf.seek(t) => Promise<{t, frameReady:true, seq}>`）
//!    到 `$CARGO_MANIFEST_DIR/../../tmp/snapshot-test-bundle.html`.
//! 3. 走 `nf_recorder::snapshot::snapshot(bundle, t_ms=0, out, 1920, 1080)`.
//! 4. 读生成的 PNG · 解码 · 验中心像素 (255, 0, 0) ± 5.
//!
//! **验证点**：`snapshot()` 走真 CARenderer 路径（同 record）· 中心是红 body ·
//! PNG encoder 正确 swap BGRA → RGBA。
//!
//! harness=false 原因：WKWebView + CARenderer 只能 main thread · 标准 test harness
//! 会把 `#[test]` fn 扔到 worker thread · 立刻 fail。

// Test harness 允许 unwrap / panic / expect · 标准失败路径。
#![allow(
    clippy::panic,
    clippy::expect_used,
    clippy::unwrap_used,
    clippy::uninlined_format_args
)]

use std::cell::RefCell;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::rc::Rc;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};

use objc2::rc::Retained;
use objc2::runtime::NSObject;
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
use objc2_foundation::{NSObjectNSDelayedPerforming, NSObjectProtocol};

use nf_recorder::snapshot::snapshot;

/// No-op waker · poll 驱动靠 `call_async` 内部 run-loop pump.
struct NoopWaker;
impl Wake for NoopWaker {
    fn wake(self: Arc<Self>) {}
    fn wake_by_ref(self: &Arc<Self>) {}
}

/// 在 main thread block 执行 future · 靠 `call_async` 内部 pump.
fn block_on<F: Future>(mut fut: F) -> F::Output {
    // SAFETY: fut 固定栈上 · 不 move.
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    let waker = Waker::from(Arc::new(NoopWaker));
    let mut cx = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(v) = fut.as_mut().poll(&mut cx) {
            return v;
        }
    }
}

struct RunnerIvars {
    result: Rc<RefCell<Option<Result<(), String>>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = RunnerIvars]
    struct Runner;

    unsafe impl NSObjectProtocol for Runner {}

    impl Runner {
        #[unsafe(method(runTest))]
        fn run_test(&self) {
            let outcome = execute_snapshot_trial().map_err(|e| e.to_string());
            *self.ivars().result.borrow_mut() = Some(outcome);
            if let Some(mtm) = MainThreadMarker::new() {
                let app = NSApplication::sharedApplication(mtm);
                app.stop(None);
                // stop() 只置 flag · post 假 event 让 run loop 下一步返回.
                use objc2_app_kit::{NSEvent, NSEventType};
                let fake = NSEvent::otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2(
                    NSEventType::ApplicationDefined,
                    objc2_foundation::NSPoint::new(0.0, 0.0),
                    objc2_app_kit::NSEventModifierFlags(0),
                    0.0,
                    0,
                    None,
                    0,
                    0,
                    0,
                );
                if let Some(ev) = fake {
                    app.postEvent_atStart(&ev, true);
                }
            }
        }
    }
);

/// inline bundle · 全红 body + `window.__nf.seek(t)` 返 `{t, frameReady:true, seq}`.
///
/// 关键：`html,body { background: #ff0000 }` + `margin: 0` → 整个视口填红 ·
/// 中心像素 == (255, 0, 0)（BGRA on IOSurface · PNG encoder swap 后仍 255,0,0）.
/// `setTimeout(5ms)` 模拟 layout commit · 验 `call_async` 能真 await Promise.
const SNAPSHOT_BUNDLE_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>T-18 snapshot bundle</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ff0000; }
</style>
</head>
<body>
<script>
(function () {
  let _seq = 0;
  window.__nf = {
    seek: function (t) {
      _seq += 1;
      const seq = _seq;
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ t: t, frameReady: true, seq: seq });
        }, 5);
      });
    },
    getDuration: function () { return 1000; },
  };
  window.__testReady = true;
})();
</script>
</body></html>"#;

/// 写 bundle 到 worktree 根 `tmp/snapshot-test-bundle.html` · 返绝对路径.
fn ensure_test_bundle() -> Result<PathBuf, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR"); // …/src/nf-recorder
    let worktree_root = PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|e| format!("canonicalize worktree root: {e}"))?;
    let tmp_dir = worktree_root.join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir tmp: {e}"))?;
    let path = tmp_dir.join("snapshot-test-bundle.html");
    std::fs::write(&path, SNAPSHOT_BUNDLE_HTML).map_err(|e| format!("write bundle: {e}"))?;
    Ok(path)
}

/// 输出 PNG 路径 · `worktree-root/target/snapshot-test-t0.png`.
fn output_png_path() -> Result<PathBuf, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let worktree_root = PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|e| format!("canonicalize worktree root: {e}"))?;
    let target_dir = worktree_root.join("target");
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("mkdir target: {e}"))?;
    Ok(target_dir.join("snapshot-test-t0.png"))
}

fn execute_snapshot_trial() -> Result<(), String> {
    let bundle_path = ensure_test_bundle()?;
    let out_path = output_png_path()?;
    // Remove stale output so we know this test produced it.
    let _ = std::fs::remove_file(&out_path);

    // Run async snapshot via block_on (we're on main thread · call_async pumps run loop).
    block_on(snapshot(&bundle_path, 0, &out_path, 1920, 1080))
        .map_err(|e| format!("snapshot: {e}"))?;

    // File must exist.
    let metadata = std::fs::metadata(&out_path)
        .map_err(|e| format!("stat PNG: {e} · path={}", out_path.display()))?;
    if metadata.len() < 100 {
        return Err(format!(
            "PNG too small: {} bytes · path={}",
            metadata.len(),
            out_path.display()
        ));
    }

    // Decode PNG · verify dimensions + center pixel.
    let data = std::fs::read(&out_path).map_err(|e| format!("read PNG: {e}"))?;
    let decoder = png::Decoder::new(std::io::Cursor::new(&data));
    let mut reader = decoder.read_info().map_err(|e| format!("png header: {e}"))?;
    let info = reader.info().clone();

    if info.width != 1920 || info.height != 1080 {
        return Err(format!(
            "dimensions {}x{} != 1920x1080",
            info.width, info.height
        ));
    }
    if info.color_type != png::ColorType::Rgba {
        return Err(format!("color_type = {:?} != Rgba", info.color_type));
    }

    let mut buf = vec![0u8; reader.output_buffer_size()];
    let frame = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("png decode frame: {e}"))?;
    let bytes = &buf[..frame.buffer_size()];

    // Center pixel (960, 540) · RGBA layout.
    let cx = 1920usize / 2;
    let cy = 1080usize / 2;
    let stride = 1920usize * 4;
    let offset = cy * stride + cx * 4;
    if offset + 4 > bytes.len() {
        return Err(format!(
            "center offset {} out of bounds (buf {})",
            offset,
            bytes.len()
        ));
    }
    let r = bytes[offset];
    let g = bytes[offset + 1];
    let b = bytes[offset + 2];
    let a = bytes[offset + 3];

    let r_ok = r >= 250;
    let g_ok = g <= 5;
    let b_ok = b <= 5;
    let a_ok = a >= 250;
    if !(r_ok && g_ok && b_ok && a_ok) {
        return Err(format!(
            "center pixel = ({r},{g},{b},{a}) · expected ≈ (255,0,0,255) ±5"
        ));
    }

    println!(
        "T-18 snapshot ok · center=({},{},{},{}) · png={} bytes",
        r,
        g,
        b,
        a,
        metadata.len()
    );
    Ok(())
}

fn run_snapshot_test() {
    let mtm = MainThreadMarker::new().expect(
        "snapshot test 必须在 main thread · harness=false + 自定 main + setActivationPolicy",
    );

    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    app.activate();

    let run_result: Rc<RefCell<Option<Result<(), String>>>> = Rc::new(RefCell::new(None));

    let runner = {
        let runner = mtm.alloc::<Runner>().set_ivars(RunnerIvars {
            result: Rc::clone(&run_result),
        });
        // SAFETY: define_class 要求 super(..) init.
        let runner: Retained<Runner> = unsafe { msg_send![super(runner), init] };
        runner
    };

    // SAFETY: performSelector_withObject_afterDelay 需 main thread · mtm 已取.
    unsafe {
        runner.performSelector_withObject_afterDelay(sel!(runTest), None, 0.0);
    }

    app.run();

    let outcome = run_result
        .borrow_mut()
        .take()
        .expect("runner 必须写 outcome");

    drop(runner);

    match outcome {
        Ok(()) => println!("test snapshot_center_red ... ok"),
        Err(msg) => {
            eprintln!("test snapshot_center_red ... FAILED");
            eprintln!("  reason: {msg}");
            std::process::exit(1);
        }
    }
}

fn main() {
    // 手写 harness · 对齐 cargo test 的 "1 passed" 输出约定.
    println!("\nrunning 1 test");
    use std::io::Write;
    let _ = std::io::stdout().flush();
    run_snapshot_test();
    println!("\ntest result: ok. 1 passed; 0 failed; 0 ignored");
    let _ = std::io::stdout().flush();
}
