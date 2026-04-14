//! cli batch command
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};

use crate::backend::{self, Backend, DEFAULT_VOICE};
use crate::cache::Cache;
use crate::config::VoxConfig;
use crate::output::manifest::Manifest;
use crate::queue::job::Job;
use crate::queue::scheduler;

#[derive(Debug, PartialEq, Eq)]
struct BatchOptions {
    dir: String,
    default_voice: String,
    backend_name: String,
}

fn resolve_batch_options(
    config: &VoxConfig,
    dir: String,
    default_voice: Option<String>,
    backend_name: Option<String>,
) -> BatchOptions {
    let dir = if dir == "." {
        config
            .default_dir
            .clone()
            .unwrap_or_else(|| ".".to_string())
    } else {
        dir
    };
    let default_voice = default_voice
        .as_deref()
        .map(|voice| config.resolve_voice(voice))
        .or_else(|| config.configured_voice())
        .unwrap_or_else(|| DEFAULT_VOICE.to_string());
    let backend_name = config.resolve_backend(backend_name);

    BatchOptions {
        dir,
        default_voice,
        backend_name,
    }
}

fn prepare_jobs(jobs: &mut [Job], config: &VoxConfig) {
    for (i, job) in jobs.iter_mut().enumerate() {
        if job.id == 0 && i > 0 {
            job.id = i;
        }
        if let Some(voice) = job.voice.as_deref() {
            job.voice = Some(config.resolve_voice(voice));
        }
    }
}

fn ensure_batch_success(manifest: &Manifest, manifest_path: &str) -> Result<()> {
    if manifest.errors > 0 {
        return Err(anyhow!(
            "batch failed with {} job error(s); manifest written to {manifest_path}",
            manifest.errors
        ));
    }

    Ok(())
}

pub async fn run(
    input: String,
    dir: String,
    default_voice: Option<String>,
    backend_name: Option<String>,
    gen_srt: bool,
    dry_run: bool,
) -> Result<()> {
    let config = VoxConfig::load();
    let options = resolve_batch_options(&config, dir, default_voice, backend_name);
    let dir = Path::new(&options.dir);
    std::fs::create_dir_all(dir)
        .with_context(|| format!("failed to create output directory {}", dir.display()))?;

    // Read jobs from file or stdin.
    let json_str = if input == "-" {
        let mut buf = String::new();
        std::io::stdin()
            .read_to_string(&mut buf)
            .context("failed to read batch JSON from stdin")?;
        buf
    } else {
        std::fs::read_to_string(&input)
            .with_context(|| format!("failed to read batch JSON from {input}"))?
    };

    let mut jobs: Vec<Job> =
        serde_json::from_str(&json_str).context("failed to parse batch JSON input")?;
    prepare_jobs(&mut jobs, &config);

    if dry_run {
        // Print plan as JSON.
        let plan: Vec<serde_json::Value> = jobs
            .iter()
            .map(|j| {
                let resolved_backend = j.backend_name(&options.backend_name);
                serde_json::json!({
                    "id": j.id,
                    "text": j.text,
                    "voice": j.voice.as_deref().unwrap_or(&options.default_voice),
                    "backend": resolved_backend,
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&plan)?);
        return Ok(());
    }

    let mut backends = std::collections::HashMap::<String, Arc<dyn Backend>>::new();
    for job in &jobs {
        let resolved_backend = job.backend_name(&options.backend_name);
        if !backends.contains_key(&resolved_backend) {
            backends.insert(
                resolved_backend.clone(),
                backend::create_backend(&resolved_backend)?,
            );
        }
    }

    let cache = Cache::new(dir)?;
    let manifest = scheduler::run_batch(
        jobs,
        backends,
        &cache,
        dir,
        &options.default_voice,
        &options.backend_name,
        gen_srt,
    )
    .await?;

    // Write manifest and emit summary.
    let manifest_path = manifest.write_to(dir)?;
    println!(
        "{}",
        serde_json::to_string(&serde_json::json!({
            "manifest": manifest_path,
            "total": manifest.total,
            "synthesized": manifest.synthesized,
            "cached": manifest.cached,
            "errors": manifest.errors,
        }))?
    );

    ensure_batch_success(&manifest, &manifest_path)
}

#[cfg(test)]
mod tests {
    use super::{ensure_batch_success, prepare_jobs, resolve_batch_options, BatchOptions};
    use crate::config::VoxConfig;
    use crate::output::manifest::{ManifestEntry, ManifestFailure};
    use crate::output::manifest::Manifest;
    use crate::queue::job::Job;
    use std::collections::HashMap;

    fn sample_job(id: usize, voice: Option<&str>) -> Job {
        Job {
            id,
            text: format!("job-{id}"),
            voice: voice.map(str::to_string),
            rate: None,
            volume: None,
            pitch: None,
            backend: None,
            filename: None,
            emotion: None,
            emotion_scale: None,
            speech_rate: None,
            loudness_rate: None,
            volc_pitch: None,
            context_text: None,
            dialect: None,
        }
    }

    #[test]
    fn resolve_batch_options_uses_config_defaults_and_aliases() {
        let mut config = VoxConfig {
            default_voice: Some("narrator".to_string()),
            default_dir: Some("configured-dir".to_string()),
            default_backend: Some("mock-backend".to_string()),
            aliases: HashMap::new(),
        };
        config.aliases.insert(
            "narrator".to_string(),
            "en-US-TestMultilingualNeural".to_string(),
        );

        let resolved = resolve_batch_options(&config, ".".to_string(), None, None);
        assert_eq!(
            resolved,
            BatchOptions {
                dir: "configured-dir".to_string(),
                default_voice: "en-US-TestMultilingualNeural".to_string(),
                backend_name: "mock-backend".to_string(),
            }
        );

        let overridden = resolve_batch_options(
            &config,
            "explicit-dir".to_string(),
            Some("narrator".to_string()),
            Some("cli-backend".to_string()),
        );
        assert_eq!(
            overridden,
            BatchOptions {
                dir: "explicit-dir".to_string(),
                default_voice: "en-US-TestMultilingualNeural".to_string(),
                backend_name: "cli-backend".to_string(),
            }
        );
    }

    #[test]
    fn prepare_jobs_assigns_ids_and_resolves_voice_aliases() {
        let mut config = VoxConfig::default();
        config.aliases.insert(
            "narrator".to_string(),
            "en-US-TestMultilingualNeural".to_string(),
        );
        let mut jobs = vec![sample_job(0, Some("narrator")), sample_job(0, None)];

        prepare_jobs(&mut jobs, &config);

        assert_eq!(jobs[0].id, 0);
        assert_eq!(jobs[1].id, 1);
        assert_eq!(
            jobs[0].voice.as_deref(),
            Some("en-US-TestMultilingualNeural")
        );
        assert!(jobs[1].voice.is_none());
    }

    #[test]
    fn ensure_batch_success_returns_error_for_failed_manifest() {
        let mut manifest = Manifest::new();
        manifest.add_entry(
            ManifestEntry {
                id: 0,
                text: "ok".to_string(),
                voice: "voice".to_string(),
                backend: "edge".to_string(),
                file: "ok.mp3".to_string(),
                duration_ms: Some(100),
                cached: false,
            },
            false,
        );
        manifest.add_failure(ManifestFailure {
            id: 1,
            text: "bad".to_string(),
            voice: "voice".to_string(),
            backend: "edge".to_string(),
            error: "backend failed".to_string(),
        });

        let err = ensure_batch_success(&manifest, "manifest.json").unwrap_err();
        assert!(err.to_string().contains("1 job error"));
    }

    #[test]
    fn config_voice_resolution_remains_deterministic() {
        let config = VoxConfig {
            default_voice: Some("plain-voice".to_string()),
            default_dir: None,
            default_backend: None,
            aliases: HashMap::new(),
        };

        let resolved = resolve_batch_options(&config, ".".to_string(), None, None);
        assert_eq!(resolved.default_voice, "plain-voice");
        assert_eq!(resolved.backend_name, "edge");
    }
}
