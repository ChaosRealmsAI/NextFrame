//! AI-ops surface — stable JSON contract for AI agents. All subcommands emit JSON.

mod cmd;
pub mod serve;

pub use self::cmd::{AiOpsCmd, ServeArgs};

pub fn run(cmd: AiOpsCmd) -> anyhow::Result<Option<serde_json::Value>> {
    match cmd {
        AiOpsCmd::Serve(args) => {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()?;
            runtime.block_on(serve::run(args))?;
            Ok(None)
        }
        AiOpsCmd::Describe => Ok(Some(describe())),
        AiOpsCmd::Simulate { action } => Ok(Some(simulate(&action))),
        AiOpsCmd::State => Ok(Some(state())),
        AiOpsCmd::Screenshot { output } => Ok(Some(screenshot(&output))),
    }
}

fn describe() -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "command": "ai-ops:describe",
        "actions": [
            { "name": "build",      "args": ["source", "output"] },
            { "name": "record",     "args": ["bundle", "output"] },
            { "name": "validate",   "args": ["source"] },
            { "name": "ai-ops.state", "args": [] },
            { "name": "ai-ops.simulate", "args": ["action"] },
            { "name": "ai-ops.screenshot", "args": ["output"] }
        ]
    })
}

fn simulate(action: &str) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "command": "ai-ops:simulate",
        "action": action,
        "effects": [],
        "status": "walking-stub",
    })
}

fn state() -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "command": "ai-ops:state",
        "mode": "play",
        "t": 0.0,
        "source_loaded": false,
        "tracks": [],
        "status": "walking-stub",
    })
}

fn screenshot(output: &std::path::Path) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "command": "ai-ops:screenshot",
        "output": output.display().to_string(),
        "status": "walking-stub",
    })
}
