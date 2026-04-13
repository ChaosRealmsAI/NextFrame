use anyhow::{anyhow, Result};
use tokio::process::Command;

use crate::backend::{self, SynthParams};
use crate::config::VoxConfig;
use crate::lang;

pub struct PlayCommand {
    pub text: String,
    pub voice: Option<String>,
    pub rate: String,
    pub volume: String,
    pub pitch: String,
    pub backend_name: Option<String>,
    pub emotion: Option<String>,
    pub emotion_scale: Option<f32>,
    pub speech_rate: Option<i32>,
    pub loudness_rate: Option<i32>,
    pub volc_pitch: Option<i32>,
    pub context_text: Option<String>,
    pub dialect: Option<String>,
}

pub async fn run(command: PlayCommand) -> Result<()> {
    let PlayCommand {
        text,
        voice,
        rate,
        volume,
        pitch,
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
    let backend_name = config.resolve_backend(backend_name);

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
    let backend = backend::create_backend(&backend_name)?;
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

    let result = backend.synthesize(&text, &params).await?;

    // Write to temp file and play.
    let tmp = std::env::temp_dir().join(format!("vox-play-{}.mp3", std::process::id()));
    std::fs::write(&tmp, &result.audio)?;

    let status = Command::new(detect_player()?).arg(&tmp).status().await?;

    let _ = std::fs::remove_file(&tmp);

    if !status.success() {
        return Err(anyhow!("Player exited with status: {status}"));
    }

    Ok(())
}

fn detect_player() -> Result<&'static str> {
    if cfg!(target_os = "macos") {
        return Ok("afplay");
    }
    for player in &["mpv", "ffplay", "aplay", "paplay"] {
        if std::process::Command::new("which")
            .arg(player)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Ok(player);
        }
    }
    Err(anyhow!(
        "No audio player found. Install mpv, ffplay, or set PATH."
    ))
}
