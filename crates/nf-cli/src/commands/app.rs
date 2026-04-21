use serde_json::json;

use crate::commands::{
    send_ipc, ClickArgs, DevtoolsArgs, OpenArgs, ProjectEpisodeFilter, ScreenshotArgs, SelectArgs,
    StateArgs, TabArgs, WindowTargetArgs,
};
use crate::errors::NfError;

pub fn open(args: OpenArgs) -> Result<(), NfError> {
    send_ipc(
        "open-window",
        json!({
            "project": args.project,
            "episode": args.episode,
            "clip": args.clip,
            "t": args.t,
            "new_window": args.new_window
        }),
    )
}

pub fn ps(args: ProjectEpisodeFilter) -> Result<(), NfError> {
    send_ipc(
        "state-query",
        json!({
            "query": "windows",
            "project": args.project,
            "episode": args.episode
        }),
    )
}

pub fn screenshot(args: ScreenshotArgs) -> Result<(), NfError> {
    send_ipc(
        "screenshot",
        json!({
            "project": args.project,
            "episode": args.episode,
            "region": args.region,
            "out": args.out,
            "window": args.window
        }),
    )
}

pub fn click(args: ClickArgs) -> Result<(), NfError> {
    send_ipc(
        "click-sim",
        json!({
            "project": args.project,
            "episode": args.episode,
            "selector": args.selector,
            "window": args.window
        }),
    )
}

pub fn select(args: SelectArgs) -> Result<(), NfError> {
    send_ipc(
        "click-sim",
        json!({
            "project": args.project,
            "episode": args.episode,
            "clip": args.clip,
            "semantic": "select"
        }),
    )
}

pub fn tab(args: TabArgs) -> Result<(), NfError> {
    send_ipc(
        "click-sim",
        json!({
            "project": args.project,
            "episode": args.episode,
            "tab": args.switch_to.as_str(),
            "semantic": "tab"
        }),
    )
}

pub fn state(args: StateArgs) -> Result<(), NfError> {
    send_ipc(
        "state-query",
        json!({
            "project": args.project,
            "episode": args.episode,
            "key": args.key,
            "window": args.window
        }),
    )
}

pub fn devtools(args: DevtoolsArgs) -> Result<(), NfError> {
    send_ipc(
        "state-query",
        json!({
            "project": args.project,
            "episode": args.episode,
            "query": args.query,
            "get": args.get,
            "action": args.action,
            "value": args.value,
            "window": args.window,
            "tool": "devtools"
        }),
    )
}

pub fn close(args: WindowTargetArgs) -> Result<(), NfError> {
    send_ipc(
        "close-window",
        json!({
            "project": args.project,
            "episode": args.episode,
            "window": args.window
        }),
    )
}

pub fn quit() -> Result<(), NfError> {
    send_ipc("quit", json!({}))
}
