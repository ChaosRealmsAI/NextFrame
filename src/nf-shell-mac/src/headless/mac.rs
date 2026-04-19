//! `MacHeadlessShell` · `DesktopShell` 的 macOS headless 实现。
//!
//! 关键合约（对齐 `spec/versions/v1.14/spec/interfaces-delta.json` v1_14_impl）：
//! - NSWindow borderless · orderOut + setFrameOrigin(-5000,-5000) · 视觉不可见
//! - WKWebView 作为 contentView · 尺寸 = `ShellConfig.viewport`
//! - 只走 `callAsyncJavaScript` · **禁** evaluateJavaScript（FM-ASYNC）
//! - `on_bridge_message` 监 `window.webkit.messageHandlers.nfBridge`
//! - `snapshot` 本 task 不实现 · 留 `Err(SnapshotFailed)` · T-06 填 CARenderer
//!
//! 线程模型：所有 WKWebView / NSWindow 调用必须在 main thread · trait 要求
//! `Send + Sync` · 我们通过 `unsafe impl` + "caller 保证 main thread" 条款实现 ·
//! v1.14 只有 recorder 单线程 driver 用它 · v1.19 若多线程需加 actor wrapper。

use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use std::cell::RefCell;
use std::rc::Rc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::{msg_send, AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSBackingStoreType, NSImage, NSWindow, NSWindowStyleMask};
use objc2_core_foundation::{CFDictionary, CFRetained, CFString, CGPoint, CGRect, CGSize};
use objc2_core_graphics::CGColorSpace;
use objc2_core_image::{CIContext, CIImage};
use objc2_foundation::{
    NSCopying, NSDictionary, NSError, NSMutableDictionary, NSNumber, NSPoint, NSRect, NSSize,
    NSString, NSURL,
};
use objc2_io_surface::{
    kIOSurfaceBytesPerElement, kIOSurfaceBytesPerRow, kIOSurfaceHeight, kIOSurfacePixelFormat,
    kIOSurfaceWidth, IOSurfaceRef,
};
use objc2_web_kit::{WKContentWorld, WKSnapshotConfiguration, WKWebView};

use crate::carenderer::CARendererSampler;
use crate::iosurface::PIXEL_FORMAT_BGRA;
use crate::webview::{create_webview, pump_main_run_loop, NavigationDelegate, ScriptHandler, WebViewEvent};
use crate::{DesktopShell, IOSurfaceHandle, ShellConfig, ShellError};

/// 单次 blocking wait 的默认超时。
/// v1.14: bumped 5s → 15s · bundle 首次 boot + runtime IIFE + body dataset 写入
/// 在 4K 纹理分配 + RAF 初始化期间能轻松超 5s。call_async 本身并不长跑 ·
/// 只是 completion handler 跟 main run loop 排队。
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);

/// bridge 消息 handler 类型别名。
type BridgeHandler = Box<dyn Fn(&str, &serde_json::Value) + Send + Sync + 'static>;

/// `MacHeadlessShell` · headless WKWebView host。
///
/// 构造路径：`new_headless` → NSWindow borderless + WKWebView contentView → orderOut +
/// 坐标 (-5000,-5000) → mpsc channel 收 navigation / script 事件。
///
/// **调用约束**：所有方法必须在 main thread 调用（AppKit / WebKit 硬约束）·
/// 对外 trait 声明 `Send + Sync` 是为了类型签名通 · 真跨线程需上层加 actor。
pub struct MacHeadlessShell {
    window: Retained<NSWindow>,
    web_view: Retained<WKWebView>,
    // 保活 · 被 controller / webview 弱引用
    _script_handler: Retained<ScriptHandler>,
    _navigation_delegate: Retained<NavigationDelegate>,
    events_rx: Mutex<Receiver<WebViewEvent>>,
    bridge_handlers: Mutex<Vec<BridgeHandler>>,
    /// (v1.14.0-1.14.3 残留) CARenderer sampler · 已不用 · snapshot 走 takeSnapshot。
    /// 保留字段是为了不破坏构造 API · 下版本清理。
    _sampler_legacy: Mutex<CARendererSampler>,

    // v1.14.4 · takeSnapshot + CIImage → IOSurface 路径（POC-B 方向 1 实证）:
    // takeSnapshot 苹果保证拿当前画面 (等 WebKit paint 完 callback) · CIContext
    // 用 Metal 后端把 CGImage render 进自己分配的 IOSurface · 下游 VT 零拷贝吃。
    /// CIContext (Metal 后端) · 一次性创建 · 每帧 render_toIOSurface。
    ci_context: Retained<CIContext>,
    /// BGRA 色域 · 一次性创建 · 每帧 render 传入。
    color_space: CFRetained<CGColorSpace>,
    /// 输出 IOSurface · 预分配 1080p BGRA · 每帧 CIContext render 重写内容。
    output_surface: IOSurfaceHandle,
    /// viewport · CIContext.render bounds 用。
    viewport: (u32, u32),
}

// SAFETY: 对外声明 Send/Sync 是为了满足 DesktopShell trait bounds · 实际调用必须在 main
// thread · v1.14 调用方（nf-recorder）单线程 driver 走 · v1.19 多线程须上 actor。
unsafe impl Send for MacHeadlessShell {}
unsafe impl Sync for MacHeadlessShell {}

impl MacHeadlessShell {
    /// 从事件 rx 拉 bridge 消息给注册的 handler。非阻塞 · 调用方在 call_async / wait 循环里轮询。
    fn drain_events(&self) {
        let rx = match self.events_rx.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        while let Ok(ev) = rx.try_recv() {
            if let WebViewEvent::BridgeMessage(value) = ev {
                // 约定：bridge 消息 payload 结构 = { "type": "<name>", ...rest }
                // `type` 字段作为 handler 的 name 参数 · 整个 value 作为 payload。
                let name = value
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_owned();
                let handlers = match self.bridge_handlers.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                for h in handlers.iter() {
                    h(&name, &value);
                }
            }
        }
    }

    /// 等 navigation finish · 带 timeout。
    fn wait_for_navigation_finished(&self, timeout: Duration) -> Result<(), ShellError> {
        let deadline = Instant::now() + timeout;
        loop {
            pump_main_run_loop(Duration::from_millis(8));
            {
                let rx = self
                    .events_rx
                    .lock()
                    .map_err(|e| ShellError::BundleLoadFailed(format!("events rx poisoned: {e}")))?;
                while let Ok(ev) = rx.try_recv() {
                    if matches!(ev, WebViewEvent::NavigationFinished) {
                        return Ok(());
                    }
                    // 其他事件丢弃（navigation 之前的 bridge 消息不该有）
                }
            }
            if Instant::now() >= deadline {
                return Err(ShellError::BundleLoadFailed(
                    "timed out waiting for navigation finish".into(),
                ));
            }
        }
    }
}

impl DesktopShell for MacHeadlessShell {
    fn new_headless(config: ShellConfig) -> Result<Self, ShellError>
    where
        Self: Sized,
    {
        let mtm = MainThreadMarker::new().ok_or(ShellError::UnsupportedPlatform)?;

        let (w, h) = config.viewport;
        // v1.14.4 · 窗口放屏幕右边外 (主屏通常 ≤ 5760px 宽 · 用户双屏也难到 20000px)
        // 替代 v1.14.0-1.14.3 的 orderOut 方案：orderOut 窗口下 takeSnapshot 只截 stage ·
        // 不截 controls + timeline (WKWebView layer tree layout 不完整 · 实测漏 playhead)。
        // 屏幕外 orderFront 窗口 WindowServer 视为 visible · 会完整 layout + paint ·
        // 用户看不见 · takeSnapshot 拿到完整 DOM。
        const OFFSCREEN_X: f64 = 20_000.0;
        const OFFSCREEN_Y: f64 = 0.0;
        let frame = NSRect::new(
            NSPoint::new(OFFSCREEN_X, OFFSCREEN_Y),
            NSSize::new(f64::from(w), f64::from(h)),
        );

        // SAFETY: NSWindow alloc + initWith... 需 main thread · mtm 已拿到。
        let window: Retained<NSWindow> = unsafe {
            msg_send![
                NSWindow::alloc(mtm),
                initWithContentRect: frame,
                styleMask: NSWindowStyleMask::Borderless,
                backing: NSBackingStoreType::Buffered,
                defer: false
            ]
        };
        window.setFrame_display(frame, false);
        window.setIgnoresMouseEvents(true);
        // SAFETY: setReleasedWhenClosed 必须 main thread · 防 close 释放 window 导致 UAF。
        unsafe {
            window.setReleasedWhenClosed(false);
        }

        let (events_tx, events_rx): (Sender<WebViewEvent>, Receiver<WebViewEvent>) = mpsc::channel();
        let (web_view, script_handler, navigation_delegate) = create_webview(mtm, frame, events_tx);

        window.setContentView(Some(&web_view));
        // v1.14.4 · orderFrontRegardless 让窗口"可见" (WindowServer 视角 · 完整 layout)
        // 但因 frame 在屏幕外 (x=20000) · 用户看不见 · 不抢焦点 (setIgnoresMouseEvents=YES)。
        // 对比 v1.14.0-3 的 orderOut: 那个让 window 不在 window list · takeSnapshot 漏 UI。
        unsafe {
            // SAFETY: AppKit 主线程调用 · mtm 已拿到。orderFrontRegardless 不抢 key/main.
            let _: () = msg_send![&*window, orderFrontRegardless];
        }

        // v1.14.0-1.14.3 残留 CARenderer sampler · 已不用 · 保留避免破坏 new_headless。
        let sampler = CARendererSampler::new(w, h)?;

        // v1.14.4 · takeSnapshot + CIImage → IOSurface 管线的一次性资源:
        // - CIContext (Metal backend 默认)
        // - BGRA CGColorSpace (跟 IOSurface BGRA 格式匹配)
        // - 预分配的 output IOSurface (w × h · BGRA · 每帧 render 重写)
        //
        // SAFETY: CIContext::context() 是 class method · 不需要 main thread。
        // CGColorSpace::new_device_rgb() 是纯 C 调用。IOSurface 通过 IOSurfaceRef::new
        // 分配 · 由内核 IOKit 服务管理 · 跨线程 thread-safe (见 iosurface.rs)。
        let ci_context = unsafe { CIContext::context() };
        let color_space = CGColorSpace::new_device_rgb()
            .ok_or_else(|| ShellError::SnapshotFailed("CGColorSpaceCreateDeviceRGB returned nil".into()))?;
        let output_surface_ref = create_output_iosurface(w, h)
            .ok_or_else(|| ShellError::SnapshotFailed("IOSurfaceCreate returned nil".into()))?;
        let output_surface = IOSurfaceHandle::from_surface(output_surface_ref);

        Ok(Self {
            window,
            web_view,
            _script_handler: script_handler,
            _navigation_delegate: navigation_delegate,
            events_rx: Mutex::new(events_rx),
            bridge_handlers: Mutex::new(Vec::new()),
            _sampler_legacy: Mutex::new(sampler),
            ci_context,
            color_space,
            output_surface,
            viewport: (w, h),
        })
    }

    fn load_bundle(&self, path: &Path) -> Result<(), ShellError> {
        // 清空旧 navigation 事件（load 前遗留）
        {
            let rx = self
                .events_rx
                .lock()
                .map_err(|e| ShellError::BundleLoadFailed(format!("events rx poisoned: {e}")))?;
            while rx.try_recv().is_ok() {}
        }

        let is_data_url = path.to_string_lossy().starts_with("data:");
        let url_str = if is_data_url {
            path.to_string_lossy().into_owned()
        } else {
            // 绝对化
            let abs = if path.is_absolute() {
                path.to_path_buf()
            } else {
                std::env::current_dir()
                    .map_err(|e| ShellError::BundleLoadFailed(format!("cwd: {e}")))?
                    .join(path)
            };
            format!("file://{}", abs.display())
        };

        let ns_url_str = NSString::from_str(&url_str);
        // SAFETY: URLWithString / NSURLRequest 需 main thread · mtm 在 new 时拿过 · 但
        // load_bundle 没 mtm · 我们用 `MainThreadMarker::new()` 重新获取（会检查）。
        let _mtm = MainThreadMarker::new().ok_or(ShellError::UnsupportedPlatform)?;
        let url = NSURL::URLWithString(&ns_url_str).ok_or_else(|| {
            ShellError::BundleLoadFailed(format!("invalid URL: {url_str}"))
        })?;

        // SAFETY: NSURLRequest::alloc + initWithURL 需 main thread · 已校验。
        let request: Retained<objc2_foundation::NSURLRequest> = unsafe {
            let alloc = objc2_foundation::NSURLRequest::alloc();
            msg_send![alloc, initWithURL: &*url]
        };

        // SAFETY: WKWebView.loadRequest 需 main thread · 返 WKNavigation? · 我们只关心副作用。
        unsafe {
            let _: Option<Retained<objc2_web_kit::WKNavigation>> =
                msg_send![&*self.web_view, loadRequest: &*request];
        }

        self.wait_for_navigation_finished(DEFAULT_TIMEOUT)?;
        Ok(())
    }

    fn call_async<'a>(
        &'a self,
        script: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value, ShellError>> + Send + 'a>> {
        Box::pin(async move {
            let mtm = MainThreadMarker::new()
                .ok_or_else(|| ShellError::JsCallFailed("not on main thread".into()))?;
            let script_ns = NSString::from_str(script);
            let arguments: Retained<NSDictionary<NSString, AnyObject>> =
                NSDictionary::from_slices::<NSString>(&[], &[]);
            // SAFETY: pageWorld 必须 main thread · mtm 已检。
            let world = unsafe { WKContentWorld::pageWorld(mtm) };

            // 共享结果容器 · block 写、poll 读。
            // 用 Arc<Mutex<..>> 因 RcBlock 的 closure 需 'static · Rc 不满足 Send。
            // 注意：block 在 main thread 触发 · 回调线程确定性 · Arc+Mutex 安全。
            let outcome: std::sync::Arc<Mutex<Option<Result<serde_json::Value, String>>>> =
                std::sync::Arc::new(Mutex::new(None));
            let outcome_clone = std::sync::Arc::clone(&outcome);

            let completion = RcBlock::new(move |result: *mut AnyObject, error: *mut NSError| {
                // SAFETY: WebKit 保证 result/error 只能其一非 null · 安全 as_ref。
                let parsed: Result<serde_json::Value, String> = unsafe {
                    if let Some(err) = error.as_ref() {
                        Err(err.localizedDescription().to_string())
                    } else if result.is_null() {
                        Ok(serde_json::Value::Null)
                    } else {
                        match Retained::retain(result) {
                            Some(obj) => objc_to_json(&obj).map_err(|e| e.to_string()),
                            None => Ok(serde_json::Value::Null),
                        }
                    }
                };
                if let Ok(mut slot) = outcome_clone.lock() {
                    *slot = Some(parsed);
                }
            });

            // SAFETY: callAsyncJavaScript_... 需 main thread · script/arguments/world 均是
            // 有效 ObjC 对象 · completion block 持 Arc 跨 ObjC 边界。
            unsafe {
                self.web_view
                    .callAsyncJavaScript_arguments_inFrame_inContentWorld_completionHandler(
                        &script_ns,
                        Some(&arguments),
                        None,
                        &world,
                        Some(&completion),
                    );
            }

            // Poll · pump run loop · 不用 tokio oneshot（tokio runtime 与 NSRunLoop 协作复杂）
            // · 直接在 main thread 上 pump + poll outcome。
            let deadline = Instant::now() + DEFAULT_TIMEOUT;
            loop {
                pump_main_run_loop(Duration::from_millis(8));
                // drain bridge 消息 · 不阻塞
                self.drain_events();
                if let Ok(slot) = outcome.lock() {
                    if slot.is_some() {
                        break;
                    }
                }
                if Instant::now() >= deadline {
                    return Err(ShellError::JsCallFailed(
                        "callAsyncJavaScript timed out".into(),
                    ));
                }
            }

            let final_result = outcome
                .lock()
                .map_err(|e| ShellError::JsCallFailed(format!("outcome poisoned: {e}")))?
                .take()
                .ok_or_else(|| ShellError::JsCallFailed("no result recorded".into()))?;
            final_result.map_err(ShellError::JsCallFailed)
        })
    }

    fn snapshot(&self) -> Result<IOSurfaceHandle, ShellError> {
        // v1.14.4 · takeSnapshot + CIImage → IOSurface (POC-B 方向 1)。
        //
        // 放弃 v1.14.0-1.14.3 的 CARenderer + N 轮 pump barrier:
        //   CARenderer 只发 CA commit 指令 · 不等 WebContent XPC 子进程真 paint 完 ·
        //   无 vsync 强同步 · barrier 8 轮也不保证拿到当前帧 (POC-C 证 off-screen
        //   无 vsync commit · FM-COMPOSITOR-COMMIT-ASYNC).
        //
        // takeSnapshot 是 Apple 官方 "等 WebKit 全栈 (layout + style + paint + composite)
        // 完成后回调" API · 保证拿当前 t 的画面。POC-A 实测 5.92ms · POC-B 方向 1
        // (CIContext.render → IOSurface) 7.38ms · 下游 VT 零拷贝吃 IOSurface。
        //
        // Flow: seek(t) → takeSnapshot 等 paint done → NSImage → CGImage → CIImage →
        //       CIContext.render_toIOSurface_bounds_colorSpace → output_surface 有
        //       当前帧像素 → clone handle 给下游 VT encoder.
        let mtm = MainThreadMarker::new()
            .ok_or_else(|| ShellError::SnapshotFailed("snapshot not on main thread".into()))?;

        // 1. takeSnapshot blocking · 等 Apple 回调 NSImage (保证当前画面).
        let ns_image = take_snapshot_blocking(&self.web_view, mtm)?;

        // 2. NSImage → CGImage (跟 POC-A/B 一致 · 使用 CGImageForProposedRect).
        let cg_image = unsafe {
            ns_image.CGImageForProposedRect_context_hints(std::ptr::null_mut(), None, None)
        }
        .ok_or_else(|| {
            ShellError::SnapshotFailed("NSImage.CGImageForProposedRect returned nil".into())
        })?;


        // 3. CGImage → CIImage (GPU-friendly wrapper · 零拷贝).
        let ci_image: Retained<CIImage> = unsafe { CIImage::imageWithCGImage(&cg_image) };

        // 3.1 **关键修复 · v1.14.4**: Retina 屏 backingScaleFactor=2 · takeSnapshot 返 3840×2160 CGImage
        // (即使 snapshotWidth=1920 points · NSImage.size 是 points · 底层 CGImage 仍是 pixel ×2).
        // CIImage.extent 跟随 CGImage pixel size · 如不 scale 直接 render bounds (0,0,1920,1080) 只会取
        // **源的左下 1/4** (CI 坐标从左下开始 · y 轴朝上) → MP4 看着像"只有一部分画面" · 丢 timeline UI.
        // 解法: 按实际 CG size vs target viewport 算 scale · 用 CGAffineTransform 在 CIImage 层 downsample
        // (highQualityDownsample=true 走 Lanczos) · 让 extent 变成 viewport size · 再 render 1:1 覆盖 IOSurface.
        let (w, h) = self.viewport;
        let target_w = f64::from(w);
        let target_h = f64::from(h);
        let cg_w = objc2_core_graphics::CGImage::width(Some(&cg_image)) as f64;
        let cg_h = objc2_core_graphics::CGImage::height(Some(&cg_image)) as f64;
        let scaled_ci: Retained<CIImage> = if (cg_w - target_w).abs() < 0.5 && (cg_h - target_h).abs() < 0.5 {
            // 1x 屏 · CGImage 已是目标尺寸 · 无需 scale.
            ci_image
        } else {
            let sx = target_w / cg_w;
            let sy = target_h / cg_h;
            let tm = objc2_core_foundation::CGAffineTransform {
                a: sx, b: 0.0, c: 0.0, d: sy, tx: 0.0, ty: 0.0,
            };
            unsafe { ci_image.imageByApplyingTransform_highQualityDownsample(tm, true) }
        };

        // 4. 每帧新建 IOSurface · 不复用 self.output_surface (bug 发现于 v1.14.4 首版):
        //    VT encoder 是异步 pipeline · 540 帧共享同一 IOSurface 会让 encoder queue
        //    里"老帧"的内容被下一次 render 覆盖 (race condition) · 最终 MP4 像素不变.
        //    每帧独立 IOSurface · render 完后交给 VT · IOSurface 生命周期由 handle clone
        //    管 · VT 编完自动 drop.
        let bounds = CGRect {
            origin: CGPoint { x: 0.0, y: 0.0 },
            size: CGSize {
                width: target_w,
                height: target_h,
            },
        };
        let per_frame_surface_ref = create_output_iosurface(w, h)
            .ok_or_else(|| ShellError::SnapshotFailed("IOSurfaceCreate per-frame returned nil".into()))?;
        // SAFETY: ci_context / per_frame_surface / color_space 生命周期覆盖本调用.
        // render_toIOSurface_bounds_colorSpace 把 CIImage 渲染到独立 IOSurface (Metal backend).
        unsafe {
            self.ci_context.render_toIOSurface_bounds_colorSpace(
                &scaled_ci,
                &per_frame_surface_ref,
                bounds,
                Some(&self.color_space),
            );
        }

        // 5. 返回独立 handle · 下游 VT encoder 吃完 drop 释放 IOSurface 内存.
        Ok(IOSurfaceHandle::from_surface(per_frame_surface_ref))
    }

    fn on_bridge_message<F>(&self, handler: F)
    where
        F: Fn(&str, &serde_json::Value) + Send + Sync + 'static,
    {
        if let Ok(mut handlers) = self.bridge_handlers.lock() {
            handlers.push(Box::new(handler));
        }
    }
}

impl Drop for MacHeadlessShell {
    fn drop(&mut self) {
        // main thread 释放 · 主 run loop 还在转时 orderOut 已足够。
        self.window.orderOut(None);
        self.window.close();
    }
}

/// 把 Objective-C 对象转成 `serde_json::Value`。
///
/// 覆盖 `callAsyncJavaScript` / `WKScriptMessage.body` 可能返回的 JSON-可编组类型：
/// - `NSNull` → `Null`
/// - `NSNumber` → `Bool` / `I64` / `F64`（依 Objective-C 类型 encoding）
/// - `NSString` → `String`
/// - `NSArray` → `Array`
/// - `NSDictionary<NSString, _>` → `Object`
///
/// 其他类型 → `Err("unsupported objc type")`。
pub(crate) fn objc_to_json(obj: &AnyObject) -> Result<serde_json::Value, String> {
    use objc2::runtime::AnyClass;
    // SAFETY: class() / isKindOfClass: 都只读 · 主线程调用 · 安全。
    let cls_ns_null = AnyClass::get(c"NSNull");
    let cls_ns_number = AnyClass::get(c"NSNumber");
    let cls_ns_string = AnyClass::get(c"NSString");
    let cls_ns_array = AnyClass::get(c"NSArray");
    let cls_ns_dict = AnyClass::get(c"NSDictionary");

    // SAFETY: isKindOfClass 是 NSObject 通用方法 · obj 非 null（& 引用）· 类可能 None。
    let is_kind = |cls: Option<&AnyClass>| -> bool {
        let Some(cls) = cls else {
            return false;
        };
        let result: bool = unsafe { msg_send![obj, isKindOfClass: cls] };
        result
    };

    if is_kind(cls_ns_null) {
        return Ok(serde_json::Value::Null);
    }

    if is_kind(cls_ns_number) {
        // SAFETY: 已校验 NSNumber · cast 安全。
        let num: &NSNumber = unsafe { &*(obj as *const AnyObject as *const NSNumber) };
        // 区分 bool vs int vs double。objc type encoding "c" = char/BOOL · 约定 bool。
        // SAFETY: objCType 返 C string · 主线程 / 只读。
        let enc = unsafe {
            let ptr: *const std::os::raw::c_char = msg_send![num, objCType];
            if ptr.is_null() {
                return Err("NSNumber objCType null".into());
            }
            std::ffi::CStr::from_ptr(ptr)
        };
        let enc_bytes = enc.to_bytes();
        if enc_bytes == b"c" || enc_bytes == b"B" {
            return Ok(serde_json::Value::Bool(num.as_bool()));
        }
        if matches!(enc_bytes, b"f" | b"d") {
            let f = num.as_f64();
            return Ok(serde_json::Number::from_f64(f)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null));
        }
        // 默认整数
        return Ok(serde_json::Value::Number(serde_json::Number::from(num.as_i64())));
    }

    if is_kind(cls_ns_string) {
        // SAFETY: 已校验 NSString · cast 安全。
        let s: &NSString = unsafe { &*(obj as *const AnyObject as *const NSString) };
        return Ok(serde_json::Value::String(s.to_string()));
    }

    if is_kind(cls_ns_array) {
        // SAFETY: 已校验 NSArray · cast 到 id-array 再手工遍历。
        let arr: &objc2_foundation::NSArray = unsafe {
            &*(obj as *const AnyObject as *const objc2_foundation::NSArray)
        };
        let count: usize = arr.count();
        let mut out = Vec::with_capacity(count);
        for i in 0..count {
            // SAFETY: i < count · objectAtIndex 返 id · 非 null。
            let item: Retained<AnyObject> = unsafe {
                msg_send![arr, objectAtIndex: i]
            };
            out.push(objc_to_json(&item)?);
        }
        return Ok(serde_json::Value::Array(out));
    }

    if is_kind(cls_ns_dict) {
        // SAFETY: 已校验 NSDictionary · cast 到 id-dict。
        let dict: &NSDictionary = unsafe {
            &*(obj as *const AnyObject as *const NSDictionary)
        };
        // SAFETY: allKeys 返 NSArray<id> · NSString 键假设。
        let keys: Retained<objc2_foundation::NSArray> = unsafe { msg_send![dict, allKeys] };
        let key_count: usize = keys.count();
        let mut map = serde_json::Map::with_capacity(key_count);
        for i in 0..key_count {
            // SAFETY: 遍历 in-bounds。
            let key_obj: Retained<AnyObject> = unsafe { msg_send![&*keys, objectAtIndex: i] };
            let key_str: &NSString = match key_obj.downcast_ref::<NSString>() {
                Some(s) => s,
                None => continue, // 非字符串键跳过（JS 对象键永远 string）
            };
            let key = key_str.to_string();
            // SAFETY: objectForKey 主线程 · dict 持住。
            let value_obj: Option<Retained<AnyObject>> =
                unsafe { msg_send![dict, objectForKey: &*key_obj] };
            if let Some(v) = value_obj {
                map.insert(key, objc_to_json(&v)?);
            }
        }
        return Ok(serde_json::Value::Object(map));
    }

    // SAFETY: class 查 · 主线程。CStr → String 走 to_string_lossy。
    let cls_name = unsafe {
        let cls: *const AnyClass = msg_send![obj, class];
        if cls.is_null() {
            "<null>".to_string()
        } else {
            (*cls).name().to_string_lossy().into_owned()
        }
    };
    Err(format!("unsupported objc type (class = {cls_name})"))
}

// ============================================================================
// v1.14.4 · takeSnapshot helpers (POC-A + POC-B 方向 1 蓝本)
// ============================================================================

/// 阻塞等 `WKWebView.takeSnapshotWithConfiguration` 回调 · 返回 NSImage。
///
/// 等待机制：completion handler 把 NSImage 塞进 `Rc<RefCell<Option<...>>>` · 主循环
/// pump run loop 8ms tick · 直到 slot 被填或 3s 超时。Apple 保证 takeSnapshot 只在
/// layout + style + paint + composite 全做完才回调 · 不需要额外 barrier。
fn take_snapshot_blocking(
    web_view: &WKWebView,
    mtm: MainThreadMarker,
) -> Result<Retained<NSImage>, ShellError> {
    // SAFETY: WKSnapshotConfiguration::new 需 main thread marker · 已有 mtm.
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };
    // afterScreenUpdates=true: 强制等任何 pending 布局/渲染完成再截 (苹果官方语义).
    unsafe {
        config.setAfterScreenUpdates(true);
    }
    // **显式设 rect 为 webview 的本地坐标 (0,0,w,h)**: default (CGRect.zero) 语义
    // 不稳定 + webview.frame() 在屏幕坐标系里 (x=20000) · 传进去会错位。
    // snapshot rect 应是 webview bounds (局部坐标)。
    let size = web_view.frame().size;
    let local_rect = CGRect {
        origin: CGPoint { x: 0.0, y: 0.0 },
        size,
    };
    unsafe {
        config.setRect(local_rect);
    }

    // **关键**: snapshotWidth 强制 1x · 否则 Retina 屏 backingScaleFactor=2 会返 3840×2160 ·
    // 下游 CIContext.render bounds 1920×1080 只会取 4K 图左下 1/4 · 丢了 timeline UI 右半 +
    // 其他区域。snapshotWidth 告诉 WebKit "我只要 1920 宽的 NSImage" · Apple 按比例计算高度 1080。
    // 这是 v1.14.4 MP4 pixel 不变 + canary magenta 漏看的**真根因**。
    let snap_w = NSNumber::new_f64(size.width);
    unsafe {
        config.setSnapshotWidth(Some(&snap_w));
    }

    type Slot = Rc<RefCell<Option<Result<Retained<NSImage>, String>>>>;
    let slot: Slot = Rc::new(RefCell::new(None));
    let slot_for_block = slot.clone();

    // SAFETY: completion handler 签名 = (NSImage?, NSError?) -> Void · Apple 保证
    // image/error 至多一非 null。RcBlock 在 main thread 保活。
    let handler = RcBlock::new(move |image_ptr: *mut NSImage, err_ptr: *mut NSError| {
        let result: Result<Retained<NSImage>, String> = if !image_ptr.is_null() {
            // SAFETY: image_ptr 非 null · Retained::retain 接管 +1 ref.
            match unsafe { Retained::retain(image_ptr) } {
                Some(img) => Ok(img),
                None => Err("Retained::retain returned None for NSImage".into()),
            }
        } else if !err_ptr.is_null() {
            // SAFETY: err_ptr 非 null · &*err_ptr 借用。
            let err_ref = unsafe { &*err_ptr };
            Err(err_ref.localizedDescription().to_string())
        } else {
            Err("takeSnapshot: both image and error are null".into())
        };
        *slot_for_block.borrow_mut() = Some(result);
    });

    // SAFETY: takeSnapshot 是标准 WKWebView API · 需 main thread · 已有 mtm.
    unsafe {
        web_view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler);
    }

    // 阻塞 pump 主 run loop · 等 completion handler 填 slot (3s 超时 · 正常 5-10ms).
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        pump_main_run_loop(Duration::from_millis(8));
        if slot.borrow().is_some() {
            break;
        }
    }

    let taken = slot
        .borrow_mut()
        .take()
        .ok_or_else(|| ShellError::SnapshotFailed("takeSnapshot timeout (3s)".into()))?;
    taken.map_err(ShellError::SnapshotFailed)
}

/// 分配一块 BGRA IOSurface (w × h) · CIContext.render 的目标。
///
/// 抄 POC-04B / POC-B 的 create_iosurface · 用 NSMutableDictionary 包 5 个 IOSurface
/// 属性 (Width / Height / BytesPerElement / BytesPerRow / PixelFormat) · 然后
/// IOSurfaceRef::new 向内核 IOKit 服务申请共享内存。
fn create_output_iosurface(w: u32, h: u32) -> Option<CFRetained<IOSurfaceRef>> {
    const BYTES_PER_ELEMENT: isize = 4; // BGRA 32-bit

    let dict: Retained<NSMutableDictionary<NSString, NSNumber>> = NSMutableDictionary::new();
    let entries: [(&CFString, Retained<NSNumber>); 5] = [
        (unsafe { kIOSurfaceWidth }, NSNumber::new_isize(w as isize)),
        (unsafe { kIOSurfaceHeight }, NSNumber::new_isize(h as isize)),
        (
            unsafe { kIOSurfaceBytesPerElement },
            NSNumber::new_isize(BYTES_PER_ELEMENT),
        ),
        (
            unsafe { kIOSurfaceBytesPerRow },
            NSNumber::new_isize(BYTES_PER_ELEMENT * (w as isize)),
        ),
        (
            unsafe { kIOSurfacePixelFormat },
            NSNumber::new_u32(PIXEL_FORMAT_BGRA),
        ),
    ];
    for (cf_key, value) in entries {
        // SAFETY: kIOSurface* 是 CFString const · 重解读为 NSString 合法 (Toll-free bridged).
        let ns_key: &NSString = unsafe { &*(cf_key as *const CFString as *const NSString) };
        let key_proto: &ProtocolObject<dyn NSCopying> = ProtocolObject::from_ref(ns_key);
        // SAFETY: NSMutableDictionary setObject_forKey 需 key conforms NSCopying (NSString ✓) · 需 main thread · 调用时 self 已在 main thread.
        unsafe {
            dict.setObject_forKey(&*value, key_proto);
        }
    }
    let ns_dict: &NSDictionary<NSString, NSNumber> = &dict;
    // SAFETY: NSDictionary 和 CFDictionary Toll-free bridged · 重解读合法.
    let cf_dict: &CFDictionary =
        unsafe { &*(ns_dict as *const NSDictionary<NSString, NSNumber> as *const CFDictionary) };
    // SAFETY: IOSurfaceRef::new(properties_dict) 是 IOSurfaceCreate wrapper · 返回
    // +1 retained IOSurfaceRef · 由 CFRetained::from_raw 接管所有权 (objc2-io-surface 内部).
    unsafe { IOSurfaceRef::new(cf_dict) }
}

