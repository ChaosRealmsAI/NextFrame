//! T-12 · VP-1 第 2 部分：callAsyncJavaScript seek 10 次 pts 精确对齐。
//!
//! 流程（对齐 headless_smoke 的 harness=false 模型）：
//! 1. `NSApplication` 在 main thread 启动（`harness = false` 自定 `fn main`）
//! 2. 写 inline bundle（内置 `window.__nf.seek(t) → Promise<{t, frameReady, seq}>`）
//!    到 `$CARGO_MANIFEST_DIR/../../tmp/vp1-bundle.html`（worktree 根 tmp/）
//! 3. `MacHeadlessShell::new_headless` + `load_bundle`
//! 4. `shell.call_async("document.body.dataset.mode='record'; return true;")` 切 record mode
//! 5. 10 个 t 值逐一 `call_async("return await window.__nf.seek(t)")` · 解包 `{t, frameReady, seq}`
//! 6. 严格要求 `received_pts === expected t` AND `frameReady === true` · 10/10 pass
//! 7. 把 trials JSON dump 到 `$CARGO_TARGET_DIR(or target)/vp1-seek-trials.json`
//!
//! 只走 callAsyncJavaScript 路径（FM-ASYNC gate）· 不调 evaluateJavaScript。

// test harness 允许 unwrap / panic / expect · 标准失败路径。
#![allow(clippy::panic, clippy::expect_used, clippy::unwrap_used)]

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

use nf_shell_mac::{DesktopShell, MacHeadlessShell, ShellConfig};

/// No-op waker · 靠主动 poll + run-loop pump（call_async 内部）驱动 future。
struct NoopWaker;
impl Wake for NoopWaker {
    fn wake(self: Arc<Self>) {}
    fn wake_by_ref(self: &Arc<Self>) {}
}

/// 在 main thread block 执行 future · 靠 `call_async` 内部 pump。
fn block_on<F: Future>(mut fut: F) -> F::Output {
    // SAFETY: fut 固定栈上 · 之后不 move。
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    let waker = Waker::from(Arc::new(NoopWaker));
    let mut cx = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(v) = fut.as_mut().poll(&mut cx) {
            return v;
        }
        // Pending → 继续 poll · call_async 自己 pump + timeout。
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
            let outcome = execute_seek_trials().map_err(|e| format!("{e}"));
            *self.ivars().result.borrow_mut() = Some(outcome);
            if let Some(mtm) = MainThreadMarker::new() {
                let app = NSApplication::sharedApplication(mtm);
                app.stop(None);
                // stop() 只置 flag · post 假 event 让 run loop 下一步返回。
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

/// worktree 根 tmp/vp1-bundle.html 的 inline runtime。
///
/// `window.__nf.seek(t)` 返回 `Promise<{t, frameReady:true, seq}>` ·
/// `setTimeout(5ms)` 模拟 layout commit 异步点 · 验 callAsyncJavaScript 真能 await。
const VP1_BUNDLE_HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><title>VP-1 bundle</title></head>
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
    getDuration: function () { return 10000; },
  };
  window.__testReady = true;
})();
</script>
</body></html>"#;

/// 写 bundle 到 worktree 根 `tmp/vp1-bundle.html` · 返绝对路径。
fn ensure_test_bundle() -> Result<PathBuf, String> {
    // CARGO_MANIFEST_DIR = .worktrees/v1.14/src/nf-shell-mac
    // worktree 根 = ../../
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let worktree_root = PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|e| format!("canonicalize worktree root: {e}"))?;
    let tmp_dir = worktree_root.join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir tmp: {e}"))?;
    let path = tmp_dir.join("vp1-bundle.html");
    std::fs::write(&path, VP1_BUNDLE_HTML).map_err(|e| format!("write bundle: {e}"))?;
    Ok(path)
}

/// trials dump 到 worktree 根 `target/vp1-seek-trials.json`。
fn trials_output_path() -> Result<PathBuf, String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let worktree_root = PathBuf::from(manifest_dir)
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|e| format!("canonicalize worktree root: {e}"))?;
    let target_dir = worktree_root.join("target");
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("mkdir target: {e}"))?;
    Ok(target_dir.join("vp1-seek-trials.json"))
}

fn execute_seek_trials() -> Result<(), String> {
    let bundle_path = ensure_test_bundle()?;

    let shell = MacHeadlessShell::new_headless(ShellConfig {
        viewport: (1920, 1080),
        device_pixel_ratio: 1.0,
        bundle_url: bundle_path.clone(),
    })
    .map_err(|e| format!("new_headless: {e}"))?;

    shell
        .load_bundle(&bundle_path)
        .map_err(|e| format!("load_bundle: {e}"))?;

    // 切 record mode（对齐 BDD-v1.14-02 语义 · 虽然这版 runtime 是 inline 简化版）。
    let mode_value = block_on(
        shell.call_async("document.body.dataset.mode='record'; return document.body.dataset.mode;"),
    )
    .map_err(|e| format!("call_async set mode: {e}"))?;
    if mode_value.as_str() != Some("record") {
        return Err(format!(
            "expected body.dataset.mode='record', got {mode_value:?}"
        ));
    }

    // VP-1 十个 t 值 · 0ms 起 · 跨整个 9s 时长范围。
    let ts_list: [u64; 10] = [0, 100, 500, 1000, 1500, 2500, 3000, 4000, 5000, 8000];
    let mut trials: Vec<serde_json::Value> = Vec::with_capacity(ts_list.len());
    let mut mismatches: Vec<String> = Vec::new();

    for &t in &ts_list {
        let script = format!("return await window.__nf.seek({});", t);
        let v = block_on(shell.call_async(&script))
            .map_err(|e| format!("call_async seek({t}): {e}"))?;

        // WKWebView callAsyncJavaScript 把 JS Number 桥回为 `serde_json::Number`
        // （通常 Double 型）· 先用 as_f64 拉浮点 · 再比较。t 值是整数 ms ·
        // u64 → f64 在 2^53 以下无精度损失 · 相等比较安全。
        let received_f64 = v.get("t").and_then(|x| x.as_f64());
        let received_pts = received_f64
            .filter(|v| v.is_finite() && v.fract() == 0.0 && *v >= 0.0)
            .map(|v| v as u64);
        let frame_ready = v.get("frameReady").and_then(|x| x.as_bool()).unwrap_or(false);
        let seq = v
            .get("seq")
            .and_then(|x| x.as_f64())
            .filter(|v| v.is_finite() && v.fract() == 0.0 && *v >= 0.0)
            .map(|v| v as u64)
            .unwrap_or(0);
        let matched = received_pts == Some(t) && frame_ready;
        if !matched {
            mismatches.push(format!(
                "t={t} received_pts={:?} frame_ready={frame_ready} raw={v}",
                received_pts
            ));
        }
        trials.push(serde_json::json!({
            "t": t,
            "received_pts": received_pts,
            "frame_ready": frame_ready,
            "seq": seq,
            "match": matched,
        }));
    }

    // Dump trials JSON 到 target/vp1-seek-trials.json (Python verify 读)。
    let out_path = trials_output_path()?;
    let payload = serde_json::to_vec_pretty(&trials)
        .map_err(|e| format!("serialize trials: {e}"))?;
    std::fs::write(&out_path, &payload)
        .map_err(|e| format!("write trials {}: {e}", out_path.display()))?;

    if trials.len() != 10 {
        return Err(format!(
            "expected 10 trials, got {} · path={}",
            trials.len(),
            out_path.display()
        ));
    }
    if !mismatches.is_empty() {
        return Err(format!(
            "seek pts mismatch · {} of 10 failed:\n  {}",
            mismatches.len(),
            mismatches.join("\n  ")
        ));
    }

    println!(
        "VP-1 seek 10/10 match · trials dumped {}",
        out_path.display()
    );
    Ok(())
}

fn run_seek_test() {
    let mtm = MainThreadMarker::new()
        .expect("wkwebview_async_seek 必须在 main thread · harness=false + 自定 main");

    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    app.activate();

    let run_result: Rc<RefCell<Option<Result<(), String>>>> = Rc::new(RefCell::new(None));

    let runner = {
        let runner = mtm.alloc::<Runner>().set_ivars(RunnerIvars {
            result: Rc::clone(&run_result),
        });
        // SAFETY: define_class 要求 super(..) init。
        let runner: Retained<Runner> = unsafe { msg_send![super(runner), init] };
        runner
    };

    // SAFETY: performSelector_withObject_afterDelay 需 main thread · mtm 已取。
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
        Ok(()) => println!("test async_seek_10_trials_consistent ... ok"),
        Err(msg) => {
            eprintln!("test async_seek_10_trials_consistent ... FAILED");
            eprintln!("  reason: {msg}");
            std::process::exit(1);
        }
    }
}

fn main() {
    // 手写 harness · 对齐 cargo test 的 "1 passed" 输出约定。
    println!("\nrunning 1 test");
    use std::io::Write;
    let _ = std::io::stdout().flush();
    run_seek_test();
    println!("\ntest result: ok. 1 passed; 0 failed; 0 ignored");
    let _ = std::io::stdout().flush();
}
