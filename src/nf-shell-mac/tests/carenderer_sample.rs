//! `CARendererSampler::sample` 端到端 test · 抄 POC-04B 模式。
//!
//! 流程（与 POC-04B 1:1 对齐）：
//! 1. `NSApplication::sharedApplication` + `setActivationPolicy(Prohibited)` + `finishLaunching()`
//!    → 不进 `app.run()` · 直接 inline 驱动 run-loop
//! 2. 在 main thread 创建 offscreen NSWindow（borderless · origin=(-5000,-5000)）+ WKWebView
//! 3. 加载 `<body style="background:red"></body>` · 等 navigation finish
//! 4. `CARendererSampler::new(WIDTH, HEIGHT)` · 第 1 次 warm-up · 再 5 帧稳态
//! 5. 读 IOSurface 中心像素 → 预期 (255, 0, 0)±2
//!
//! **不依赖** `MacHeadlessShell`（T-05 snapshot 留 `Err` 占位）· CARendererSampler 独立验证。
//! **不依赖** 任何 display 权限 / ScreenCaptureKit 授权（ADR-052 路径）。

#![allow(clippy::panic, clippy::expect_used, clippy::unwrap_used)]

use std::cell::RefCell;
use std::rc::Rc;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSBackingStoreType, NSColor, NSWindow,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::{
    NSDate, NSDefaultRunLoopMode, NSError, NSObjectProtocol, NSPoint, NSRect, NSRunLoop, NSSize,
    NSString,
};
use objc2_quartz_core::CATransaction;
use objc2_web_kit::{
    WKNavigation, WKNavigationDelegate, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore,
};

use nf_shell_mac::carenderer::{read_center_rgba, CARendererSampler};

/// 视口 · 跟 POC-04B 一致 · 1080p。
const WIDTH: u32 = 1920;
const HEIGHT: u32 = 1080;
const OFFSCREEN_X: f64 = -5000.0;
const OFFSCREEN_Y: f64 = -5000.0;

#[derive(Default)]
struct NavState {
    finished: bool,
    failed: Option<String>,
}

struct NavDelegateIvars {
    state: Rc<RefCell<NavState>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = NavDelegateIvars]
    struct TestNavDelegate;

    unsafe impl NSObjectProtocol for TestNavDelegate {}

    unsafe impl WKNavigationDelegate for TestNavDelegate {
        #[allow(non_snake_case)]
        #[unsafe(method(webView:didFinishNavigation:))]
        fn webView_didFinishNavigation(
            &self,
            _web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
        ) {
            self.ivars().state.borrow_mut().finished = true;
        }

        #[allow(non_snake_case)]
        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn webView_didFailNavigation_withError(
            &self,
            _web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            self.ivars().state.borrow_mut().failed =
                Some(error.localizedDescription().to_string());
        }

        #[allow(non_snake_case)]
        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn webView_didFailProvisionalNavigation_withError(
            &self,
            _web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            self.ivars().state.borrow_mut().failed =
                Some(error.localizedDescription().to_string());
        }
    }
);

/// 在 main thread 跑一次 run-loop · 等 duration。
fn pump_run_loop(duration: Duration) {
    // SAFETY: NSRunLoop::currentRunLoop / runMode_beforeDate 主线程调用 · 本 test 保证。
    unsafe {
        let run_loop = NSRunLoop::currentRunLoop();
        let date = NSDate::dateWithTimeIntervalSinceNow(duration.as_secs_f64());
        let _ = run_loop.runMode_beforeDate(NSDefaultRunLoopMode, &date);
    }
}

fn wait_for_navigation(state: &Rc<RefCell<NavState>>, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        pump_run_loop(Duration::from_millis(16));
        let guard = state.borrow();
        if let Some(err) = &guard.failed {
            return Err(format!("navigation failed: {err}"));
        }
        if guard.finished {
            return Ok(());
        }
    }
    Err("timed out waiting for navigation".into())
}

fn execute_test(mtm: MainThreadMarker) -> Result<(u8, u8, u8, f64), String> {
    // 1. offscreen NSWindow + WKWebView（抄 POC-04B）
    let frame = NSRect::new(
        NSPoint::new(OFFSCREEN_X, OFFSCREEN_Y),
        NSSize::new(f64::from(WIDTH), f64::from(HEIGHT)),
    );

    // SAFETY: NSWindow alloc + init 必须 main thread · mtm 已取。
    let window: Retained<NSWindow> = unsafe {
        msg_send![
            NSWindow::alloc(mtm),
            initWithContentRect: frame,
            styleMask: NSWindowStyleMask::Borderless,
            backing: NSBackingStoreType::Buffered,
            defer: false,
        ]
    };
    // 抄 POC-04B configure_window 全配置 · 保证 layer tree 跟 WebContent 子进程联动。
    window.setFrame_display(frame, true);
    window.setFrameOrigin(NSPoint::new(OFFSCREEN_X, OFFSCREEN_Y));
    window.setCanHide(false);
    window.setHasShadow(false);
    window.setIgnoresMouseEvents(true);
    window.setOpaque(true);
    window.setBackgroundColor(Some(&NSColor::colorWithSRGBRed_green_blue_alpha(
        1.0, 1.0, 1.0, 1.0,
    )));
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Transient,
    );

    let nav_state = Rc::new(RefCell::new(NavState::default()));
    let nav_delegate = mtm.alloc::<TestNavDelegate>().set_ivars(NavDelegateIvars {
        state: Rc::clone(&nav_state),
    });
    // SAFETY: define_class 产生的类必须用 msg_send![super(...), init] 初始化。
    let nav_delegate: Retained<TestNavDelegate> = unsafe { msg_send![super(nav_delegate), init] };

    // SAFETY: WKWebViewConfiguration / WKWebsiteDataStore 主线程构造 · mtm 已取。
    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    let store = unsafe { WKWebsiteDataStore::nonPersistentDataStore(mtm) };
    // SAFETY: setWebsiteDataStore 主线程。
    unsafe {
        config.setWebsiteDataStore(&store);
    }

    let web_view = unsafe {
        WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), frame, &config)
    };
    // SAFETY: setNavigationDelegate 主线程 · delegate 由 Retained 保活。
    unsafe {
        web_view.setNavigationDelegate(Some(ProtocolObject::from_ref(&*nav_delegate)));
    }
    web_view.setWantsLayer(true);
    window.setContentView(Some(&web_view));
    window.orderOut(None);

    // 2. 加载 red body HTML + 左上角白角标（抄 POC-04B · 让 layer tree 非空 · 中心像素保持红）
    let html = NSString::from_str(
        "<!doctype html><html><head><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}body{background:#ff0000}#corner{position:fixed;top:32px;left:32px;width:120px;height:120px;background:#ffffff;border-radius:16px}</style></head><body><div id='corner'></div></body></html>",
    );
    // SAFETY: loadHTMLString_baseURL 主线程 · html 是合法 NSString · baseURL=None 合法。
    let _nav_opt = unsafe { web_view.loadHTMLString_baseURL(&html, None) };

    wait_for_navigation(&nav_state, Duration::from_secs(10))?;
    // 额外等 1s 让 WebContent 子进程把 body 背景真画到 layer（debug build 比 release 慢）
    pump_run_loop(Duration::from_millis(1000));
    web_view.displayIfNeeded();
    CATransaction::flush();

    // 3. CARendererSampler · warm-up + 稳态 · 多帧循环直到中心像素转红（debug build 容差）
    let sampler =
        CARendererSampler::new(WIDTH, HEIGHT).map_err(|e| format!("sampler new: {e}"))?;

    let layer = web_view
        .layer()
        .ok_or_else(|| "webView.layer returned nil (setWantsLayer 未生效?)".to_string())?;

    // 最多跑 30 帧 · 抄 POC-04B · 一旦中心红就记录 "converged" 继续测稳态平均
    const MAX_FRAMES: usize = 30;
    const STABLE_FRAMES: usize = 5;
    let mut last_rgb = (0_u8, 0_u8, 0_u8);
    let mut total_ms = 0.0_f64;
    let mut stable_ms_accum = 0.0_f64;
    let mut stable_count = 0_usize;
    let mut converged = false;

    for i in 0..MAX_FRAMES {
        web_view.displayIfNeeded();
        CATransaction::flush();
        pump_run_loop(Duration::from_millis(16));
        let t0 = Instant::now();
        let handle = sampler.sample(&layer).map_err(|e| format!("sample: {e}"))?;
        let dt_ms = t0.elapsed().as_secs_f64() * 1000.0;
        total_ms += dt_ms;

        let (r, g, b, _a) = read_center_rgba(handle.as_iosurface())
            .map_err(|e| format!("read_center_rgba: {e}"))?;
        last_rgb = (r, g, b);

        let is_red = r >= 253 && g <= 2 && b <= 2;
        if is_red {
            if !converged {
                converged = true;
                eprintln!("carenderer_sample: converged at frame {i}");
            }
            stable_ms_accum += dt_ms;
            stable_count += 1;
            if stable_count >= STABLE_FRAMES {
                break;
            }
        }
    }

    if !converged {
        return Err(format!(
            "did not converge to red in {MAX_FRAMES} frames · last_center=({},{},{})",
            last_rgb.0, last_rgb.1, last_rgb.2
        ));
    }

    let avg_ms = if stable_count > 0 {
        stable_ms_accum / stable_count as f64
    } else {
        total_ms / MAX_FRAMES as f64
    };

    let (r, g, b) = last_rgb;

    // cleanup
    window.close();
    drop(sampler);

    Ok((r, g, b, avg_ms))
}

fn run_carenderer_sample_test() {
    let mtm = MainThreadMarker::new().expect("cargo test 默认单线程 · 必须 main thread");

    // 抄 POC-04B：Prohibited + finishLaunching（不进 app.run · 直接 inline 驱动）
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Prohibited);
    app.finishLaunching();

    let outcome = execute_test(mtm);

    match outcome {
        Ok((r, g, b, avg_ms)) => {
            eprintln!(
                "carenderer_sample: center=({r},{g},{b}) avg_sample_ms={avg_ms:.3}"
            );
            // ±2 tolerance · 抗 sRGB / linear 微小差异
            if !(r >= 253 && g <= 2 && b <= 2) {
                eprintln!("test sample_returns_red_center_pixel ... FAILED");
                eprintln!(
                    "  reason: expected center red (255,0,0)±2 · got ({r},{g},{b})"
                );
                std::process::exit(1);
            }
            eprintln!(
                "avg sample time: {avg_ms:.3}ms (POC-04B release baseline 0.31ms)"
            );
        }
        Err(msg) => {
            eprintln!("test sample_returns_red_center_pixel ... FAILED");
            eprintln!("  reason: {msg}");
            std::process::exit(1);
        }
    }
}

fn main() {
    // 手写 harness · 兼容 cargo test 的 "1 passed" 输出约定（对齐 headless_smoke）。
    println!("\nrunning 1 test");
    run_carenderer_sample_test();
    println!("\ntest result: ok. 1 passed; 0 failed; 0 ignored");
}
