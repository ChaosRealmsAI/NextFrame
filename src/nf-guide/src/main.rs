//! Prints pipeline recipe guides and step markdown to stdout.

use nf_guide::{default_recipes_dir, discover_recipes, get_step_content};
use std::fs;
use std::process::ExitCode;

fn usage() -> &'static str {
    "nf-guide [pipeline] [step]

No args: list pipelines
1 arg: print guide.md for the pipeline
2 args: print the markdown for a step id
Special step: pitfalls

Environment:
  NF_GUIDE_RECIPES   Override recipes dir (default: ./src/nf-guide/recipes)"
}

fn main() -> ExitCode {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if matches!(
        args.first().map(String::as_str),
        Some("--help" | "-h" | "help")
    ) {
        println!("{}", usage());
        return ExitCode::SUCCESS;
    }

    if args.len() > 2 {
        eprintln!("{}", usage());
        return ExitCode::from(2);
    }

    let recipes_dir = default_recipes_dir();

    match args.as_slice() {
        [] => match discover_recipes(&recipes_dir) {
            Ok(recipes) => {
                for (name, description) in recipes {
                    println!("{name}\t{description}");
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
                    eprintln!("failed to read {}: {error}", path.display());
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
