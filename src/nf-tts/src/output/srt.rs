use std::path::Path;

use anyhow::{Context, Result};

use crate::backend::WordBoundary;

pub fn write_srt(audio_path: &Path, boundaries: &[WordBoundary]) -> Result<String> {
    let srt_path = audio_path.with_extension("srt");
    let mut content = String::new();

    for (index, boundary) in boundaries.iter().enumerate() {
        let start_ms = boundary.offset_ms;
        let end_ms = boundary.offset_ms + boundary.duration_ms;
        content.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            index + 1,
            format_timestamp(start_ms),
            format_timestamp(end_ms),
            boundary.text
        ));
    }

    std::fs::write(&srt_path, content)
        .with_context(|| format!("failed to write {}", srt_path.display()))?;
    Ok(srt_path.to_string_lossy().to_string())
}

fn format_timestamp(ms: u64) -> String {
    let hours = ms / 3_600_000;
    let minutes = (ms % 3_600_000) / 60_000;
    let seconds = (ms % 60_000) / 1_000;
    let millis = ms % 1_000;
    format!("{hours:02}:{minutes:02}:{seconds:02},{millis:03}")
}

#[cfg(test)]
mod tests {
    use super::format_timestamp;

    #[test]
    fn format_timestamp_uses_srt_layout() {
        assert_eq!(format_timestamp(3_723_004), "01:02:03,004");
    }
}
