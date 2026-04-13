use anyhow::{anyhow, Result};
use tokio::process::Command;

use crate::backend::{self, SynthParams};
use crate::config::VoxConfig;
use crate::lang;

pub async fn run(voice: Option<String>, text: Option<String>, backend_name: Option<String>) -> Result<()> {
    let config = VoxConfig::load();
    let backend_name = config.resolve_backend(backend_name);

    let preview_text = text.unwrap_or_else(|| {
        if let Some(ref v) = voice {
            if v.starts_with("zh") || v.contains("zh_") {
                "你好，这是语音预览测试。".to_string()
            } else if v.starts_with("ja") {
                "こんにちは、音声プレビューテストです。".to_string()
            } else if v.starts_with("ko") {
                "안녕하세요, 음성 미리듣기 테스트입니다.".to_string()
            } else {
                "Hello, this is a voice preview test.".to_string()
            }
        } else {
            "Hello, this is a voice preview test.".to_string()
        }
    });

    let voice_name = voice.unwrap_or_else(|| {
        if backend_name == "volcengine" {
            lang::auto_detect_voice_volcengine(&preview_text).to_string()
        } else {
            lang::auto_detect_voice(&preview_text).to_string()
        }
    });

    let backend = backend::create_backend(&backend_name)?;
    let params = SynthParams {
        voice: voice_name.clone(),
        rate: "+0%".to_string(),
        volume: "+0%".to_string(),
        pitch: "+0Hz".to_string(),
        emotion: None,
        emotion_scale: None,
        speech_rate: None,
        loudness_rate: None,
        volc_pitch: None,
        context_text: None,
        dialect: None,
    };

    eprintln!("Previewing voice: {voice_name} (backend: {backend_name})");
    let result = backend.synthesize(&preview_text, &params).await?;

    let tmp = std::env::temp_dir().join(format!("vox-preview-{}.mp3", std::process::id()));
    std::fs::write(&tmp, &result.audio)?;

    let player = if cfg!(target_os = "macos") {
        "afplay"
    } else {
        "mpv"
    };
    let status = Command::new(player).arg(&tmp).status().await?;
    let _ = std::fs::remove_file(&tmp);

    if !status.success() {
        return Err(anyhow!("Player failed"));
    }
    Ok(())
}
