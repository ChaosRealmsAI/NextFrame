//! Prints pipeline recipe guides and step markdown to stdout.

use nf_guide::{default_recipes_dir, discover_recipes, get_step_content, load_recipe};
use std::fs;
use std::process::ExitCode;

fn usage() -> &'static str {
    "nf-guide — print pipeline state-machine prompts for AI agents.

Usage:
  nf-guide                       List all pipelines
  nf-guide <pipeline>            Print guide.md (state machine + flow diagram)
  nf-guide <pipeline> <step>     Print the operation manual for one step
  nf-guide <pipeline> pitfalls   Print known pitfalls (if exists)

Flags:
  --json                         Emit list / step-list as JSON (instead of text)
  --steps <pipeline>             List steps of one pipeline
  --help, -h                     Show this help

Examples:
  nf-guide                       # text list
  nf-guide --json                # json list
  nf-guide clips                 # clips state machine guide
  nf-guide clips translate       # translate-step prompt manual
  nf-guide --steps clips         # list step ids of clips pipeline

Pipelines are auto-discovered from recipes/<name>/recipe.json.

Environment:
  NF_GUIDE_RECIPES               Override recipes dir
                                 (default: search relative to crate or executable)"
}

fn print_recipes_text(recipes: &[(String, String)]) {
    for (name, description) in recipes {
        println!("{name}\t{description}");
    }
}

fn print_recipes_json(recipes: &[(String, String)]) {
    let arr: Vec<serde_json::Value> = recipes
        .iter()
        .map(|(id, desc)| serde_json::json!({"id": id, "description": desc}))
        .collect();
    let payload = serde_json::json!({"pipelines": arr});
    println!(
        "{}",
        serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
    );
}

fn print_steps(recipes_dir: &std::path::Path, pipeline: &str, json: bool) -> ExitCode {
    match load_recipe(recipes_dir, pipeline) {
        Ok(recipe) => {
            if json {
                let arr: Vec<serde_json::Value> = recipe
                    .steps
                    .iter()
                    .map(|s| serde_json::json!({"id": s.id, "title": s.title, "prompt": s.prompt}))
                    .collect();
                let payload = serde_json::json!({
                    "pipeline": recipe.id,
                    "name": recipe.name,
                    "description": recipe.description,
                    "steps": arr,
                });
                println!(
                    "{}",
                    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
                );
            } else {
                println!("# {} — {}", recipe.id, recipe.name);
                println!("{}", recipe.description);
                println!();
                for step in recipe.steps {
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
    let mut steps_pipeline: Option<String> = None;
    let mut positional: Vec<String> = Vec::with_capacity(raw.len());
    let mut iter = raw.into_iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--json" => json = true,
            "--steps" => {
                steps_pipeline = iter.next();
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

    let recipes_dir = default_recipes_dir();

    if let Some(pipeline) = steps_pipeline {
        return print_steps(&recipes_dir, &pipeline, json);
    }

    if positional.len() > 2 {
        eprintln!("{}", usage());
        return ExitCode::from(2);
    }

    match positional.as_slice() {
        [] => match discover_recipes(&recipes_dir) {
            Ok(recipes) => {
                if json {
                    print_recipes_json(&recipes);
                } else {
                    print_recipes_text(&recipes);
                }
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("{error}");
                ExitCode::from(1)
            }
        },
        [pipeline] => {
            let path = recipes_dir.join(pipeline).join("guide.md");
            match fs::read_to_string(&path) {
                Ok(content) => {
                    print!("{content}");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!(
                        "failed to read {}: {error}. Fix: verify the pipeline guide exists and is readable.",
                        path.display()
                    );
                    ExitCode::from(1)
                }
            }
        }
        [pipeline, step] => match get_step_content(&recipes_dir, pipeline, step) {
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
