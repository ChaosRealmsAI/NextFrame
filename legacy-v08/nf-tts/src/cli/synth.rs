//! cli synthesis command
use std::path::Path;

use anyhow::{Context, Result};

use crate::backend::{self, SynthParams};
use crate::cache::Cache;
use crate::config::VoxConfig;
use crate::lang;
use crate::output::event::Event;
use crate::output::naming;
use crate::output::srt;

pub struct SynthCommand {
    pub text: Option<String>,
    pub file: Option<String>,
    pub voice: Option<String>,
    pub rate: String,
    pub volume: String,
    pub pitch: String,
    pub dir: String,
    pub output: Option<String>,
    pub gen_srt: bool,
    pub backend_name: Option<String>,
    pub emotion: Option<String>,
    pub emotion_scale: Option<f32>,
    pub speech_rate: Option<i32>,
    pub loudness_rate: Option<i32>,
    pub volc_pitch: Option<i32>,
    pub context_text: Option<String>,
    pub dialect: Option<String>,
}

pub async fn run(command: SynthCommand) -> Result<()> {
    let SynthCommand {
        text,
        file,
        voice,
        rate,
        volume,
        pitch,
        dir,
        output,
        gen_srt,
        backend_name,
        emotion,
        emotion_scale,
        speech_rate,
        loudness_rate,
        volc_pitch,
        context_text,
        dialect,
    } = command;

    let config = VoxConfig::load();

    // Get text from argument or file.
    let text = match (text, file) {
        (Some(t), _) => t,
        (None, Some(f)) => std::fs::read_to_string(&f)?,
        (None, None) => {
            // Read from stdin
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut std::io::stdin(), &mut buf)?;
            buf
        }
    };

    let dir_str = if dir == "." {
        config
            .default_dir
            .clone()
            .unwrap_or_else(|| ".".to_string())
    } else {
        dir
    };
    let dir = Path::new(&dir_str);
    std::fs::create_dir_all(dir)
        .with_context(|| format!("failed to create output directory {}", dir.display()))?;

    let backend_name = config.resolve_backend(backend_name);

    // Resolve voice: explicit > auto-detect > config default > hardcoded default
    let voice = match voice {
        Some(v) => config.resolve_voice(&v),
        None => config.configured_voice().unwrap_or_else(|| {
            if backend_name == "volcengine" {
                lang::auto_detect_voice_volcengine(&text).to_string()
            } else {
                lang::auto_detect_voice(&text).to_string()
            }
        }),
    };

    let params = SynthParams {
        voice,
        rate,
        volume,
        pitch,
        emotion,
        emotion_scale,
        speech_rate,
        loudness_rate,
        volc_pitch,
        context_text,
        dialect,
    };
    let filename = output.unwrap_or_else(|| {
        naming::hash_name(
            &text,
            &params.voice,
            &params.rate,
            &params.pitch,
            &params.volume,
        )
    });

    // When --srt is used, put all output into a subdirectory named after the file stem.
    // e.g. "test.mp3" → "test/test.mp3" + "test/test.timeline.json" + "test/test.srt"
    let dir = if gen_srt {
        let stem = Path::new(&filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("vox-output");
        let sub = dir.join(stem);
        std::fs::create_dir_all(&sub)
            .with_context(|| format!("failed to create output directory {}", sub.display()))?;
        sub
    } else {
        dir.to_path_buf()
    };
    let out_path = dir.join(&filename);

    // Check cache.
    let cache = Cache::new(&dir)?;
    let cache_key = Cache::key(
        &text,
        &params.voice,
        &params.rate,
        &params.pitch,
        &params.volume,
    );
    if let Some(cached_path) = cache.get(&cache_key) {
        std::fs::copy(&cached_path, &out_path).with_context(|| {
            format!(
                "failed to copy cached audio to output file {}",
                out_path.display()
            )
        })?;
        if gen_srt {
            match crate::whisper::align_audio(&out_path, &text) {
                Ok(Some(timeline)) => {
                    let json_path = timeline.write_json(&out_path)?;
                    crate::output::write_stderr_line(format_args!(
                        "[whisper] timeline: {json_path}"
                    ));
                    let srt_path = srt::write_srt(&out_path, &timeline.to_boundaries())?;
                    crate::output::write_stderr_line(format_args!("[whisper] srt: {srt_path}"));
                }
                Ok(None) => {
                    crate::output::write_stderr_line(format_args!("[whisper] no segments detected"))
                }
                Err(e) => crate::output::write_stderr_line(format_args!("[whisper] {e}")),
            }
        }
        let file_str = out_path.to_string_lossy().to_string();
        Event::done(0, &file_str, true, None).emit();
        return Ok(());
    }

    Event::started(0).emit();
    let backend = backend::create_backend(&backend_name)?;
    let result = backend.synthesize(&text, &params).await?;
    std::fs::write(&out_path, &result.audio)
        .with_context(|| format!("failed to write audio file {}", out_path.display()))?;

    // Generate timeline JSON + SRT via Whisper alignment.
    if gen_srt {
        match crate::whisper::align_audio(&out_path, &text) {
            Ok(Some(timeline)) => {
                let json_path = timeline.write_json(&out_path)?;
                crate::output::write_stderr_line(format_args!("[whisper] timeline: {json_path}"));
                let srt_path = srt::write_srt(&out_path, &timeline.to_boundaries())?;
                crate::output::write_stderr_line(format_args!("[whisper] srt: {srt_path}"));
            }
            Ok(None) => {
                crate::output::write_stderr_line(format_args!("[whisper] no segments detected"))
            }
            Err(e) => crate::output::write_stderr_line(format_args!("[whisper] {e}")),
        }
    }

    let _ = cache.put(&cache_key, &result.audio);

    let file_str = out_path.to_string_lossy().to_string();
    Event::done(0, &file_str, false, result.duration_ms).emit();

    Ok(())
}
