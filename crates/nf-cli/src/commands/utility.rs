use serde_json::{json, Value};

use crate::commands::{print_json, HelpArgs};
use crate::errors::NfError;

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

    let topic = args.topic.join(" ");
    println!("{}", help_text(&topic));
    Ok(())
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

fn help_text(topic: &str) -> String {
    let mut lines = Vec::new();
    lines.push(format!("Usage: {}", usage_for(topic)));
    lines.push("".to_string());
    lines.push("Examples:".to_string());
    for example in examples_for(topic) {
        lines.push(format!("  {example}"));
    }
    lines.push("".to_string());
    lines.push("Common errors:".to_string());
    for error in common_errors_for(topic) {
        lines.push(format!("  {error}"));
    }
    lines.join("\n")
}

fn usage_for(topic: &str) -> &'static str {
    match topic {
        "projects create" => {
            "nf projects create --slug=<id> --name=<name> [--description=<text>] [--tags=<csv>]"
        }
        "clips create" => {
            "nf clips create --project=<slug> --episode=<slug> --slug=<id> --label=<str> --track=<scene|text|audio|trans> --start=<expr> --end=<expr>"
        }
        "doctor" => "nf doctor [--human]",
        "open" => {
            "nf open --project=<slug> --episode=<slug> [--clip=<slug>] [--t=<sec>] [--new-window]"
        }
        _ => "nf <command> [flags]",
    }
}

fn examples_for(topic: &str) -> Vec<&'static str> {
    match topic {
        "projects create" => vec![
            "nf projects create --slug=demo-video --name='Demo Video'",
            "nf projects create --slug=launch-cut --name='Launch Cut' --tags=demo,launch",
        ],
        "clips create" => vec![
            "nf clips create --project=next-frame --episode=ep-01 --slug=feat-4 --label='Feature 4' --track=scene --start='feat-3-end' --end='feat-3-end + 12.0'",
            "nf clips create --project=demo --episode=ep-01 --slug=intro --label='Intro' --track=scene --start=0 --end=5",
        ],
        "doctor" => vec![
            "nf doctor",
            "nf doctor --human",
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
        "projects create" => vec![
            "slug exists: choose a new slug or run `nf projects show --project=<slug>`; hint: nf projects list",
            "slug invalid: use lowercase letters, numbers, and hyphens; hint: retry with --slug=demo-video",
        ],
        "clips create" => vec![
            "unknown project or episode: hint: nf projects list; nf episodes list --project=<slug>",
            "invalid anchor expression: hint: nf anchors list --project=<slug> --episode=<slug>",
        ],
        "doctor" => vec![
            "missing toolchain: hint: install Rust via https://rustup.rs/ or Node via brew install node",
            "unwritable HOME: hint: check HOME write permission",
        ],
        "open" => vec![
            "socket failed: hint: start nf-shell or retry `nf open` after checking permissions",
            "unknown project: hint: nf projects list",
        ],
        _ => vec!["not implemented in W-1: hint: this command is reserved for W-2/W-3"],
    }
}
