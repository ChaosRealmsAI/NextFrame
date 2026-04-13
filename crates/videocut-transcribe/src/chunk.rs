//! Audio chunk planning for long-form transcription.

use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::audio::slice_wav;

/// One local WAV chunk derived from the source audio.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub path: PathBuf,
    pub offset_sec: f64,
    pub duration_sec: f64,
}

/// Build chunk WAVs for a long input audio file.
pub fn build_chunks(
    wav_path: &Path,
    workdir: &Path,
    total_duration_sec: f64,
    chunk_minutes: u32,
    overlap_seconds: u32,
) -> Result<Vec<Chunk>> {
    let chunk_duration_sec = f64::from(chunk_minutes) * 60.0;
    let overlap_sec = f64::from(overlap_seconds);

    if total_duration_sec <= chunk_duration_sec + 1.0 {
        return Ok(vec![Chunk {
            path: wav_path.to_path_buf(),
            offset_sec: 0.0,
            duration_sec: total_duration_sec,
        }]);
    }

    let mut chunks = Vec::new();
    let mut start_sec = 0.0;
    let mut index = 0usize;
    while start_sec < total_duration_sec {
        let end_sec = (start_sec + chunk_duration_sec + overlap_sec).min(total_duration_sec);
        let duration_sec = end_sec - start_sec;
        let output = workdir.join(format!("chunk_{index:03}.wav"));
        slice_wav(wav_path, start_sec, duration_sec, &output)?;
        chunks.push(Chunk {
            path: output,
            offset_sec: start_sec,
            duration_sec,
        });

        if end_sec >= total_duration_sec {
            break;
        }
        start_sec += chunk_duration_sec;
        index += 1;
    }

    Ok(chunks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_audio_stays_single_chunk() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let chunks = build_chunks(
            temp.path().join("audio.wav").as_path(),
            temp.path(),
            120.0,
            20,
            2,
        )?;
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].offset_sec, 0.0);
        Ok(())
    }
}
