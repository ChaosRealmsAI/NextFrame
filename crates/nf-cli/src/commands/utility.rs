use std::fs;
use std::path::PathBuf;
use std::process::Command as ProcessCommand;

use directories::BaseDirs;
use serde_json::{json, Value};

use crate::commands::{print_json, DoctorArgs, HelpArgs};
use crate::errors::NfError;
use crate::ipc_client;

const COMMANDS: &[&str] = &[
    "nf open",
    "nf ps",
    "nf screenshot",
    "nf click",
    "nf select",
    "nf tab",
    "nf state",
    "nf devtools",
    "nf close",
    "nf quit",
    "nf version",
    "nf projects list",
    "nf projects episodes",
    "nf projects clips",
    "nf projects show",
    "nf projects create",
    "nf projects rename",
    "nf projects archive",
    "nf projects delete",
    "nf episodes list",
    "nf episodes show",
    "nf episodes create",
    "nf episodes rename",
    "nf episodes archive",
    "nf episodes delete",
    "nf clips list",
    "nf clips show",
    "nf clips create",
    "nf clips update",
    "nf clips delete",
    "nf anchors list",
    "nf anchors set",
    "nf anchors unset",
    "nf log tail",
    "nf log show",
    "nf log create",
    "nf help",
    "nf doctor",
];

pub fn version() -> Result<(), NfError> {
    print_json(&json!({
        "version": env!("CARGO_PKG_VERSION"),
        "git_hash": option_env!("GIT_HASH"),
        "build_date": option_env!("BUILD_DATE")
    }))
}

pub fn doctor(_args: DoctorArgs) -> Result<(), NfError> {
    let binary = std::env::current_exe()
        .map(path_to_string)
        .unwrap_or_else(|err| format!("unavailable: {err}"));
    let socket = ipc_client::socket_path();
    let registry = registry_path();
    let mut warnings = Vec::new();
    let projects = match read_registry_projects(&registry) {
        Ok(projects) => projects,
        Err(err) => {
            warnings.push(json!({
                "kind": "registry",
                "detail": err.to_string(),
                "hint": "repair or recreate ~/.nextframe/registry.json"
            }));
            Vec::new()
        }
    };

    print_json(&json!({
        "binary": binary,
        "version": env!("CARGO_PKG_VERSION"),
        "socket": path_to_string(socket.clone()),
        "registry": path_to_string(registry),
        "projects": projects,
        "app_running": socket.exists(),
        "warnings": warnings
    }))
}

pub fn help(args: HelpArgs) -> Result<(), NfError> {
    if args.json {
        return print_json(&help_json(&args.topic));
    }

    if args.topic.is_empty() {
        println!("NextFrame CLI");
        println!();
        println!("Commands:");
        for command in COMMANDS {
            println!("  {command}");
        }
        println!();
        println!("Run `nf help <command>` for usage, examples, common errors, and hints.");
        return Ok(());
    }

    match clap_help_for(&args.topic)? {
        Some(help) => print!("{help}"),
        None => {
            let topic = args.topic.join(" ");
            println!("Unknown help topic: {topic}");
            println!();
            println!("Run `nf help` to list commands, or `nf <command> --help` for clap help.");
        }
    }
    Ok(())
}

fn clap_help_for(topic: &[String]) -> Result<Option<String>, NfError> {
    let command = topic.join(" ");
    if !COMMANDS
        .iter()
        .any(|known| known.strip_prefix("nf ") == Some(command.as_str()))
    {
        return Ok(None);
    }

    let output = ProcessCommand::new(std::env::current_exe()?)
        .args(topic)
        .arg("--help")
        .output()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    if !output.status.success() {
        return Ok(None);
    }

    Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
}

fn help_json(topic: &[String]) -> Value {
    let topic = topic.join(" ");
    json!({
        "topic": if topic.is_empty() { "all" } else { topic.as_str() },
        "commands": COMMANDS,
        "usage": usage_for(&topic),
        "examples": examples_for(&topic),
        "common_errors": common_errors_for(&topic)
    })
}

fn usage_for(topic: &str) -> &'static str {
    match topic {
        "ps" => "nf ps [--project=<slug>] [--episode=<slug>]",
        "screenshot" => {
            "nf screenshot --project=<slug> --episode=<slug> [--region=<area>] [--out=<path>] [--window=<id>]"
        }
        "click" => "nf click --project=<slug> --episode=<slug> --selector=<css> [--window=<id>]",
        "select" => "nf select --project=<slug> --episode=<slug> --clip=<slug>",
        "tab" => "nf tab --project=<slug> --episode=<slug> --switch=<script|slice|voice|edit>",
        "state" => "nf state --project=<slug> --episode=<slug> --key=<path> [--window=<id>]",
        "devtools" => {
            "nf devtools --project=<slug> --episode=<slug> --query=<sel> [--get=<prop>] [--action=<action>] [--value=<value>] [--window=<id>]"
        }
        "close" => "nf close --project=<slug> --episode=<slug> [--window=<id>]",
        "quit" => "nf quit",
        "version" => "nf version",
        "projects" => "nf projects <list|episodes|clips|show|create|rename|archive|delete> [flags]",
        "projects list" => "nf projects list",
        "projects episodes" => "nf projects episodes --project=<slug>",
        "projects clips" => "nf projects clips --project=<slug> --episode=<slug>",
        "projects show" => "nf projects show --project=<slug>",
        "projects create" => {
            "nf projects create --slug=<id> --name=<name> [--description=<text>] [--tags=<csv>]"
        }
        "projects rename" => "nf projects rename --project=<slug> --name=<new-name>",
        "projects archive" => "nf projects archive --project=<slug>",
        "projects delete" => "nf projects delete --project=<slug> --confirm",
        "episodes" => "nf episodes <list|show|create|rename|archive|delete> --project=<slug> [flags]",
        "episodes list" => "nf episodes list --project=<slug>",
        "episodes show" => "nf episodes show --project=<slug> --episode=<slug>",
        "episodes create" => {
            "nf episodes create --project=<slug> --slug=<id> --name=<name> [--duration=<sec>]"
        }
        "episodes rename" => "nf episodes rename --project=<slug> --episode=<slug> --name=<new-name>",
        "episodes archive" => "nf episodes archive --project=<slug> --episode=<slug>",
        "episodes delete" => "nf episodes delete --project=<slug> --episode=<slug> --confirm",
        "clips" => "nf clips <list|show|create|update|delete> --project=<slug> --episode=<slug> [flags]",
        "clips list" => "nf clips list --project=<slug> --episode=<slug> [--track=<track>]",
        "clips show" => "nf clips show --project=<slug> --episode=<slug> --clip=<slug>",
        "clips create" => {
            "nf clips create --project=<slug> --episode=<slug> --slug=<id> --label=<str> --track=<scene|text|audio|trans> --start=<expr> --end=<expr>"
        }
        "clips update" => {
            "nf clips update --project=<slug> --episode=<slug> --clip=<slug> [--start=<expr>] [--end=<expr>] [--label=<str>] [--effects=<csv>]"
        }
        "clips delete" => "nf clips delete --project=<slug> --episode=<slug> --clip=<slug> --confirm",
        "anchors" => "nf anchors <list|set|unset> --project=<slug> --episode=<slug> [flags]",
        "anchors list" => "nf anchors list --project=<slug> --episode=<slug>",
        "anchors set" => "nf anchors set --project=<slug> --episode=<slug> --name=<id> --time=<sec>",
        "anchors unset" => "nf anchors unset --project=<slug> --episode=<slug> --name=<id>",
        "log" => "nf log <tail|show|create> --project=<slug> --episode=<slug> [flags]",
        "log tail" => "nf log tail --project=<slug> --episode=<slug> [--limit=<n>] [--actor=<AI|human>] [--since=<iso>]",
        "log show" => "nf log show --project=<slug> --episode=<slug> --id=<entry-id>",
        "log create" => {
            "nf log create --project=<slug> --episode=<slug> --actor=<AI|human> --desc=<str> --cli=<str> [--status=<status>]"
        }
        "help" => "nf help [<command>] [--json]",
        "doctor" => "nf doctor [--json]",
        "open" => {
            "nf open --project=<slug> --episode=<slug> [--clip=<slug>] [--t=<sec>] [--new-window]"
        }
        _ => "nf <command> [flags]",
    }
}

fn examples_for(topic: &str) -> Vec<&'static str> {
    match topic {
        "ps" => vec!["nf ps", "nf ps --project=next-frame --episode=ep-01"],
        "screenshot" => vec![
            "nf screenshot --project=next-frame --episode=ep-01 --region=timeline --out=tmp/timeline.png",
            "nf screenshot --project=next-frame --episode=ep-01 --out=-",
        ],
        "click" => vec![
            "nf click --project=next-frame --episode=ep-01 --selector='nf-clips::shadow .c-row[data-id=intro]'",
            "nf click --project=next-frame --episode=ep-01 --selector='nf-topbar::shadow button[data-tab=script]'",
        ],
        "select" => vec!["nf select --project=next-frame --episode=ep-01 --clip=intro"],
        "tab" => vec!["nf tab --project=next-frame --episode=ep-01 --switch=script"],
        "state" => vec![
            "nf state --project=next-frame --episode=ep-01 --key=topbar.current-tab",
            "nf state --project=next-frame --episode=ep-01 --key=timeline.current-time",
        ],
        "devtools" => vec![
            "nf devtools --project=next-frame --episode=ep-01 --query='nf-topbar' --get=shadowRoot",
            "nf devtools --project=next-frame --episode=ep-01 --query='nf-timeline::shadow .playhead' --get=bounding-rect",
        ],
        "close" => vec!["nf close --project=next-frame --episode=ep-01"],
        "quit" => vec!["nf quit"],
        "version" => vec!["nf version"],
        "projects" => vec!["nf projects list", "nf projects create --slug=demo-video --name='Demo Video'"],
        "projects list" => vec!["nf projects list", "nf projects list | jq '.[].slug'"],
        "projects episodes" => vec!["nf projects episodes --project=next-frame"],
        "projects clips" => vec!["nf projects clips --project=next-frame --episode=ep-01"],
        "projects show" => vec!["nf projects show --project=next-frame"],
        "projects create" => vec![
            "nf projects create --slug=demo-video --name='Demo Video'",
            "nf projects create --slug=launch-cut --name='Launch Cut' --tags=demo,launch",
        ],
        "projects rename" => vec!["nf projects rename --project=demo-video --name='Demo Video v2'"],
        "projects archive" => vec!["nf projects archive --project=demo-video"],
        "projects delete" => vec!["nf projects delete --project=demo-video --confirm"],
        "episodes" => vec!["nf episodes list --project=next-frame", "nf episodes create --project=next-frame --slug=ep-02 --name='Episode 2'"],
        "episodes list" => vec!["nf episodes list --project=next-frame"],
        "episodes show" => vec!["nf episodes show --project=next-frame --episode=ep-01"],
        "episodes create" => vec!["nf episodes create --project=next-frame --slug=ep-02 --name='Episode 2' --duration=90"],
        "episodes rename" => vec!["nf episodes rename --project=next-frame --episode=ep-01 --name='Intro Cut'"],
        "episodes archive" => vec!["nf episodes archive --project=next-frame --episode=ep-01"],
        "episodes delete" => vec!["nf episodes delete --project=next-frame --episode=ep-01 --confirm"],
        "clips" => vec!["nf clips list --project=next-frame --episode=ep-01", "nf clips create --project=next-frame --episode=ep-01 --slug=intro --label='Intro' --track=scene --start=0 --end=5"],
        "clips list" => vec!["nf clips list --project=next-frame --episode=ep-01 --track=scene"],
        "clips show" => vec!["nf clips show --project=next-frame --episode=ep-01 --clip=intro"],
        "clips create" => vec![
            "nf clips create --project=next-frame --episode=ep-01 --slug=feat-4 --label='Feature 4' --track=scene --start='feat-3-end' --end='feat-3-end + 12.0'",
            "nf clips create --project=demo --episode=ep-01 --slug=intro --label='Intro' --track=scene --start=0 --end=5",
        ],
        "clips update" => vec!["nf clips update --project=next-frame --episode=ep-01 --clip=intro --label='Opening'"],
        "clips delete" => vec!["nf clips delete --project=next-frame --episode=ep-01 --clip=intro --confirm"],
        "anchors" => vec!["nf anchors list --project=next-frame --episode=ep-01", "nf anchors set --project=next-frame --episode=ep-01 --name=intro-end --time=5.0"],
        "anchors list" => vec!["nf anchors list --project=next-frame --episode=ep-01"],
        "anchors set" => vec!["nf anchors set --project=next-frame --episode=ep-01 --name=intro-end --time=5.0"],
        "anchors unset" => vec!["nf anchors unset --project=next-frame --episode=ep-01 --name=intro-end"],
        "log" => vec!["nf log tail --project=next-frame --episode=ep-01 --limit=5", "nf log create --project=next-frame --episode=ep-01 --actor=AI --desc='Created intro' --cli='nf clips create ...' --status=done"],
        "log tail" => vec!["nf log tail --project=next-frame --episode=ep-01 --limit=5 --actor=AI"],
        "log show" => vec!["nf log show --project=next-frame --episode=ep-01 --id=log-001"],
        "log create" => vec!["nf log create --project=next-frame --episode=ep-01 --actor=AI --desc='Created intro' --cli='nf clips create ...' --status=done"],
        "help" => vec!["nf help", "nf help projects create --json"],
        "doctor" => vec![
            "nf doctor",
            "nf doctor --json | jq .warnings",
        ],
        "open" => vec![
            "nf open --project=next-frame --episode=ep-01",
            "nf open --project=next-frame --episode=ep-02 --new-window",
        ],
        _ => vec!["nf help projects create", "nf doctor"],
    }
}

fn common_errors_for(topic: &str) -> Vec<&'static str> {
    match topic {
        "ps" => vec!["socket failed: hint: open a window with `nf open --project=<slug> --episode=<slug>`"],
        "screenshot" => vec!["invalid region: hint: use full, topbar, clips, log, timeline, inspector, or preview"],
        "click" => vec!["selector not found: hint: inspect DOM with `nf devtools --query=<sel> --get=shadowRoot`"],
        "select" => vec!["unknown clip: hint: nf clips list --project=<slug> --episode=<slug>"],
        "tab" => vec!["invalid tab: hint: use script, slice, voice, or edit"],
        "state" => vec!["unknown key: hint: try topbar.current-tab, clips.selected-id, timeline.current-time, or inspector.clip-id"],
        "devtools" => vec!["selector not found: hint: broaden selector, then narrow through ::shadow"],
        "close" => vec!["multiple windows match: hint: run nf ps and pass --window=<id>"],
        "quit" => vec!["socket failed: hint: no app process may be running; verify with nf ps"],
        "version" => vec!["build metadata missing: hint: version is still valid"],
        "projects" | "projects show" | "projects episodes" | "projects clips" | "projects list" => {
            vec!["unknown project: hint: nf projects list"]
        }
        "projects create" => vec![
            "slug exists: choose a new slug or run `nf projects show --project=<slug>`; hint: nf projects list",
            "slug invalid: use lowercase letters, numbers, and hyphens; hint: retry with --slug=demo-video",
        ],
        "projects rename" | "projects archive" => vec!["unknown project: hint: nf projects list"],
        "projects delete" => vec!["missing --confirm: hint: rerun with --confirm only when intended"],
        "episodes" | "episodes list" | "episodes show" | "episodes rename" | "episodes archive" => {
            vec!["unknown episode: hint: nf episodes list --project=<slug>"]
        }
        "episodes create" => vec!["slug exists: hint: choose another episode slug or show the existing one"],
        "episodes delete" => vec!["missing --confirm: hint: rerun with --confirm only when intended"],
        "clips" | "clips list" | "clips show" | "clips update" => {
            vec!["unknown clip or episode: hint: nf clips list --project=<slug> --episode=<slug>"]
        }
        "clips create" => vec![
            "unknown project or episode: hint: nf projects list; nf episodes list --project=<slug>",
            "invalid anchor expression: hint: nf anchors list --project=<slug> --episode=<slug>",
        ],
        "clips delete" => vec!["missing --confirm: hint: rerun with --confirm only when intended"],
        "anchors" | "anchors list" | "anchors set" => {
            vec!["unknown episode: hint: nf episodes list --project=<slug>"]
        }
        "anchors unset" => vec!["anchor still referenced: hint: run nf clips update to move references first"],
        "log" | "log tail" => vec!["invalid limit or since: hint: pass --limit=<n> and ISO datetime"],
        "log show" => vec!["unknown log entry: hint: nf log tail --project=<slug> --episode=<slug>"],
        "log create" => vec!["invalid actor/status: hint: actor is AI or human; status is pending, done, or failed"],
        "help" => vec!["unknown topic: hint: run nf help to list commands"],
        "doctor" => vec![
            "registry unreadable: hint: repair ~/.nextframe/registry.json or recreate it",
        ],
        "open" => vec![
            "socket failed: hint: start nf-shell or retry `nf open` after checking permissions",
            "unknown project: hint: nf projects list",
        ],
        _ => vec!["not implemented in W-1: hint: this command is reserved for W-2/W-3"],
    }
}

fn registry_path() -> PathBuf {
    BaseDirs::new()
        .map(|dirs| dirs.home_dir().join(".nextframe").join("registry.json"))
        .unwrap_or_else(|| PathBuf::from(".nextframe/registry.json"))
}

fn read_registry_projects(path: &PathBuf) -> Result<Vec<String>, NfError> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|err| NfError::StorageFailed(err.to_string()))?;
    let projects = value
        .get("projects")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("slug").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    Ok(projects)
}

fn path_to_string(path: PathBuf) -> String {
    path.display().to_string()
}
