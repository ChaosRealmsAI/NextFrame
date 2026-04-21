use std::{fs::File, process::ExitCode};

use anyhow::{Context, Result};
use clap::Parser;
use env_logger::{Builder, Env, Target};
use nf_agent::{Agent, Config, OpenAiCompat, SkillRegistry};

#[derive(Debug, Parser)]
#[command(name = "nf-agent", about = "Project-agnostic Rust agent loop engine")]
struct Cli {
    #[arg(help = "User task for the agent")]
    task: String,
    #[arg(long, default_value = "./nf-agent.toml", help = "Path to config.toml")]
    config: String,
    #[arg(
        long,
        default_value = "./skills",
        help = "Directory containing */SKILL.md files"
    )]
    skills_dir: String,
    #[arg(long, default_value_t = 20, help = "Maximum agent loop iterations")]
    max_iters: usize,
    #[arg(long, help = "Log output path. Defaults to stderr")]
    log: Option<String>,
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli).await {
        Ok(code) => code,
        Err(err) => {
            eprintln!("error: {err:#}");
            ExitCode::from(2)
        }
    }
}

async fn run(cli: Cli) -> Result<ExitCode> {
    init_logger(cli.log.as_deref())?;
    let config = Config::from_path(&cli.config)?;
    let skills = SkillRegistry::load(&cli.skills_dir)?;
    let provider = OpenAiCompat::from_config(&config)?;
    let agent = Agent::try_new(config.clone(), skills, Box::new(provider))?;

    log::info!("loaded {} skills", agent.skill_count());
    match agent.run(&cli.task, cli.max_iters).await {
        Ok(result) => {
            if let Some(final_text) = result.final_text {
                println!("{final_text}");
            }
            let cost = config.estimate_cost_usd(&result.stats);
            log::info!(
                "stats: completed={} iters={} prompt_tokens={} completion_tokens={} context_bytes={} est_cost_usd={:.6} retries_by_status={:?} forced_stop_missing_outputs={:?}",
                result.completed,
                result.iters,
                result.stats.prompt_tokens,
                result.stats.completion_tokens,
                result.stats.context_bytes,
                cost,
                result.retries_by_status,
                result.forced_stop_missing_outputs
            );
            if result.completed {
                Ok(ExitCode::SUCCESS)
            } else {
                Ok(ExitCode::from(1))
            }
        }
        Err(err) if err.to_string() == "max iters reached" => {
            eprintln!("{err}");
            Ok(ExitCode::from(1))
        }
        Err(err) => Err(err),
    }
}

fn init_logger(log_path: Option<&str>) -> Result<()> {
    let mut builder = Builder::from_env(Env::default().default_filter_or("info"));
    builder.format_timestamp_secs();
    if let Some(path) = log_path {
        let file =
            File::create(path).with_context(|| format!("failed to create log file {path}"))?;
        builder.target(Target::Pipe(Box::new(file)));
    }
    let _ = builder.try_init();
    Ok(())
}
