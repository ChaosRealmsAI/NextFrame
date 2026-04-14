//! queue scheduling
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use tokio::sync::Semaphore;

use crate::backend::Backend;
use crate::cache::Cache;
use crate::output::event::Event;
use crate::output::manifest::{Manifest, ManifestEntry, ManifestFailure};
use crate::output::naming;
use crate::output::srt;
use crate::queue::job::Job;

/// Run a batch of jobs against a backend with concurrency control.
pub async fn run_batch(
    jobs: Vec<Job>,
    backends: HashMap<String, Arc<dyn Backend>>,
    cache: &Cache,
    output_dir: &Path,
    default_voice: &str,
    default_backend: &str,
    gen_srt: bool,
) -> Result<Manifest> {
    let semaphores: HashMap<String, Arc<Semaphore>> = backends
        .iter()
        .map(|(name, backend)| {
            (
                name.clone(),
                Arc::new(Semaphore::new(backend.max_concurrency())),
            )
        })
        .collect();
    let mut manifest = Manifest::new();

    let mut handles = Vec::new();

    for job in jobs {
        let backend_name = job.backend_name(default_backend);
        let sem = semaphores
            .get(&backend_name)
            .cloned()
            .ok_or_else(|| anyhow!("backend {backend_name} was not initialized"))?;
        let backend = backends
            .get(&backend_name)
            .cloned()
            .ok_or_else(|| anyhow!("backend {backend_name} was not initialized"))?;
        let output_dir = output_dir.to_path_buf();
        let params = job.to_synth_params(default_voice);
        let cache_key = Cache::key(
            &job.text,
            &params.voice,
            &params.rate,
            &params.pitch,
            &params.volume,
        );
        let filename = job
            .filename
            .clone()
            .unwrap_or_else(|| naming::sequential_name(job.id));
        let output_path = output_dir.join(&filename);

        // Check cache first.
        if let Some(cached_path) = cache.get(&cache_key).filter(|path| path.exists()) {
            std::fs::copy(&cached_path, &output_path).with_context(|| {
                format!(
                    "failed to copy cached audio for job {} to {}",
                    job.id,
                    output_path.display()
                )
            })?;
            let file_str = output_path.to_string_lossy().to_string();
            Event::done(job.id, &file_str, true, None).emit();
            manifest.add_entry(
                ManifestEntry {
                    id: job.id,
                    text: job.text.clone(),
                    voice: params.voice.clone(),
                    backend: backend_name,
                    file: file_str,
                    duration_ms: None,
                    cached: true,
                },
                true,
            );
            continue;
        }

        Event::queued(job.id).emit();
        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.ok();
            Event::started(job.id).emit();

            match backend.synthesize(&job.text, &params).await {
                Ok(result) => {
                    let out_path = output_dir.join(&filename);
                    if let Err(e) = std::fs::write(&out_path, &result.audio) {
                        return (job, params, Err(e.into()));
                    }

                    (
                        job,
                        params,
                        Ok((
                            out_path,
                            result.audio,
                            result.duration_ms,
                            result.boundaries,
                        )),
                    )
                }
                Err(e) => (job, params, Err(e)),
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        match handle.await? {
            (job, params, Ok((out_path, audio, duration_ms, _boundaries))) => {
                let file_str = out_path.to_string_lossy().to_string();
                let backend_name = job.backend_name(default_backend);

                // Write to cache.
                let cache_key = Cache::key(
                    &job.text,
                    &params.voice,
                    &params.rate,
                    &params.pitch,
                    &params.volume,
                );
                let _ = cache.put(&cache_key, &audio);

                if gen_srt {
                    match crate::whisper::align_audio(&out_path, &job.text) {
                        Ok(Some(timeline)) => {
                            if let Ok(json_path) = timeline.write_json(&out_path) {
                                eprintln!("Timeline: {json_path}");
                            }
                            if let Ok(srt_path) =
                                srt::write_srt(&out_path, &timeline.to_boundaries())
                            {
                                eprintln!("SRT: {srt_path}");
                            }
                        }
                        Ok(None) => eprintln!("whisper: no segments for job {}", job.id),
                        Err(e) => eprintln!("whisper: job {}: {e}", job.id),
                    }
                }

                Event::done(job.id, &file_str, false, duration_ms).emit();
                manifest.add_entry(
                    ManifestEntry {
                        id: job.id,
                        text: job.text,
                        voice: params.voice,
                        backend: backend_name,
                        file: file_str,
                        duration_ms,
                        cached: false,
                    },
                    false,
                );
            }
            (job, params, Err(e)) => {
                let backend_name = job.backend_name(default_backend);
                Event::error(job.id, &e.to_string()).emit();
                manifest.add_failure(ManifestFailure {
                    id: job.id,
                    text: job.text,
                    voice: params.voice,
                    backend: backend_name,
                    error: e.to_string(),
                });
            }
        }
    }

    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::run_batch;
    use anyhow::{anyhow, Result};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Arc;
    use uuid::Uuid;

    use crate::backend::{Backend, SynthParams, SynthResult, Voice};
    use crate::cache::Cache;
    use crate::queue::job::Job;

    struct MockBackend {
        name: &'static str,
        fail_on: Option<&'static str>,
    }

    #[async_trait]
    impl Backend for MockBackend {
        fn max_concurrency(&self) -> usize {
            1
        }

        async fn list_voices(&self, _lang: Option<&str>) -> Result<Vec<Voice>> {
            Ok(Vec::new())
        }

        async fn synthesize(&self, text: &str, _params: &SynthParams) -> Result<SynthResult> {
            if self.fail_on == Some(text) {
                return Err(anyhow!("{} failed for {}", self.name, text));
            }

            Ok(SynthResult {
                audio: format!("{}:{text}", self.name).into_bytes(),
                duration_ms: Some(250),
                boundaries: Vec::new(),
            })
        }
    }

    fn temp_output_dir() -> Result<PathBuf> {
        let dir = std::env::temp_dir().join(format!("vox-scheduler-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    fn sample_job(id: usize, text: &str, backend: Option<&str>, filename: &str) -> Job {
        Job {
            id,
            text: text.to_string(),
            voice: None,
            rate: None,
            volume: None,
            pitch: None,
            backend: backend.map(str::to_string),
            filename: Some(filename.to_string()),
            emotion: None,
            emotion_scale: None,
            speech_rate: None,
            loudness_rate: None,
            volc_pitch: None,
            context_text: None,
            dialect: None,
        }
    }

    #[tokio::test]
    async fn run_batch_uses_each_jobs_backend() -> Result<()> {
        let output_dir = temp_output_dir()?;
        let cache = Cache::new(&output_dir)?;
        let mut backends: HashMap<String, Arc<dyn Backend>> = HashMap::new();
        backends.insert(
            "alpha".to_string(),
            Arc::new(MockBackend {
                name: "alpha",
                fail_on: None,
            }),
        );
        backends.insert(
            "beta".to_string(),
            Arc::new(MockBackend {
                name: "beta",
                fail_on: None,
            }),
        );

        let manifest = run_batch(
            vec![
                sample_job(0, "first job", None, "first.mp3"),
                sample_job(1, "second job", Some("beta"), "second.mp3"),
            ],
            backends,
            &cache,
            &output_dir,
            "voice",
            "alpha",
            false,
        )
        .await?;

        assert_eq!(manifest.errors, 0);
        assert_eq!(manifest.entries.len(), 2);
        assert_eq!(manifest.entries[0].backend, "alpha");
        assert_eq!(manifest.entries[1].backend, "beta");
        assert_eq!(
            std::fs::read(output_dir.join("first.mp3"))?,
            b"alpha:first job"
        );
        assert_eq!(
            std::fs::read(output_dir.join("second.mp3"))?,
            b"beta:second job"
        );

        let _ = std::fs::remove_dir_all(output_dir);
        Ok(())
    }

    #[tokio::test]
    async fn run_batch_records_failures_with_details() -> Result<()> {
        let output_dir = temp_output_dir()?;
        let cache = Cache::new(&output_dir)?;
        let mut backends: HashMap<String, Arc<dyn Backend>> = HashMap::new();
        backends.insert(
            "alpha".to_string(),
            Arc::new(MockBackend {
                name: "alpha",
                fail_on: Some("boom"),
            }),
        );

        let manifest = run_batch(
            vec![
                sample_job(0, "ok", None, "ok.mp3"),
                sample_job(1, "boom", None, "boom.mp3"),
            ],
            backends,
            &cache,
            &output_dir,
            "voice",
            "alpha",
            false,
        )
        .await?;

        assert_eq!(manifest.total, 2);
        assert_eq!(manifest.entries.len(), 1);
        assert_eq!(manifest.errors, 1);
        assert_eq!(manifest.failures.len(), 1);
        assert_eq!(manifest.failures[0].id, 1);
        assert_eq!(manifest.failures[0].backend, "alpha");
        assert!(manifest.failures[0].error.contains("alpha failed for boom"));

        let _ = std::fs::remove_dir_all(output_dir);
        Ok(())
    }
}
