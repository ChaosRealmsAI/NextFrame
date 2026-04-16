//! Prints pipeline flow guides and step markdown to stdout.

use nf_guide::{default_flows_dir, discover_flows, get_step_content, load_flow};
use std::fs;
use std::process::ExitCode;

fn usage() -> &'static str {
    "nf-guide — print pipeline state-machine prompts for AI agents.

Usage:
  nf-guide                       列出所有可用流程 (available flows)
  nf-guide <flow>                打印 guide.md（状态机 + 流程图）
  nf-guide <flow> <step>         打印某一步的操作手册
  nf-guide <flow> pitfalls       打印已知坑位（if exists）

Flags:
  --json                         以 JSON 输出列表 / 步骤列表（代替文本）
  --steps <flow>                 列出某个流程的所有步骤
  --help, -h                     Show this help

Examples:
  nf-guide                       # text list
  nf-guide --json                # json list
  nf-guide clips                 # clips 流程 state machine guide
  nf-guide clips translate       # translate 步骤完整 prompt
  nf-guide --steps clips         # list step ids of clips flow

Flows 自动从 flows/<name>/flow.json 发现（formerly known as recipes）。

Environment:
  NF_GUIDE_FLOWS                 Override flows dir
  NF_GUIDE_RECIPES               Legacy name, still honored as fallback
                                 (default: search relative to crate or executable)"
}

/// 内置中文一句话描述（覆盖 flow.json 里的描述，让 L1 列表更清晰）。
/// 如果 flow id 不在这张表里，就回退到 flow.json 的 description。
fn zh_blurb(flow_id: &str) -> Option<&'static str> {
    match flow_id {
        "component" => Some("组件生产流程"),
        "produce" => Some("视频生产流程"),
        "design" => Some("设计流程"),
        "script" => Some("脚本流程"),
        "audio" => Some("TTS 合成流程"),
        "clips" => Some("切片流程"),
        _ => None,
    }
}

fn print_flows_text(flows: &[(String, String)]) {
    println!("可用流程 (available flows):");
    println!();
    for (name, description) in flows {
        let blurb = zh_blurb(name).unwrap_or(description);
        println!("  {name}\t{blurb}");
    }
    println!();
    println!("用 `nf-guide <flow>` 看某个流程的整体步骤。");
}

fn print_flows_json(flows: &[(String, String)]) {
    let arr: Vec<serde_json::Value> = flows
        .iter()
        .map(|(id, desc)| {
            let blurb = zh_blurb(id).unwrap_or(desc);
            serde_json::json!({
                "id": id,
                "blurb": blurb,
                "description": desc,
            })
        })
        .collect();
    let payload = serde_json::json!({"flows": arr});
    println!(
        "{}",
        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
    );
}

fn print_steps(flows_dir: &std::path::Path, pipeline: &str, json: bool) -> ExitCode {
    match load_flow(flows_dir, pipeline) {
        Ok(flow) => {
            if json {
                let arr: Vec<serde_json::Value> = flow
                    .steps
                    .iter()
                    .map(|s| serde_json::json!({"id": s.id, "title": s.title, "prompt": s.prompt}))
                    .collect();
                let payload = serde_json::json!({
                    "flow": flow.id,
                    "name": flow.name,
                    "description": flow.description,
                    "steps": arr,
                });
                println!(
                    "{}",
                    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
                );
            } else {
                println!("# {} — {}", flow.id, flow.name);
                println!("{}", flow.description);
                println!();
                for step in flow.steps {
                    println!("{}\t{}", step.id, step.title);
                }
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

fn main() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    if matches!(
        raw.first().map(String::as_str),
        Some("--help" | "-h" | "help")
    ) {
        println!("{}", usage());
        return ExitCode::SUCCESS;
    }

    // Pull --json + --steps flags
    let mut json = false;
    let mut steps_flow: Option<String> = None;
    let mut positional: Vec<String> = Vec::with_capacity(raw.len());
    let mut iter = raw.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--json" => json = true,
            "--steps" => {
                steps_flow = iter.next();
            }
            _ if arg.starts_with("--") => {
                eprintln!(
                    "unknown flag: {arg}. Fix: use --help to see the supported nf-guide flags.\n\n{}",
                    usage()
                );
                return ExitCode::from(2);
            }
            _ => positional.push(arg),
        }
    }

    let flows_dir = default_flows_dir();

    if let Some(pipeline) = steps_flow {
        return print_steps(&flows_dir, &pipeline, json);
    }

    if positional.len() > 2 {
        eprintln!("{}", usage());
        return ExitCode::from(2);
    }

    match positional.as_slice() {
        [] => match discover_flows(&flows_dir) {
            Ok(flows) => {
                if json {
                    print_flows_json(&flows);
                } else {
                    print_flows_text(&flows);
                }
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(1)
            }
        },
        [pipeline] => {
            let path = flows_dir.join(pipeline).join("guide.md");
            match fs::read_to_string(&path) {
                Ok(content) => {
                    print!("{content}");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!(
                        "failed to read {}: {error}. Fix: verify the flow guide exists and is readable.",
                        path.display()
                    );
                    ExitCode::from(1)
                }
            }
        }
        [pipeline, step] => match get_step_content(&flows_dir, pipeline, step) {
            Ok(content) => {
                print!("{content}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(1)
            }
        },
        _ => ExitCode::from(2),
    }
}
