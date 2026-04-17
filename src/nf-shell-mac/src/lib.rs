//! nf-shell-mac — macOS native shell.

pub mod bindings;
pub mod bridge;
pub mod panels;
pub mod screenshot;
pub mod source_file;
pub mod window;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[non_exhaustive]
pub enum RuntimeMode {
    Play,
    Edit,
    Record,
}

pub trait ShellController {
    fn run(&mut self) -> anyhow::Result<()>;
    fn current_mode(&self) -> RuntimeMode;
    fn load_source(&mut self, path: PathBuf) -> anyhow::Result<()>;
    fn screenshot(&self) -> anyhow::Result<Vec<u8>>;
}

pub trait Bridge {
    fn send(&self, msg: BridgeMessage) -> anyhow::Result<BridgeReply>;
    fn on_message(&self, handler: Box<dyn Fn(BridgeMessage) + Send>);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeMessage {
    pub kind: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeReply {
    pub ok: bool,
    #[serde(default)]
    pub payload: serde_json::Value,
}

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
