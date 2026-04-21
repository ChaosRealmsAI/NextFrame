//! Traffic light metrics · 以 macOS 系统标准窗口按钮为锚 · DOM topbar 跟
//!
//! FM-TL-SYSTEM-ANCHOR(见 ADR A-0017):不动红绿灯位置 · 读 `close button.frame`
//! 当中心线 · 通过 IPC 传给 DOM · 让 topbar 内容对齐系统锚点。跨 macOS 版本 /
//! fullscreen / titlebarAppearsTransparent / fullSizeContentView 都自动适配。
//!
//! 作废 v0.5.1 前期的 `tao::with_traffic_light_inset` 固定值方案(A-0016)· 那
//! 方案只能控 title_bar_container 高度 · 按 button origin.y 由系统自动 placement ·
//! 导致反复猜 y(17/20/34/44)· 跟 OS 打架。

use objc2_app_kit::{NSWindow, NSWindowButton};

/// 红绿灯关键度量 · 换算成 DOM 可用的 logical pt(左上原点)
#[derive(Clone, Copy, Debug, serde::Serialize)]
pub struct TrafficLightMetrics {
    /// 红 close button 中心 y · 距窗口内容区顶部(logical pt)
    pub center_y_from_top: f64,
    /// 最右(zoom)按钮的右边缘 · 距窗口左(logical pt)
    pub right_edge_x: f64,
    /// close button 实际高度(logical pt · 系统定 · 不猜)
    pub button_h: f64,
}

impl TrafficLightMetrics {
    /// 读 close + zoom 两颗 button · 换算成 DOM 可用的 logical pt。
    ///
    /// Cocoa 左下原点 → DOM 左上原点:`y_from_top = win_h - (btn.origin.y + btn.h/2)`。
    ///
    /// # Safety
    /// - 必须主线程
    /// - ns_window 必须还 alive
    pub fn read(ns_window: &NSWindow) -> Option<Self> {
        let close = ns_window.standardWindowButton(NSWindowButton::CloseButton)?;
        let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton)?;
        let close_frame = close.frame();
        let zoom_frame = zoom.frame();
        let win_size = ns_window.frame().size;
        let center_y_from_top =
            win_size.height - (close_frame.origin.y + close_frame.size.height / 2.0);
        let right_edge_x = zoom_frame.origin.x + zoom_frame.size.width;
        Some(Self {
            center_y_from_top,
            right_edge_x,
            button_h: close_frame.size.height,
        })
    }

    /// 读 tao Window(raw ns_window ptr)· safe wrapper。
    pub fn read_from_tao(window: &tao::window::Window) -> Option<Self> {
        #[cfg(target_os = "macos")]
        {
            use tao::platform::macos::WindowExtMacOS;
            let ptr = window.ns_window();
            if ptr.is_null() {
                return None;
            }
            // SAFETY: tao 保证 ns_window() 返回 NSWindow * · alive 期间 window 持有
            #[allow(unsafe_code)]
            let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
            Self::read(ns_window)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window;
            None
        }
    }

    /// 生成前端初始化 JS · 塞 `window.__nfTrafficLight` 供 topbar 消费。
    pub fn to_init_script(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_else(|_| "null".to_string());
        format!(
            "window.__nfTrafficLight = {json};\n\
             (function applyTL() {{\n\
             var tl = window.__nfTrafficLight;\n\
             if (!tl) return;\n\
             var root = document.documentElement;\n\
             root.style.setProperty('--tl-center-y', tl.center_y_from_top + 'px');\n\
             root.style.setProperty('--tl-right-edge', tl.right_edge_x + 'px');\n\
             root.style.setProperty('--tl-button-h', tl.button_h + 'px');\n\
             }})();"
        )
    }
}
