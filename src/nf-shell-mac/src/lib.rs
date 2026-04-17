//! nf-shell-mac — macOS native shell (walking skeleton).
//!
//! Hosts the 4-panel desktop (toolbar / preview WKWebView / params / timeline)
//! and bridges source.json ↔ engine ↔ runtime. Only the shell writes source.json.

pub mod bridge;
pub mod panels;
pub mod source_file;
#[allow(dead_code)]
pub mod window;

use serde::{Deserialize, Serialize};

/// Runtime mode the shell is driving. Non-exhaustive so future modes don't break callers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum RuntimeMode {
    Play,
    Edit,
    Record,
}

pub trait ShellController {
    fn run(&mut self) -> anyhow::Result<()>;
    fn current_mode(&self) -> RuntimeMode;
}

/// IPC bridge between Rust shell and the WKWebView runtime.
pub trait Bridge {
    fn send(&self, msg: BridgeMessage) -> anyhow::Result<BridgeReply>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeMessage {
    pub kind: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeReply {
    pub ok: bool,
    pub payload: serde_json::Value,
}

pub struct StubShell {
    mode: RuntimeMode,
}

impl StubShell {
    pub fn new(mode: RuntimeMode) -> Self {
        Self { mode }
    }
}

impl ShellController for StubShell {
    fn run(&mut self) -> anyhow::Result<()> {
        Err(anyhow::anyhow!("walking stub: shell run not implemented"))
    }

    fn current_mode(&self) -> RuntimeMode {
        self.mode
    }
}

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
