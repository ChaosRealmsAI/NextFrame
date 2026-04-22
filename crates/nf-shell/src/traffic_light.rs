//! Traffic light 精确定位 · zed/automedia 方案(ADR A-0017)
//!
//! 历史教训(session 57600966 · distill 挖出):
//! - `setFrameOrigin` 单用:系统 resize 会重置位置 → 必须 `setFrame:`
//! - 公式 `y = titlebar_h - padding_y - btn_h`(Cocoa 左下原点 · 从 titlebar 底算)
//! - titlebar_h 从 `window.frame.h - contentLayoutRect.h` 读真实值 · 不硬编码
//! - button 间距 `spacing = mini.origin.x - close.origin.x` 读系统默认
//! - 必须挂 resize / activate / fullscreen notification · 每次 reset 重跑
//!
//! 源码参考:`bigbang/MediaAgentTeam/automedia/src/ui.rs:104 move_traffic_lights`
//!
//! 本模块只读不改 tao · 跟 tao 默认 NSWindowDelegate 不冲突(走 NSNotificationCenter
//! observer · 不 setDelegate)。

use objc2::define_class;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol};
use objc2::{msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSWindow, NSWindowButton};
use objc2_foundation::{ns_string, NSNotification, NSNotificationCenter, NSRect, NSString};

/// DOM topbar 高度(与 frontend `.topbar.native` CSS height 一致 · 改 CSS 必同步)
pub const TOPBAR_HEIGHT_PT: f64 = 48.0;
/// 按钮左 padding(跟 macOS 原生默认对齐)
const PADDING_X_PT: f64 = 20.0;

/// 真正执行定位 · 每次 resize / activate 都要重跑(系统会 reset)
fn apply(window: &NSWindow) {
    let close = match window.standardWindowButton(NSWindowButton::CloseButton) {
        Some(b) => b,
        None => return,
    };
    let mini = match window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
        Some(b) => b,
        None => return,
    };
    let zoom = match window.standardWindowButton(NSWindowButton::ZoomButton) {
        Some(b) => b,
        None => return,
    };

    let win_frame = window.frame();
    // contentLayoutRect 不在 objc2-app-kit 0.3 bindings 里暴露 · 直接 msg_send
    // SAFETY: contentLayoutRect 是 NSWindow 标准 property · 返回 NSRect
    #[allow(unsafe_code)]
    let content_rect: NSRect = unsafe { msg_send![window, contentLayoutRect] };
    let real_titlebar_h = win_frame.size.height - content_rect.size.height;
    // 若 titlebar 高于 DOM topbar · 用真实值;否则撑到 DOM 高度(让按钮在 topbar 里居中)
    let container_h = real_titlebar_h.max(TOPBAR_HEIGHT_PT);

    let close_frame = close.frame();
    let mini_frame = mini.frame();
    let btn_h = close_frame.size.height;
    let spacing = (mini_frame.origin.x - close_frame.origin.x).max(20.0);

    // 撑 title_bar_container 到 container_h(紧贴窗顶 · Cocoa 左下原点)
    if container_h > real_titlebar_h {
        // SAFETY: superview() 主线程 · close 还 alive
        #[allow(unsafe_code)]
        let tb_container = unsafe { close.superview().and_then(|sv| sv.superview()) };
        if let Some(title_bar_container) = tb_container {
            let mut tb_rect = title_bar_container.frame();
            tb_rect.size.height = container_h;
            tb_rect.origin.y = win_frame.size.height - container_h;
            // SAFETY: setFrame: 是 NSView 标准方法
            #[allow(unsafe_code)]
            let _: () = unsafe { msg_send![&*title_bar_container, setFrame: tb_rect] };
        }
    }

    // 按钮 Y(Cocoa 左下)· 想让按钮视觉垂直居中于 container_h(即 DOM topbar 中心)
    // 中心 y_from_top = container_h / 2(container 顶贴窗顶)
    // Cocoa: button.origin.y 距 container 底部 = container_h - (container_h/2) - btn_h/2
    //                                        = container_h/2 - btn_h/2
    let y = (container_h - btn_h) / 2.0;
    let mut x = PADDING_X_PT;

    for btn in [&close, &mini, &zoom] {
        let mut f = btn.frame();
        f.origin.x = x;
        f.origin.y = y;
        // SAFETY: setFrame: 是 NSView 标准方法
        #[allow(unsafe_code)]
        let _: () = unsafe { msg_send![&**btn, setFrame: f] };
        x += spacing;
    }
}

/// Observer 的 ivars · 持 NSWindow weak-ish(Retained 保活 · observer 同生命周期)
pub struct TrafficLightObserverIvars {
    pub window: Retained<NSWindow>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = TrafficLightObserverIvars]
    pub struct TrafficLightObserver;

    unsafe impl NSObjectProtocol for TrafficLightObserver {}

    impl TrafficLightObserver {
        /// 任何重 layout 通知(resize / activate / fullscreen)触发此回调
        #[unsafe(method(onNeedsReapply:))]
        fn on_needs_reapply(&self, _notif: &NSNotification) {
            apply(&self.ivars().window);
        }
    }
);

/// 安装按钮定位 · 初始 apply + 挂 NSNotificationCenter observer。
///
/// 返回 `Retained<TrafficLightObserver>` · **caller 必须持住**(观察者释放则 observe 断)。
///
/// 监听的 notification:
/// - `NSWindowDidResizeNotification` — 拉窗口边
/// - `NSWindowDidBecomeKeyNotification` / `NSWindowDidResignKeyNotification` — focus 切换
/// - `NSWindowDidEnterFullScreenNotification` / `NSWindowDidExitFullScreenNotification`
/// - `NSWindowDidMiniaturizeNotification` / `NSWindowDidDeminiaturizeNotification`
pub fn install(mtm: MainThreadMarker, window: Retained<NSWindow>) -> Retained<TrafficLightObserver> {
    // 初始 apply
    apply(&window);

    let observer = mtm
        .alloc::<TrafficLightObserver>()
        .set_ivars(TrafficLightObserverIvars {
            window: window.clone(),
        });
    // SAFETY: define_class 生成的类必须通过 super init 初始化
    #[allow(unsafe_code)]
    let observer: Retained<TrafficLightObserver> = unsafe { msg_send![super(observer), init] };

    let center: Retained<NSNotificationCenter> = NSNotificationCenter::defaultCenter();
    let selector = sel!(onNeedsReapply:);
    let names: &[&NSString] = &[
        ns_string!("NSWindowDidResizeNotification"),
        ns_string!("NSWindowDidBecomeKeyNotification"),
        ns_string!("NSWindowDidResignKeyNotification"),
        ns_string!("NSWindowDidEnterFullScreenNotification"),
        ns_string!("NSWindowDidExitFullScreenNotification"),
        ns_string!("NSWindowDidMiniaturizeNotification"),
        ns_string!("NSWindowDidDeminiaturizeNotification"),
    ];

    for name in names {
        // SAFETY: addObserver:selector:name:object: 主线程 · observer / window 由 Retained 保活
        #[allow(unsafe_code)]
        unsafe {
            let window_any: &AnyObject = std::mem::transmute::<&NSWindow, &AnyObject>(&*window);
            let obs_any: &AnyObject = std::mem::transmute::<&TrafficLightObserver, &AnyObject>(&*observer);
            let _: () = msg_send![
                &*center,
                addObserver: obs_any,
                selector: selector,
                name: *name,
                object: window_any,
            ];
        }
    }

    observer
}

/// 从 tao Window 拿 NSWindow · 安装。只在 macOS 生效。
pub fn install_from_tao(
    window: &tao::window::Window,
) -> Option<Retained<TrafficLightObserver>> {
    use tao::platform::macos::WindowExtMacOS;
    let ptr = window.ns_window();
    if ptr.is_null() {
        return None;
    }
    let mtm = MainThreadMarker::new()?;
    // SAFETY: tao 保证 ns_window() 返回 NSWindow * · 生命周期内 tao 持有 ·
    // 我们 retain 一份 · observer 跟 NSWindow 同生共死
    #[allow(unsafe_code)]
    let ns_window: Retained<NSWindow> = unsafe {
        let borrowed: &NSWindow = &*(ptr as *const NSWindow);
        Retained::retain(borrowed as *const NSWindow as *mut NSWindow)?
    };
    Some(install(mtm, ns_window))
}
