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
    /// When true, nest outputs under `{dir}/{stem}/` (legacy behavior).
    /// When false (default), outputs land flat in `{dir}`.
    pub subdir: bool,
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
        subdir,
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

    // Default: outputs land flat in `-d`. With `--subdir`, nest under `{dir}/{stem}/`
    // so mp3 + timeline.json + srt stay grouped per invocation.
    let out_dir = naming::resolve_output_dir(dir, &filename, subdir);
    if subdir {
        std::fs::create_dir_all(&out_dir).with_context(|| {
            format!("failed to create output directory {}", out_dir.display())
        })?;
    }
    let out_path = out_dir.join(&filename);

    // Cache lives next to `-d` regardless of subdir, so the same text+voice
    // combo hits across flat and subdir invocations.
    let cache = Cache::new(dir)?;
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
            match crate::whisper::align_audio(&out_path, &text, &params.voice) {
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
        match crate::whisper::align_audio(&out_path, &text, &params.voice) {
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

#[cfg(test)]
mod tests {
    use crate::cli::args::SynthArgs;
    use crate::cli::synth::SynthCommand;
    use crate::output::naming::resolve_output_dir;
    use std::path::PathBuf;

    fn base_args() -> SynthArgs {
        SynthArgs {
            text: Some("hello".to_string()),
            file: None,
            voice: None,
            rate: "+0%".to_string(),
            volume: "+0%".to_string(),
            pitch: "+0Hz".to_string(),
            dir: ".".to_string(),
            output: Some("fb.mp3".to_string()),
            no_sub: false,
            subdir: false,
            backend: None,
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
    fn synth_args_defaults_to_flat_layout() {
        let args = base_args();
        let cmd: SynthCommand = args.into();
        assert!(!cmd.subdir, "default must be flat, not subdir");

        let base = PathBuf::from("/tmp/nftts-flat");
        let out_dir = resolve_output_dir(&base, "fb.mp3", cmd.subdir);
        assert_eq!(out_dir.join("fb.mp3"), PathBuf::from("/tmp/nftts-flat/fb.mp3"));
    }

    #[test]
    fn synth_args_subdir_flag_nests_under_stem() {
        let mut args = base_args();
        args.subdir = true;
        let cmd: SynthCommand = args.into();
        assert!(cmd.subdir);

        let base = PathBuf::from("/tmp/nftts-sub");
        let out_dir = resolve_output_dir(&base, "fb.mp3", cmd.subdir);
        assert_eq!(
            out_dir.join("fb.mp3"),
            PathBuf::from("/tmp/nftts-sub/fb/fb.mp3")
        );
    }
}
