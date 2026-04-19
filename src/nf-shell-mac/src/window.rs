// nf-shell-mac · T-04 · Borderless-ish NSWindow 1440×900 + traffic lights 48px 顶栏居中
//
// 风格：`.titled | .closable | .miniaturizable | .fullSizeContentView`
//   - `titlebarAppearsTransparent = true` + `titleVisibility = hidden`
//   - content 占满 frame · 48px 顶栏空白交 T-05 填 topbar
//   - traffic lights（close/min/zoom 3 灯）保留可见 · y=24 居中于 48px 顶栏
//     机制：macOS 会自动居中 NSTitlebarContainerView 里的 3 灯 · 我们把容器 frame 高度设成 48
// 关闭窗口 → NSApplication.terminate（通过 NSWindowDelegate.windowWillClose）
// 背景色 = #050507（近黑 · 对齐 DESIGN tokens --surface-ink）
//
// 参考：archive/v2.0-poc-source.tar.gz poc/P-015-borderless-nswindow/src/window.rs
// 归档用 objc2 0.6（`define_class!`）· 本版用 objc2 0.5（`declare_class!`）· API 形态等价

#![deny(unsafe_op_in_unsafe_fn)]

use std::cell::OnceCell;
use std::fmt;

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{declare_class, msg_send_id, mutability, ClassType, DeclaredClass};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSApplicationDelegate, NSBackingStoreType,
    NSColor, NSView, NSWindow, NSWindowButton, NSWindowDelegate, NSWindowStyleMask,
    NSWindowTitleVisibility,
};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect,
    NSSize,
};

/// 标题栏高度（px）· 对齐 DESIGN tokens spacing --lane-topbar-h = 48
pub const TITLE_BAR_HEIGHT: f64 = 48.0;

/// 主窗口尺寸
pub const WINDOW_WIDTH: f64 = 1440.0;
pub const WINDOW_HEIGHT: f64 = 900.0;

/// 主窗口错误
#[derive(Debug)]
pub enum WindowError {
    /// 不在主线程 · AppKit 调用非法
    NotOnMainThread,
    /// contentView 未能创建（AppKit 罕见）
    MissingContentView,
}

impl fmt::Display for WindowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotOnMainThread => f.write_str(
                "nf-shell-mac: NSWindow must be created on the main thread (MainThreadMarker::new returned None)",
            ),
            Self::MissingContentView => {
                f.write_str("nf-shell-mac: NSWindow.contentView() returned None after init")
            }
        }
    }
}

impl std::error::Error for WindowError {}

/// 主窗口句柄。持有 NSWindow 强引用 · 本 struct drop 时窗口析构。
#[allow(dead_code)]
pub struct MainWindow {
    window: Retained<NSWindow>,
    content_view: Retained<NSView>,
    /// 保留 delegate · 否则 ARC 会释放 · 关闭回调丢
    _delegate: Retained<ShellAppDelegate>,
}

impl MainWindow {
    /// 创建主窗口 · 必须在主线程调用。
    ///
    /// 建完窗口 · 已 `makeKeyAndOrderFront` · `setActivationPolicy(.regular)`。
    /// 调用方需自行跑 `NSApplication.run()` 进入事件循环。
    pub fn new(mtm: MainThreadMarker) -> Result<Self, WindowError> {
        let app = NSApplication::sharedApplication(mtm);
        app.setActivationPolicy(NSApplicationActivationPolicy::Regular);

        let window = build_window(mtm)?;
        let content_view = window.contentView().ok_or(WindowError::MissingContentView)?;

        // 装 delegate · 处理关闭 + resize（resize 里重调 traffic lights 顶栏 · 本版 non-resizable 也留着）
        let delegate = ShellAppDelegate::new(mtm);
        let delegate_obj: &ProtocolObject<dyn NSWindowDelegate> =
            ProtocolObject::from_ref(&*delegate);
        window.setDelegate(Some(delegate_obj));

        // 显示
        window.makeKeyAndOrderFront(None);
        unsafe { window.displayIfNeeded() };
        adjust_titlebar_chrome(&window);

        // 激活 app · 否则菜单栏不抢焦点（开发便利）
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);

        Ok(Self {
            window,
            content_view,
            _delegate: delegate,
        })
    }

    /// 暴露 content view 给其他模块挂 topbar / preview / timeline / inspector（T-05+）
    pub fn content_view(&self) -> Retained<NSView> {
        self.content_view.clone()
    }

    /// 暴露 NSWindow 句柄给集成层（建议只读用）
    #[allow(dead_code)]
    pub fn ns_window(&self) -> Retained<NSWindow> {
        self.window.clone()
    }

    /// 显示 + 前置（new 里已调 · 暴露给 T-11 集成场景 "隐藏后再显"）
    pub fn show(&self) {
        self.window.makeKeyAndOrderFront(None);
        unsafe { self.window.displayIfNeeded() };
        adjust_titlebar_chrome(&self.window);
    }
}

/// 跑 NSApplication 主循环（阻塞到窗口关闭 → terminate）
///
/// 必须主线程。只在已建好至少一个窗口后调。
pub fn run_app(mtm: MainThreadMarker) {
    let app = NSApplication::sharedApplication(mtm);
    unsafe { app.run() };
}

// -----------------------------------------------------------------------------
// 内部：构建 NSWindow
// -----------------------------------------------------------------------------

fn build_window(mtm: MainThreadMarker) -> Result<Retained<NSWindow>, WindowError> {
    // styleMask：有 title bar（才有 traffic lights）+ closable + miniaturizable + fullSizeContentView
    // 故意不加 Resizable（本版 non-resizable）· 加上后 T-22 放开
    let style_mask = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::FullSizeContentView;

    let content_rect = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT),
    );

    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            mtm.alloc(),
            content_rect,
            style_mask,
            NSBackingStoreType::NSBackingStoreBuffered,
            false,
        )
    };

    // ARC 安全：releaseWhenClosed=false 让 Rust 负责析构
    unsafe { window.setReleasedWhenClosed(false) };

    window.setTitle(ns_string!("NextFrame"));
    window.setTitleVisibility(NSWindowTitleVisibility::NSWindowTitleHidden);
    window.setTitlebarAppearsTransparent(true);
    window.setMovableByWindowBackground(false);
    window.setOpaque(true);
    window.setHasShadow(true);

    // 背景色 #050507 · 对齐 DESIGN tokens --surface-ink
    let bg = unsafe {
        NSColor::colorWithSRGBRed_green_blue_alpha(
            0x05 as f64 / 255.0,
            0x05 as f64 / 255.0,
            0x07 as f64 / 255.0,
            1.0,
        )
    };
    window.setBackgroundColor(Some(&bg));

    // 尺寸锁死（不 resizable · 但 contentMinSize 设一样防异常路径）
    unsafe { window.setContentMinSize(NSSize::new(WINDOW_WIDTH, WINDOW_HEIGHT)) };
    window.center();

    Ok(window)
}

/// 把 NSTitlebarContainerView 高度调到 48px · 并把内部 button_group（3 灯）y 居中
///
/// 机制：
/// - macOS 默认 title bar 高 22px · 3 灯在 22px 里居中 · y≈11
/// - 扩 container 到 48px 后 · AppKit 不会自动重算灯 y · 灯仍在原 11 左右
/// - 必须手动把 button_group（3 灯父 view）frame y 往上提到 (48 - 22) / 2 = 13（让灯垂直居中）
fn adjust_titlebar_chrome(window: &NSWindow) {
    let Some(close) = window.standardWindowButton(NSWindowButton::NSWindowCloseButton) else {
        return;
    };
    let Some(button_group) = (unsafe { close.superview() }) else {
        return;
    };
    let Some(titlebar_container) = (unsafe { button_group.superview() }) else {
        return;
    };

    let frame = window.frame();
    // 1. container frame 高度 = 48 · 顶在窗口 top
    unsafe {
        titlebar_container.setFrame(NSRect::new(
            NSPoint::new(0.0, frame.size.height - TITLE_BAR_HEIGHT),
            NSSize::new(frame.size.width, TITLE_BAR_HEIGHT),
        ));
    }

    // 2. button_group frame y 手动居中于 48 · button_group 高度约 16（按 macOS）· y = (48 - 16) / 2 = 16
    //    button_group 坐标系 = container 本地（y 从 container bottom 起 · 不翻转）
    //    macOS title bar 默认 flipped=NO · y 从下往上
    //    所以 group_y_in_container = (TITLE_BAR_HEIGHT - group_h) / 2
    let group_frame = button_group.frame();
    let group_h = group_frame.size.height;
    let group_y = (TITLE_BAR_HEIGHT - group_h) / 2.0;
    unsafe {
        button_group.setFrame(NSRect::new(
            NSPoint::new(group_frame.origin.x, group_y),
            group_frame.size,
        ));
    }

    unsafe {
        titlebar_container.layoutSubtreeIfNeeded();
    }
}

// -----------------------------------------------------------------------------
// NSWindowDelegate · 关闭即 terminate + resize 时重调顶栏
// -----------------------------------------------------------------------------

#[derive(Debug, Default)]
struct ShellDelegateIvars {
    // 预留 · 未来绑 Window 句柄的弱引用 / 绑其他状态
    _placeholder: OnceCell<()>,
}

declare_class!(
    struct ShellAppDelegate;

    // SAFETY:
    // - Super NSObject 无 subclass 约束
    // - MainThreadOnly：AppKit delegate 必须主线程
    // - 不实现 Drop
    unsafe impl ClassType for ShellAppDelegate {
        type Super = NSObject;
        type Mutability = mutability::MainThreadOnly;
        const NAME: &'static str = "NfShellWindowDelegate";
    }

    impl DeclaredClass for ShellAppDelegate {
        type Ivars = ShellDelegateIvars;
    }

    unsafe impl NSObjectProtocol for ShellAppDelegate {}

    unsafe impl NSApplicationDelegate for ShellAppDelegate {}

    unsafe impl NSWindowDelegate for ShellAppDelegate {
        #[method(windowDidResize:)]
        fn window_did_resize(&self, notification: &NSNotification) {
            if let Some(window) = notification_window(notification) {
                adjust_titlebar_chrome(&window);
            }
        }

        #[method(windowWillClose:)]
        fn window_will_close(&self, _notification: &NSNotification) {
            // SAFETY: 主线程（NSWindowDelegate 回调）+ sender=None 是标准用法
            // objc2 0.5 · `Self` is IsMainThreadOnly · 从 &self 拿 MainThreadMarker
            let mtm = MainThreadMarker::from(self);
            let app = NSApplication::sharedApplication(mtm);
            unsafe { app.terminate(None) };
        }
    }
);

impl ShellAppDelegate {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = mtm.alloc().set_ivars(ShellDelegateIvars::default());
        unsafe { msg_send_id![super(this), init] }
    }
}

fn notification_window(notification: &NSNotification) -> Option<Retained<NSWindow>> {
    // SAFETY: 主线程 notification callback 里调 · NSNotification.object 可能是 NSWindow
    // 0.5 无安全 downcast · NSWindowDelegate 的 notification 按约定 object 就是 NSWindow ·
    // 若不是（极罕见 · 比如 resignKey 系列混发）· cast 后调用仍是 NSWindow 方法 · unsafe 接受
    let object = unsafe { notification.object() }?;
    Some(unsafe { Retained::cast::<NSWindow>(object) })
}

// -----------------------------------------------------------------------------
// 单元测试 · pure-logic only（NSWindow 要主线程 · Rust test 跑不起）
// -----------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constants_are_correct() {
        assert!((TITLE_BAR_HEIGHT - 48.0).abs() < f64::EPSILON);
        assert!((WINDOW_WIDTH - 1440.0).abs() < f64::EPSILON);
        assert!((WINDOW_HEIGHT - 900.0).abs() < f64::EPSILON);
    }

    #[test]
    fn traffic_lights_y_center_at_24() {
        // 48px 顶栏里 · 灯 y 期望居中在 24
        let center_y = TITLE_BAR_HEIGHT / 2.0;
        assert!((center_y - 24.0).abs() < f64::EPSILON);
    }

    #[test]
    fn window_error_display_is_not_empty() {
        let e = WindowError::NotOnMainThread;
        assert!(!format!("{e}").is_empty());
        let e = WindowError::MissingContentView;
        assert!(!format!("{e}").is_empty());
    }

    #[test]
    fn background_color_hex_is_050507() {
        let r = 0x05 as f64 / 255.0;
        let g = 0x05 as f64 / 255.0;
        let b = 0x07 as f64 / 255.0;
        assert!(r > 0.0 && r < 0.025);
        assert!(g > 0.0 && g < 0.025);
        assert!(b > 0.0 && b < 0.03);
    }
}
