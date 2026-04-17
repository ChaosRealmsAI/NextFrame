//! IPC bridge stub. Real impl uses WKScriptMessageHandlerWithReply.

use crate::{Bridge, BridgeMessage, BridgeReply};

pub struct StubBridge;

impl Bridge for StubBridge {
    fn send(&self, msg: BridgeMessage) -> anyhow::Result<BridgeReply> {
        Ok(BridgeReply {
            ok: true,
            payload: serde_json::json!({ "echo": msg.kind }),
        })
    }
}
