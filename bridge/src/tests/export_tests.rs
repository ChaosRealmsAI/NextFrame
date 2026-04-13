use super::*;

#[test]
fn export_mux_audio_copies_video_when_no_audio_sources() {
    let temp = TestDir::new("mux-copy");
    let video_path = temp.join("video-only.mp4");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");

    let response = dispatch(request(
        "export.muxAudio",
        json!({
            "videoPath": video_path.display().to_string(),
            "audioSources": [],
            "outputPath": output_path.display().to_string(),
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("ok"), Some(&json!(true)));
    assert_eq!(
        fs::read_to_string(&output_path).expect("read copied output"),
        "silent-video"
    );
}

#[test]
fn export_mux_audio_reports_missing_ffmpeg() {
    let _mock = MockFfmpegHarness::new();
    let temp = TestDir::new("mux-no-ffmpeg");
    let video_path = temp.join("video-only.mp4");
    let audio_path = temp.join("voiceover.mp3");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");
    fs::write(&audio_path, "audio").expect("write source audio");

    let response = dispatch(request(
        "export.muxAudio",
        json!({
            "videoPath": video_path.display().to_string(),
            "audioSources": [
                {
                    "path": audio_path.display().to_string(),
                    "startTime": 1.25,
                    "volume": 0.8
                }
            ],
            "outputPath": output_path.display().to_string(),
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("ok"), Some(&json!(false)));
    assert_eq!(
        response.result.get("error"),
        Some(&json!(
            "Install ffmpeg to export with audio. `brew install ffmpeg`"
        ))
    );
}

#[test]
fn initialize_primes_ffmpeg_cache_before_mux_requests() {
    let mock = MockFfmpegHarness::new();
    mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
    initialize().expect("initialize bridge");

    {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.lookup_result = Ok(None);
    }
    mock.push_run_result(Ok(CommandOutput {
        success: true,
        stderr: String::new(),
    }));

    let temp = TestDir::new("mux-init-cache");
    let video_path = temp.join("video-only.mp4");
    let audio_path = temp.join("voiceover.mp3");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");
    fs::write(&audio_path, "audio").expect("write source audio");

    let response = dispatch(request(
        "export.muxAudio",
        json!({
            "videoPath": video_path.display().to_string(),
            "audioSources": [
                {
                    "path": audio_path.display().to_string(),
                    "startTime": 0,
                    "volume": 1
                }
            ],
            "outputPath": output_path.display().to_string(),
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("ok"), Some(&json!(true)));

    let invocations = mock.take_invocations();
    assert_eq!(invocations.len(), 1);
    assert_eq!(invocations[0].program, PathBuf::from("/mock/bin/ffmpeg"));
}

#[test]
fn export_mux_audio_builds_expected_ffmpeg_command() {
    let mock = MockFfmpegHarness::new();
    mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
    mock.push_run_result(Ok(CommandOutput {
        success: true,
        stderr: String::new(),
    }));

    let temp = TestDir::new("mux-command");
    let video_path = temp.join("video-only.mp4");
    let audio_a = temp.join("dialog.mp3");
    let audio_b = temp.join("music.wav");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");
    fs::write(&audio_a, "audio-a").expect("write source audio a");
    fs::write(&audio_b, "audio-b").expect("write source audio b");
    let video_path_string = fs::canonicalize(&video_path)
        .expect("canonicalize source video")
        .display()
        .to_string();
    let audio_a_string = fs::canonicalize(&audio_a)
        .expect("canonicalize source audio a")
        .display()
        .to_string();
    let audio_b_string = fs::canonicalize(&audio_b)
        .expect("canonicalize source audio b")
        .display()
        .to_string();
    let output_path_string = output_path.display().to_string();

    let response = dispatch(request(
        "export.muxAudio",
        json!({
            "videoPath": video_path_string.clone(),
            "audioSources": [
                {
                    "path": audio_a_string.clone(),
                    "startTime": 0.5,
                    "volume": 1.0
                },
                {
                    "path": audio_b_string.clone(),
                    "startTime": 2.25,
                    "volume": 0.35
                }
            ],
            "outputPath": output_path_string.clone(),
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("ok"), Some(&json!(true)));

    let invocations = mock.take_invocations();
    assert_eq!(invocations.len(), 1);
    assert_eq!(
        invocations[0],
        FfmpegCommand {
            program: PathBuf::from("/mock/bin/ffmpeg"),
            args: vec![
                "-y",
                "-i",
                &video_path_string,
                "-i",
                &audio_a_string,
                "-i",
                &audio_b_string,
                "-filter_complex",
                "[1:a]adelay=500:all=1,volume=1[a0];[2:a]adelay=2250:all=1,volume=0.35[a1];[a0][a1]amix=inputs=2:normalize=0[aout]",
                "-map",
                "0:v",
                "-map",
                "[aout]",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                &output_path_string,
            ]
            .into_iter()
            .map(|value| value.to_string())
            .collect(),
        }
    );
}

#[test]
fn export_mux_audio_surfaces_ffmpeg_stderr() {
    let mock = MockFfmpegHarness::new();
    mock.set_lookup_result(Ok(Some(PathBuf::from("/mock/bin/ffmpeg"))));
    mock.push_run_result(Ok(CommandOutput {
        success: false,
        stderr: "ffmpeg stderr output".to_string(),
    }));

    let temp = TestDir::new("mux-stderr");
    let video_path = temp.join("video-only.mp4");
    let audio_path = temp.join("voiceover.mp3");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, "silent-video").expect("write source video");
    fs::write(&audio_path, "audio").expect("write source audio");

    let response = dispatch(request(
        "export.muxAudio",
        json!({
            "videoPath": video_path.display().to_string(),
            "audioSources": [
                {
                    "path": audio_path.display().to_string(),
                    "startTime": 0,
                    "volume": 1
                }
            ],
            "outputPath": output_path.display().to_string(),
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result.get("ok"), Some(&json!(false)));
    assert_eq!(
        response.result.get("error"),
        Some(&json!("ffmpeg stderr output"))
    );
}

#[test]
fn build_export_request_creates_valid_recorder_request_with_expected_fields() {
    let _lock = lock_export_test();
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root");
    let temp = TestDir::new("export-request");
    let output_path = temp.join("exports/final.mp4");

    let request = build_export_request(workspace_root, &output_path, 1920, 1080, 60, 12.5, 18)
        .expect("build export request");

    assert_eq!(request.output_path, output_path);
    assert_eq!(request.width, 1920);
    assert_eq!(request.height, 1080);
    assert_eq!(request.fps, 60);
    assert_eq!(request.duration, 12.5);
    assert_eq!(request.crf, 18);
    assert!(request.url.starts_with("file://"));
    assert!(request.url.ends_with("?record=true"));

    let resolved = resolve_recorder_frame_path_from_url(&request.url, workspace_root)
        .expect("resolve request url");
    assert_eq!(
        resolved,
        workspace_root
            .join("runtime/web/index.html")
            .canonicalize()
            .expect("canonicalize workspace recorder frame")
    );
}

#[test]
fn build_export_request_with_scene_library_path_resolves_correctly() {
    let _lock = lock_export_test();
    let temp = TestDir::new("scene-library #1");
    let web_dir = temp.join("runtime/web");
    fs::create_dir_all(&web_dir).expect("create runtime web dir");
    let web_path = web_dir.join("index.html");
    fs::write(&web_path, "<!doctype html>").expect("write recorder frame");
    let output_path = temp.join("exports/scene-library.mp4");

    let request = build_export_request(&temp.path, &output_path, 1280, 720, 30, 8.0, 20)
        .expect("build scene-library export request");
    let resolved = resolve_recorder_frame_path_from_url(&request.url, &temp.path)
        .expect("resolve scene-library export url");

    assert_eq!(
        resolved,
        web_path
            .canonicalize()
            .expect("canonicalize scene-library recorder frame")
    );
    assert!(request.url.contains("scene-library%20%231"));
}

#[test]
fn export_runtime_initializes_and_can_run_tokio_work() {
    let _lock = lock_export_test();
    let runtime = export_runtime().expect("initialize export runtime");
    let runtime_again = export_runtime().expect("reuse export runtime");

    assert!(std::ptr::eq(runtime, runtime_again));
    assert_eq!(runtime.block_on(async { 40 + 2 }), 42);
}

#[test]
fn next_export_pid_increments_atomically() {
    let _lock = lock_export_test();
    let worker_count = 8usize;
    let ids_per_worker = 16usize;
    let first = next_export_pid();
    let mut workers = Vec::with_capacity(worker_count);

    for _ in 0..worker_count {
        workers.push(thread::spawn(move || {
            let mut ids = Vec::with_capacity(ids_per_worker);
            for _ in 0..ids_per_worker {
                ids.push(next_export_pid());
            }
            ids
        }));
    }

    let mut ids = vec![first];
    for worker in workers {
        ids.extend(worker.join().expect("join pid worker"));
    }
    ids.sort_unstable();

    let expected = (first..first + ids.len() as u32).collect::<Vec<_>>();
    assert_eq!(ids, expected);
}

#[test]
fn percent_complete_is_clamped_to_valid_range() {
    let _lock = lock_export_test();

    assert_eq!(percent_complete(-1.0, 10.0), 0.0);
    assert_eq!(percent_complete(2.5, 10.0), 25.0);
    assert_eq!(percent_complete(12.0, 10.0), 100.0);
    assert_eq!(percent_complete(4.0, 0.0), 0.0);
}

#[test]
fn remaining_secs_returns_reasonable_estimate() {
    let _lock = lock_export_test();

    assert!((remaining_secs(2.25, 10.0) - 7.75).abs() < f64::EPSILON);
    assert_eq!(remaining_secs(12.0, 10.0), 0.0);
    assert_eq!(remaining_secs(1.0, 0.0), 0.0);
}

#[test]
fn export_status_json_formats_running_done_and_failed_states() {
    let _lock = lock_export_test();
    let temp = TestDir::new("export-status");

    let running = test_process_handle(
        temp.join("running.mp4"),
        temp.join("running.log"),
        10.0,
        None,
    );
    let running_json = export_status_json(&running);
    assert_eq!(running_json.get("state"), Some(&json!("running")));
    assert_eq!(running_json.get("error"), Some(&Value::Null));
    assert_eq!(
        running_json.get("outputPath"),
        Some(&json!(temp.join("running.mp4").display().to_string()))
    );
    assert_eq!(
        running_json.get("logPath"),
        Some(&json!(temp.join("running.log").display().to_string()))
    );
    let running_percent = running_json
        .get("percent")
        .and_then(Value::as_f64)
        .expect("running percent");
    let running_eta = running_json
        .get("eta")
        .and_then(Value::as_f64)
        .expect("running eta");
    assert!((0.0..=99.0).contains(&running_percent));
    assert!((0.0..=10.0).contains(&running_eta));

    let done = test_process_handle(
        temp.join("done.mp4"),
        temp.join("done.log"),
        10.0,
        Some(ProcessTerminal {
            state: "done",
            error: None,
        }),
    );
    assert_eq!(
        export_status_json(&done),
        json!({
            "state": "done",
            "percent": 100.0,
            "eta": 0.0,
            "outputPath": temp.join("done.mp4").display().to_string(),
            "logPath": temp.join("done.log").display().to_string(),
            "error": Value::Null,
        })
    );

    let failed = test_process_handle(
        temp.join("failed.mp4"),
        temp.join("failed.log"),
        10.0,
        Some(ProcessTerminal {
            state: "failed",
            error: Some("encode failed".to_string()),
        }),
    );
    let failed_json = export_status_json(&failed);
    assert_eq!(failed_json.get("state"), Some(&json!("failed")));
    assert_eq!(failed_json.get("eta"), Some(&json!(0.0)));
    assert_eq!(failed_json.get("error"), Some(&json!("encode failed")));
    let failed_percent = failed_json
        .get("percent")
        .and_then(Value::as_f64)
        .expect("failed percent");
    assert!((0.0..=100.0).contains(&failed_percent));
}

#[test]
fn create_export_log_path_returns_valid_path_in_temp_dir() {
    let temp_dir = env::temp_dir();
    let log_path = create_export_log_path().expect("create export log path");

    assert!(log_path.is_absolute());
    assert_eq!(log_path.parent(), Some(temp_dir.as_path()));
    assert_eq!(
        log_path.extension().and_then(|ext| ext.to_str()),
        Some("log")
    );
}

#[test]
fn create_export_log_path_includes_nextframe_export_in_filename() {
    let log_path = create_export_log_path().expect("create export log path");
    let file_name = log_path
        .file_name()
        .and_then(|name| name.to_str())
        .expect("utf-8 log file name");

    assert!(file_name.contains("nextframe-export"));
}

#[test]
fn copy_video_output_with_same_src_and_dst_is_no_op() {
    let temp = TestDir::new("copy-video-same-path");
    let video_path = temp.join("clip.mp4");
    fs::write(&video_path, b"same-path-video").expect("write input video");

    copy_video_output(&video_path, &video_path).expect("copy should no-op");

    assert_eq!(
        fs::read(&video_path).expect("read original video after no-op"),
        b"same-path-video"
    );
}

#[test]
fn copy_video_output_copies_file_contents() {
    let temp = TestDir::new("copy-video");
    let video_path = temp.join("source.mp4");
    let output_path = temp.join("output.mp4");
    let expected = b"copied-video-bytes";
    fs::write(&video_path, expected).expect("write source video");

    copy_video_output(&video_path, &output_path).expect("copy video output");

    assert_eq!(
        fs::read(&output_path).expect("read copied output"),
        expected
    );
}

#[test]
fn cleanup_intermediate_video_removes_file() {
    let temp = TestDir::new("cleanup-video");
    let video_path = temp.join("intermediate.mp4");
    let output_path = temp.join("final.mp4");
    fs::write(&video_path, b"intermediate-video").expect("write intermediate video");

    cleanup_intermediate_video(&video_path, &output_path);

    assert!(!video_path.exists());
}

#[test]
fn cleanup_intermediate_video_with_same_src_and_dst_is_no_op() {
    let temp = TestDir::new("cleanup-video-same-path");
    let video_path = temp.join("final.mp4");
    fs::write(&video_path, b"final-video").expect("write final video");

    cleanup_intermediate_video(&video_path, &video_path);

    assert_eq!(
        fs::read(&video_path).expect("read final video after no-op cleanup"),
        b"final-video"
    );
}

#[test]
fn handle_export_mux_audio_returns_error_when_video_file_is_missing() {
    let mock = MockFfmpegHarness::new();
    let temp = TestDir::new("mux-missing-video");
    let missing_video_path = temp.join("missing.mp4");
    let audio_path = temp.join("voiceover.mp3");
    let output_path = temp.join("final.mp4");
    fs::write(&audio_path, "audio").expect("write source audio");

    let error = handle_export_mux_audio(&json!({
        "videoPath": missing_video_path.display().to_string(),
        "audioSources": [
            {
                "path": audio_path.display().to_string(),
                "startTime": 0,
                "volume": 1
            }
        ],
        "outputPath": output_path.display().to_string(),
    }))
    .expect_err("missing video should fail before ffmpeg runs");

    assert!(mock.take_invocations().is_empty());
    assert!(error.contains("failed to resolve"));
    assert!(error.contains("missing.mp4"));
}
