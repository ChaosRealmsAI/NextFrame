//! AI-ops surface — stable JSON contract for AI agents. All subcommands emit JSON.

mod cmd;

pub use self::cmd::AiOpsCmd;

pub fn run(cmd: AiOpsCmd) -> anyhow::Result<serde_json::Value> {
    match cmd {
        AiOpsCmd::Describe => Ok(describe()),
        AiOpsCmd::Simulate { action } => Ok(simulate(&action)),
        AiOpsCmd::State => Ok(state()),
        AiOpsCmd::Screenshot { output } => Ok(screenshot(&output)),
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
