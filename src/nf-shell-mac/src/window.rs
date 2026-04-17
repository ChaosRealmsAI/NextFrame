//! Window construction (borderless NSWindow + content view hierarchy).
//!
//! Real impl will wire objc2-app-kit; skeleton returns a placeholder handle.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct WindowConfig {
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub borderless: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            title: "NextFrame".into(),
            width: 1440,
            height: 900,
            borderless: true,
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct WindowHandle {
    _private: (),
}

impl WindowHandle {
    pub(crate) fn new() -> Self {
        Self { _private: () }
    }
}

pub(crate) fn build_window(_cfg: WindowConfig) -> anyhow::Result<WindowHandle> {
    Ok(WindowHandle::new())
}
