//! karaoke HTML writer — 自包含 HTML 播放器 · 字级同步 · 直接 open 即可用。
//!
//! 产物：`*.karaoke.html` 与 mp3 同目录 · audio src 相对路径 · timeline 直接
//! inline 为 JS 常量（无 fetch 依赖 · file:// 下也能跑）。
use std::path::Path;

use anyhow::{Context, Result};

use crate::whisper::timeline::Timeline;

/// Inline HTML template · 2 个占位符：{{AUDIO_SRC}} + {{TIMELINE_JSON}}。
const TEMPLATE: &str = include_str!("karaoke_template.html");

/// Produce `<audio_stem>.karaoke.html` next to the audio file.
///
/// Returns the written path as a string for stdout event reporting.
pub fn write_karaoke_html(audio_path: &Path, timeline: &Timeline) -> Result<String> {
    let html_path = audio_path.with_extension("karaoke.html");

    // Audio filename (relative · same dir as the html)
    let audio_src = audio_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio.mp3");

    // Timeline → compact JSON (single line · safe for embedding)
    let timeline_json =
        serde_json::to_string(timeline).context("failed to serialize timeline for karaoke html")?;

    let html = TEMPLATE
        .replace("{{AUDIO_SRC}}", &escape_attr(audio_src))
        .replace("{{TIMELINE_JSON}}", &timeline_json);

    std::fs::write(&html_path, html)
        .with_context(|| format!("failed to write {}", html_path.display()))?;

    Ok(html_path.to_string_lossy().to_string())
}

/// Escape `"` and `<` so the audio filename can't break out of the attribute /
/// tag context. (mp3 filenames are usually alnum+hyphen but we don't trust.)
fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]

    use super::*;
    use crate::whisper::timeline::{Timeline, TimelineSegment, TimelineWord};
    use std::path::PathBuf;

    fn sample_timeline() -> Timeline {
        Timeline {
            duration_ms: 2000,
            voice: "zh-CN-XiaoxiaoNeural".to_string(),
            words: vec![
                TimelineWord {
                    text: "你".to_string(),
                    start_ms: 100,
                    end_ms: 400,
                },
                TimelineWord {
                    text: "好".to_string(),
                    start_ms: 400,
                    end_ms: 700,
                },
            ],
            segments: vec![TimelineSegment {
                text: "你好".to_string(),
                start_ms: 100,
                end_ms: 700,
                words: vec![],
            }],
        }
    }

    #[test]
    fn karaoke_html_contains_audio_src_and_timeline() {
        let dir = std::env::temp_dir().join(format!("nf-tts-karaoke-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let audio_path: PathBuf = dir.join("hello.mp3");

        let timeline = sample_timeline();
        let out = write_karaoke_html(&audio_path, &timeline).unwrap();

        assert!(out.ends_with("hello.karaoke.html"));
        let content = std::fs::read_to_string(&out).unwrap();

        // audio src points to the mp3 in the same dir
        assert!(
            content.contains(r#"src="hello.mp3""#),
            "expected audio src to be 'hello.mp3'"
        );
        // timeline JSON was embedded
        assert!(content.contains(r#""voice":"zh-CN-XiaoxiaoNeural""#));
        assert!(content.contains(r#""duration_ms":2000"#));
        assert!(content.contains(r#""text":"你""#));
        // template placeholders are gone
        assert!(!content.contains("{{AUDIO_SRC}}"));
        assert!(!content.contains("{{TIMELINE_JSON}}"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn escape_attr_quotes_and_angle_brackets() {
        assert_eq!(escape_attr(r#"a"b"#), "a&quot;b");
        assert_eq!(escape_attr("a<b>c"), "a&lt;b&gt;c");
        assert_eq!(escape_attr("normal.mp3"), "normal.mp3");
    }
}
