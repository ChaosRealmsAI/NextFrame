//! ffmpeg tests
use super::*;

#[test]
fn build_ffmpeg_filter_complex_formats_delays_and_mix() {
    let filter = build_ffmpeg_filter_complex(&[
        AudioSource {
            path: PathBuf::from("/tmp/a.mp3"),
            start_time: 0.25,
            volume: 1.0,
        },
        AudioSource {
            path: PathBuf::from("/tmp/b.wav"),
            start_time: 1.5,
            volume: 0.4,
        },
    ]);

    assert_eq!(
        filter,
        "[1:a]adelay=250:all=1,volume=1[a0];[2:a]adelay=1500:all=1,volume=0.4[a1];[a0][a1]amix=inputs=2:normalize=0[aout]"
    );
}

#[test]
fn build_ffmpeg_command_with_single_audio_source() {
    let command = build_ffmpeg_command(
        PathBuf::from("/mock/bin/ffmpeg"),
        Path::new("/tmp/video.mp4"),
        &[AudioSource {
            path: PathBuf::from("/tmp/voiceover.mp3"),
            start_time: 0.0,
            volume: 1.0,
        }],
        Path::new("/tmp/output.mp4"),
    );

    assert_eq!(
        command,
        FfmpegCommand {
            program: PathBuf::from("/mock/bin/ffmpeg"),
            args: vec![
                "-y",
                "-i",
                "/tmp/video.mp4",
                "-i",
                "/tmp/voiceover.mp3",
                "-filter_complex",
                "[1:a]adelay=0:all=1,volume=1[a0];[a0]amix=inputs=1:normalize=0[aout]",
                "-map",
                "0:v",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "/tmp/output.mp4",
            ]
            .into_iter()
            .map(|value| value.to_string())
            .collect(),
        }
    );
}

#[test]
fn build_ffmpeg_command_with_multiple_audio_sources_at_different_start_times() {
    let command = build_ffmpeg_command(
        PathBuf::from("/mock/bin/ffmpeg"),
        Path::new("/tmp/video.mp4"),
        &[
            AudioSource {
                path: PathBuf::from("/tmp/intro.wav"),
                start_time: 0.125,
                volume: 1.0,
            },
            AudioSource {
                path: PathBuf::from("/tmp/music.wav"),
                start_time: 2.75,
                volume: 1.0,
            },
            AudioSource {
                path: PathBuf::from("/tmp/outro.wav"),
                start_time: 10.001,
                volume: 1.0,
            },
        ],
        Path::new("/tmp/output.mp4"),
    );

    assert_eq!(
        command.args[10],
        "[1:a]adelay=125:all=1,volume=1[a0];[2:a]adelay=2750:all=1,volume=1[a1];[3:a]adelay=10001:all=1,volume=1[a2];[a0][a1][a2]amix=inputs=3:normalize=0[aout]"
    );
}

#[test]
fn build_ffmpeg_command_with_volume_adjustments() {
    let command = build_ffmpeg_command(
        PathBuf::from("/mock/bin/ffmpeg"),
        Path::new("/tmp/video.mp4"),
        &[
            AudioSource {
                path: PathBuf::from("/tmp/dialog.wav"),
                start_time: 0.0,
                volume: 0.0,
            },
            AudioSource {
                path: PathBuf::from("/tmp/bed.wav"),
                start_time: 1.0,
                volume: 1.5,
            },
            AudioSource {
                path: PathBuf::from("/tmp/fx.wav"),
                start_time: 2.0,
                volume: 0.125,
            },
        ],
        Path::new("/tmp/output.mp4"),
    );

    assert_eq!(
        command.args[10],
        "[1:a]adelay=0:all=1,volume=0[a0];[2:a]adelay=1000:all=1,volume=1.5[a1];[3:a]adelay=2000:all=1,volume=0.125[a2];[a0][a1][a2]amix=inputs=3:normalize=0[aout]"
    );
}

#[test]
fn secs_to_millis_rounds_with_expected_accuracy() {
    assert_eq!(secs_to_millis(0.0), 0);
    assert_eq!(secs_to_millis(0.0004), 0);
    assert_eq!(secs_to_millis(0.0005), 1);
    assert_eq!(secs_to_millis(1.2344), 1234);
    assert_eq!(secs_to_millis(1.2345), 1235);
    assert_eq!(secs_to_millis(-3.0), 0);
    assert_eq!(secs_to_millis(f64::INFINITY), 0);
}

#[test]
fn parse_audio_sources_accepts_empty_array() {
    let sources = parse_audio_sources(&json!({
        "audioSources": [],
    }))
    .expect("parse empty audio source array");

    assert!(sources.is_empty());
}

#[test]
fn parse_audio_sources_errors_when_path_is_missing() {
    let error = parse_audio_sources(&json!({
        "audioSources": [
            {
                "startTime": 0,
                "volume": 1
            }
        ],
    }))
    .expect_err("missing path should be rejected");

    assert!(error.contains("params.audioSources[0].path: value must be a string"));
}
