//! Smoke test · 确认 `MacHeadlessShell` 能创建 · 加载 HTML ·
//! `call_async("return window.__testReady")` 拿到 `Bool(true)`。
//!
//! 线程模型：AppKit 强约束 main thread · cargo test 默认 harness 在 worker
//! thread 跑 · `MainThreadMarker::new()` 会 None · 故本 test 用 `harness = false`
//! + 手写 `fn main()` · 直接在二进制的 main thread 启动 NSApplication。
//!
//! 不调 evaluateJavaScript · 只 callAsyncJavaScript（FM-ASYNC）。

// 允许 test 代码使用 panic / expect · 它们是 Rust test harness 标准失败路径。
#![allow(clippy::panic, clippy::expect_used, clippy::unwrap_used)]

use std::cell::RefCell;
use std::future::Future;
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

/// No-op waker · 我们靠主动 poll + run-loop pump（call_async 内部）驱动 future。
struct NoopWaker;

impl Wake for NoopWaker {
    fn wake(self: Arc<Self>) {}
    fn wake_by_ref(self: &Arc<Self>) {}
}

/// 在 main thread block 执行 future · 靠 `call_async` 内部 pump · 不需要 executor。
fn block_on<F: Future>(mut fut: F) -> F::Output {
    // SAFETY: fut pinned to stack · 之后不 move。
    let mut fut = unsafe { Pin::new_unchecked(&mut fut) };
    let waker = Waker::from(Arc::new(NoopWaker));
    let mut cx = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(v) = fut.as_mut().poll(&mut cx) {
            return v;
        }
        // Pending → 继续 poll · call_async 自己会 pump + timeout
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
            let outcome = execute_test().map_err(|e| format!("{e}"));
            *self.ivars().result.borrow_mut() = Some(outcome);
            if let Some(mtm) = MainThreadMarker::new() {
                let app = NSApplication::sharedApplication(mtm);
                app.stop(None);
                // stop() 只置 flag · 需下一个 event 让 run loop 检测并返回 ·
                // post 一个假 NSEvent 触发（该 API 本身 safe · mtm 已校验）。
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

fn execute_test() -> Result<(), String> {
    let tmp = std::env::temp_dir().join("nf-shell-mac-smoke-bundle.html");
    let html = r#"<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<script>
window.__testReady = true;
</script>
</body></html>"#;
    std::fs::write(&tmp, html).map_err(|e| format!("write tmp html: {e}"))?;

    let shell = MacHeadlessShell::new_headless(ShellConfig {
        viewport: (800, 600),
        device_pixel_ratio: 2.0,
        bundle_url: tmp.clone(),
    })
    .map_err(|e| format!("new_headless: {e}"))?;

    shell
        .load_bundle(&tmp)
        .map_err(|e| format!("load_bundle: {e}"))?;

    let value = block_on(shell.call_async("return window.__testReady;"))
        .map_err(|e| format!("call_async: {e}"))?;

    match value {
        serde_json::Value::Bool(true) => Ok(()),
        other => Err(format!("expected Bool(true), got {other:?}")),
    }
}

fn run_smoke() {
    let mtm = MainThreadMarker::new()
        .expect("smoke test 必须在进程 main thread 跑 · cargo harness=false + 自定 main");

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
        Ok(()) => println!("test headless_shell_creates_and_loads_blank ... ok"),
        Err(msg) => {
            eprintln!("test headless_shell_creates_and_loads_blank ... FAILED");
            eprintln!("  reason: {msg}");
            std::process::exit(1);
        }
    }
}

fn main() {
    // 手写 harness · 兼容 cargo test 的 "1 passed" 输出约定。
    println!("\nrunning 1 test");
    use std::io::Write;
    let _ = std::io::stdout().flush();
    run_smoke();
    println!("\ntest result: ok. 1 passed; 0 failed; 0 ignored");
    let _ = std::io::stdout().flush();
}
