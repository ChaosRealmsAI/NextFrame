use super::{
    autosave_storage_test_lock, build_ffmpeg_filter_complex, dispatch, home_dir, initialize,
    mock_ffmpeg_state, recent_storage_test_lock, reset_ffmpeg_path_cache_for_tests,
    resolve_write_path, set_autosave_storage_path_override_for_tests,
    set_recent_storage_path_override_for_tests, AudioSource, CommandOutput, FfmpegCommand,
    MockFfmpegState, Request, MOCK_FFMPEG_TEST_LOCK,
    // test-7: recorder_bridge types
    build_recording_url, decode_file_url_path, resolve_recorder_frame_path_from_url,
    RecorderRequest,
    // test-2: validation helpers
    validation::{
        read_optional_u8_in_range, require_array, require_object, require_positive_f64,
        require_positive_u32, require_string, require_u32, require_value_alias,
        validate_project_component,
    },
    // test-3: path + time modules (accessed via super::path / super::time)
    path, time,
};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process;
use std::sync::{MutexGuard, OnceLock};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn fs_read_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-read");
    let file_path = temp.join("note.txt");
    fs::write(&file_path, "hello bridge").expect("write fixture");

    let response = dispatch(request(
        "fs.read",
        json!({ "path": file_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "path": file_path.display().to_string(),
            "contents": "hello bridge",
        })
    );

    let error_response = dispatch(request(
        "fs.read",
        json!({ "path": disallowed_absolute_path() }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn fs_read_rejects_parent_traversal_path() {
    let response = dispatch(request("fs.read", json!({ "path": "../../../etc/passwd" })));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_read_rejects_symlink_escape() {
    let temp = TestDir::new("fs-read-symlink");
    let link_path = temp.join("passwd-link");
    create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "fs.read",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-write");
    let file_path = temp.join("write.txt");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": file_path.display().to_string(),
            "contents": "written from test",
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        fs::read_to_string(&file_path).expect("read written file"),
        "written from test"
    );

    let error_response = dispatch(request(
        "fs.write",
        json!({
            "path": "../escape.txt",
            "contents": "nope",
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_absolute_system_path() {
    let response = dispatch(request(
        "fs.write",
        json!({
            "path": absolute_write_rejection_path(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_symlink_parent_escape() {
    let temp = TestDir::new("fs-write-parent-symlink");
    let link_path = temp.join("escape-dir");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": link_path.join("blocked.txt").display().to_string(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_write_rejects_symlink_target_escape() {
    let temp = TestDir::new("fs-write-target-symlink");
    let link_path = temp.join("hosts-link");
    create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "fs.write",
        json!({
            "path": link_path.display().to_string(),
            "contents": "blocked write",
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_list_dir_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-list");
    fs::write(temp.join("b.txt"), "b").expect("write b");
    fs::write(temp.join("a.txt"), "a").expect("write a");
    fs::create_dir(temp.join("nested")).expect("create nested dir");

    let response = dispatch(request(
        "fs.listDir",
        json!({ "path": temp.path.display().to_string() }),
    ));
    assert!(response.ok);

    let entries = response
        .result
        .get("entries")
        .and_then(Value::as_array)
        .expect("entries array");
    let names = entries
        .iter()
        .filter_map(|entry| entry.get("name").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert_eq!(names, vec!["a.txt", "b.txt", "nested"]);

    let error_response = dispatch(request("fs.listDir", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.path");
}

#[test]
fn fs_list_dir_rejects_symlink_escape() {
    let temp = TestDir::new("fs-list-symlink");
    let link_path = temp.join("etc-link");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "fs.listDir",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn fs_dialog_open_dispatch_happy_and_error() {
    let response = dispatch(request(
        "fs.dialogOpen",
        json!({
            "filters": [
                ".nfproj"
            ]
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(env::temp_dir()
            .join("dialog-open.nfproj")
            .display()
            .to_string()))
    );
    assert_eq!(response.result.get("canceled"), Some(&json!(false)));

    let error_response = dispatch(request("fs.dialogOpen", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.filters");
}

#[test]
fn fs_dialog_save_dispatch_happy_and_error() {
    let response = dispatch(request(
        "fs.dialogSave",
        json!({ "defaultName": "project.nfproj" }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(env::temp_dir()
            .join("project.nfproj")
            .display()
            .to_string()))
    );
    assert_eq!(response.result.get("canceled"), Some(&json!(false)));

    let error_response = dispatch(request("fs.dialogSave", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.defaultName");
}

#[test]
fn fs_reveal_dispatch_happy_and_error() {
    let temp = TestDir::new("fs-reveal");
    let file_path = temp.join("export.mp4");
    fs::write(&file_path, "video").expect("write export file");

    let response = dispatch(request(
        "fs.reveal",
        json!({ "path": file_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(response.result.get("revealed"), Some(&json!(true)));

    let error_response = dispatch(request("fs.reveal", json!({})));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.path");
}

#[test]
fn log_dispatch_happy_and_error() {
    let response = dispatch(request(
        "log",
        json!({
            "level": "info",
            "msg": "hello from tests",
        }),
    ));
    assert!(response.ok);
    assert_eq!(response.result.get("logged"), Some(&json!(true)));

    let error_response = dispatch(request(
        "log",
        json!({
            "level": "info",
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "missing params.msg");
}

#[test]
fn scene_list_dispatch_happy_and_error() {
    let response = dispatch(request("scene.list", json!({})));
    assert!(response.ok);

    let scenes = response.result.as_array().expect("scene array");
    assert_eq!(scenes.len(), 10);
    assert_eq!(scenes[0].get("id"), Some(&json!("auroraGradient")));
    assert_eq!(scenes[9].get("id"), Some(&json!("cornerBadge")));

    let error_response = dispatch(request("scene.list", json!("bad params")));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "params must be a JSON object");
}

#[test]
fn timeline_load_dispatch_happy_path() {
    let temp = TestDir::new("timeline-load");
    let timeline_path = temp.join("timeline.json");
    fs::write(
        &timeline_path,
        r##"{"version":"1","duration":30,"background":"#0b0b14","tracks":[{"id":"track-1","kind":"video","clips":[]}]}"##,
    )
    .expect("write timeline");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result,
        json!({
            "version": "1",
            "duration": 30,
            "background": "#0b0b14",
            "tracks": [
                { "id": "track-1", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_load_dispatch_error_on_invalid_json() {
    let temp = TestDir::new("timeline-load-invalid");
    let timeline_path = temp.join("timeline.json");
    fs::write(&timeline_path, "not-json").expect("write invalid timeline");
    let error_response = dispatch(request(
        "timeline.load",
        json!({ "path": timeline_path.display().to_string() }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "failed to parse timeline");
}

#[test]
fn timeline_load_rejects_symlink_escape() {
    let temp = TestDir::new("timeline-load-symlink");
    let link_path = temp.join("timeline-link.json");
    create_file_symlink(Path::new(&disallowed_absolute_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "timeline.load",
        json!({ "path": link_path.display().to_string() }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn timeline_save_dispatch_happy_path() {
    let temp = TestDir::new("timeline-save");
    let timeline_path = temp.join("saved-timeline.json");
    let timeline_path_string = timeline_path.display().to_string();

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": timeline_path_string,
            "json": {
                "version": "1",
                "duration": 30,
                "background": "#0b0b14",
                "tracks": [
                    { "id": "track-2", "kind": "video", "clips": [] }
                ]
            }
        }),
    ));
    assert!(response.ok);
    assert_eq!(
        response.result.get("path"),
        Some(&json!(timeline_path.display().to_string()))
    );

    let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
    let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
    assert_eq!(
        saved_json,
        json!({
            "version": "1",
            "duration": 30,
            "background": "#0b0b14",
            "tracks": [
                { "id": "track-2", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_save_accepts_timeline_alias() {
    let temp = TestDir::new("timeline-save-alias");
    let timeline_path = temp.join("saved-timeline-alias.json");
    let timeline_path_string = timeline_path.display().to_string();

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": timeline_path_string,
            "timeline": {
                "version": "1",
                "duration": 45,
                "background": "#050814",
                "tracks": [
                    { "id": "track-3", "kind": "video", "clips": [] }
                ]
            }
        }),
    ));
    assert!(response.ok);

    let saved = fs::read_to_string(&timeline_path).expect("read saved timeline");
    let saved_json: Value = serde_json::from_str(&saved).expect("parse saved timeline");
    assert_eq!(
        saved_json,
        json!({
            "version": "1",
            "duration": 45,
            "background": "#050814",
            "tracks": [
                { "id": "track-3", "kind": "video", "clips": [] }
            ]
        })
    );
}

#[test]
fn timeline_save_dispatch_error_on_disallowed_path() {
    let error_response = dispatch(request(
        "timeline.save",
        json!({
            "path": disallowed_absolute_path(),
            "json": { "version": 3 }
        }),
    ));
    assert!(!error_response.ok);
    assert_error_contains(&error_response.error, "outside sandbox");
}

#[test]
fn timeline_save_rejects_symlink_parent_escape() {
    let temp = TestDir::new("timeline-save-parent-symlink");
    let link_path = temp.join("escape-dir");
    create_dir_symlink(Path::new(&disallowed_dir_path()), &link_path).expect("create symlink");

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": link_path.join("blocked.json").display().to_string(),
            "json": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn timeline_save_rejects_symlink_target_escape() {
    let temp = TestDir::new("timeline-save-target-symlink");
    let link_path = temp.join("timeline-link.json");
    create_file_symlink(Path::new(&absolute_write_rejection_path()), &link_path)
        .expect("create symlink");

    let response = dispatch(request(
        "timeline.save",
        json!({
            "path": link_path.display().to_string(),
            "json": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "outside sandbox");
}

#[test]
fn recent_add_dispatch_dedupes_and_caps_entries() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "recent-add");
    let _recent_override = RecentStorageOverrideGuard::new(temp.join(".nextframe/recent.json"));

    for index in 0..12 {
        let project_path = temp.join(&format!("project-{index}.nfproj"));
        fs::write(&project_path, "{}").expect("write project");

        let response = dispatch(request(
            "recent.add",
            json!({ "path": project_path.display().to_string() }),
        ));
        assert!(response.ok);
    }

    let duplicate_path = temp.join("project-5.nfproj");
    let response = dispatch(request(
        "recent.add",
        json!({ "path": duplicate_path.display().to_string() }),
    ));
    assert!(response.ok);

    let list_response = dispatch(request("recent.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("recent entries array");
    assert_eq!(entries.len(), 10);

    let names = entries
        .iter()
        .map(|entry| {
            entry
                .get("name")
                .and_then(Value::as_str)
                .expect("recent entry name")
        })
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        vec![
            "project-5.nfproj",
            "project-11.nfproj",
            "project-10.nfproj",
            "project-9.nfproj",
            "project-8.nfproj",
            "project-7.nfproj",
            "project-6.nfproj",
            "project-4.nfproj",
            "project-3.nfproj",
            "project-2.nfproj",
        ]
    );

    let unique_paths = entries
        .iter()
        .map(|entry| {
            entry
                .get("path")
                .and_then(Value::as_str)
                .expect("recent entry path")
        })
        .collect::<HashSet<_>>();
    assert_eq!(unique_paths.len(), entries.len());
}

#[test]
fn autosave_dispatch_round_trips_and_lists_entries() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-round-trip");
    let autosave_dir = temp.join(".nextframe/autosave");
    let _autosave_override = AutosaveStorageOverrideGuard::new(autosave_dir.clone());

    let untitled_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": "untitled-1234",
            "timeline": minimal_timeline_json(),
        }),
    ));
    assert!(untitled_response.ok);

    thread::sleep(Duration::from_millis(5));

    let saved_project_id = "path-%2FUsers%2Fdemo%2Fedit.nfproj";
    let saved_response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": saved_project_id,
            "timeline": {
                "version": "1",
                "duration": 45,
                "tracks": []
            },
        }),
    ));
    assert!(saved_response.ok);

    let list_response = dispatch(request("autosave.list", json!({})));
    assert!(list_response.ok);

    let entries = list_response
        .result
        .as_array()
        .expect("autosave entries array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].get("projectId"), Some(&json!(saved_project_id)));
    assert_eq!(entries[1].get("projectId"), Some(&json!("untitled-1234")));
    assert!(entries[0]
        .get("path")
        .and_then(Value::as_str)
        .expect("autosave path")
        .ends_with(".nfproj"));

    let recover_response = dispatch(request(
        "autosave.recover",
        json!({ "projectId": saved_project_id }),
    ));
    assert!(recover_response.ok);
    assert_eq!(
        recover_response.result,
        json!({
            "version": "1",
            "duration": 45,
            "tracks": []
        })
    );

    let clear_response = dispatch(request(
        "autosave.clear",
        json!({ "projectId": saved_project_id }),
    ));
    assert!(clear_response.ok);
    assert_eq!(clear_response.result.get("cleared"), Some(&json!(true)));

    let remaining = dispatch(request("autosave.list", json!({})));
    assert!(remaining.ok);
    let remaining_entries = remaining.result.as_array().expect("remaining autosaves");
    assert_eq!(remaining_entries.len(), 1);
    assert_eq!(
        remaining_entries[0].get("projectId"),
        Some(&json!("untitled-1234"))
    );
}

#[test]
fn autosave_rejects_invalid_project_id() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let temp = TestDir::new_in(&home, "autosave-invalid-id");
    let _autosave_override = AutosaveStorageOverrideGuard::new(temp.join(".nextframe/autosave"));

    let response = dispatch(request(
        "autosave.write",
        json!({
            "projectId": "../escape",
            "timeline": minimal_timeline_json(),
        }),
    ));

    assert!(!response.ok);
    assert_error_contains(&response.error, "invalid autosave project id");
}

#[test]
fn resolve_write_path_expands_home_and_allows_missing_export_dirs() {
    let _home_lock = lock_home_env_for_test();
    let home = home_dir().expect("home dir");
    let result = resolve_write_path("~/Movies/NextFrame/render.mp4")
        .expect("resolve export path under home");
    assert_eq!(result, home.join("Movies/NextFrame/render.mp4"));
}

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

struct MockFfmpegHarness {
    _guard: MutexGuard<'static, ()>,
}

impl MockFfmpegHarness {
    fn new() -> Self {
        let guard = MOCK_FFMPEG_TEST_LOCK
            .get_or_init(|| std::sync::Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        {
            let mut state = mock_ffmpeg_state()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            *state = MockFfmpegState::default();
        }
        reset_ffmpeg_path_cache_for_tests();

        Self { _guard: guard }
    }

    fn set_lookup_result(&self, result: Result<Option<PathBuf>, String>) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.lookup_result = result;
        drop(state);
        reset_ffmpeg_path_cache_for_tests();
    }

    fn push_run_result(&self, result: Result<CommandOutput, String>) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.runs.push_back(result);
    }

    fn take_invocations(&self) -> Vec<FfmpegCommand> {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::mem::take(&mut state.invocations)
    }
}

impl Drop for MockFfmpegHarness {
    fn drop(&mut self) {
        let mut state = mock_ffmpeg_state()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *state = MockFfmpegState::default();
        reset_ffmpeg_path_cache_for_tests();
    }
}

fn request(method: &str, params: Value) -> Request {
    Request {
        id: format!("req-{method}"),
        method: method.to_string(),
        params,
    }
}

fn assert_error_contains(error: &Option<String>, expected: &str) {
    let error = error.as_deref().expect("response should include an error");
    assert!(
        error.contains(expected),
        "expected '{error}' to contain '{expected}'"
    );
}

fn disallowed_absolute_path() -> String {
    if cfg!(windows) {
        "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
    } else {
        "/etc/passwd".to_string()
    }
}

fn absolute_write_rejection_path() -> String {
    if cfg!(windows) {
        "C:\\Windows\\system32\\drivers\\etc\\hosts".to_string()
    } else {
        "/etc/hosts".to_string()
    }
}

fn disallowed_dir_path() -> String {
    if cfg!(windows) {
        "C:\\Windows\\System32".to_string()
    } else {
        "/etc".to_string()
    }
}

fn minimal_timeline_json() -> Value {
    json!({
        "version": 1,
        "metadata": {
            "name": "Test Timeline",
            "fps": 30,
            "width": 1920,
            "height": 1080,
            "durationMs": 1000
        },
        "tracks": []
    })
}

struct RecentStorageOverrideGuard {
    _lock: MutexGuard<'static, ()>,
}

impl RecentStorageOverrideGuard {
    fn new(path: PathBuf) -> Self {
        let lock = recent_storage_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        set_recent_storage_path_override_for_tests(Some(path));
        Self { _lock: lock }
    }
}

impl Drop for RecentStorageOverrideGuard {
    fn drop(&mut self) {
        set_recent_storage_path_override_for_tests(None);
    }
}

struct AutosaveStorageOverrideGuard {
    _lock: MutexGuard<'static, ()>,
}

impl AutosaveStorageOverrideGuard {
    fn new(path: PathBuf) -> Self {
        let lock = autosave_storage_test_lock()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        set_autosave_storage_path_override_for_tests(Some(path));
        Self { _lock: lock }
    }
}

impl Drop for AutosaveStorageOverrideGuard {
    fn drop(&mut self) {
        set_autosave_storage_path_override_for_tests(None);
    }
}

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(label: &str) -> Self {
        Self::new_in(&std::env::temp_dir(), label)
    }

    fn new_in(base: &Path, label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = base.join(format!(
            "nextframe-bridge-{label}-{}-{unique}",
            process::id()
        ));

        fs::create_dir_all(&path).expect("create temp test dir");
        Self { path }
    }

    fn join(&self, child: &str) -> PathBuf {
        self.path.join(child)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = remove_dir_all_if_present(&self.path);
        }
    }
}

fn remove_dir_all_if_present(path: &Path) -> std::io::Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }

    Ok(())
}

#[cfg(unix)]
fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_file_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_file(target, link)
}

#[cfg(unix)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}

// ---------------------------------------------------------------------------
// test-4: HOME env lock infrastructure for project/episode/segment tests
// ---------------------------------------------------------------------------

static HOME_ENV_TEST_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();

struct HomeDirOverrideGuard {
    _lock: MutexGuard<'static, ()>,
    home: Option<OsString>,
    userprofile: Option<OsString>,
    homedrive: Option<OsString>,
    homepath: Option<OsString>,
}

impl HomeDirOverrideGuard {
    fn new(path: &Path) -> Self {
        let lock = lock_home_env_for_test();

        let home = env::var_os("HOME");
        let userprofile = env::var_os("USERPROFILE");
        let homedrive = env::var_os("HOMEDRIVE");
        let homepath = env::var_os("HOMEPATH");

        env::set_var("HOME", path);
        env::remove_var("USERPROFILE");
        env::remove_var("HOMEDRIVE");
        env::remove_var("HOMEPATH");

        Self {
            _lock: lock,
            home,
            userprofile,
            homedrive,
            homepath,
        }
    }
}

fn lock_home_env_for_test() -> MutexGuard<'static, ()> {
    HOME_ENV_TEST_LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Drop for HomeDirOverrideGuard {
    fn drop(&mut self) {
        restore_env_var("HOME", self.home.as_ref());
        restore_env_var("USERPROFILE", self.userprofile.as_ref());
        restore_env_var("HOMEDRIVE", self.homedrive.as_ref());
        restore_env_var("HOMEPATH", self.homepath.as_ref());
    }
}

fn restore_env_var(key: &str, value: Option<&OsString>) {
    match value {
        Some(value) => env::set_var(key, value),
        None => env::remove_var(key),
    }
}

// ---------------------------------------------------------------------------
// test-1: encoding tests
// ---------------------------------------------------------------------------

#[test]
fn encoding_base64_encode_covers_empty_small_and_padding_cases() {
    assert_eq!(super::encoding::base64_encode(b""), "");
    assert_eq!(super::encoding::base64_encode(b"foo"), "Zm9v");
    assert_eq!(super::encoding::base64_encode(b"f"), "Zg==");
    assert_eq!(super::encoding::base64_encode(b"fo"), "Zm8=");
}

#[test]
fn encoding_percent_decode_url_path_decodes_valid_sequences() {
    let decoded = super::encoding::percent_decode_url_path("/folder%20name/%E4%BD%A0%E5%A5%BD.txt")
        .expect("decode valid percent-encoded URL path");

    assert_eq!(decoded, "/folder name/你好.txt");
}

#[test]
fn encoding_percent_decode_url_path_rejects_invalid_hex_digits() {
    let error = super::encoding::percent_decode_url_path("/bad%2Gpath")
        .expect_err("invalid hex digits should fail percent decoding");

    assert_eq!(error, "invalid percent-encoding in URL path: /bad%2Gpath");
}

#[test]
fn encoding_percent_decode_url_path_rejects_partial_sequences() {
    let error = super::encoding::percent_decode_url_path("/bad%")
        .expect_err("partial percent sequence should fail percent decoding");

    assert_eq!(error, "invalid percent-encoding in URL path: /bad%");
}

#[test]
fn encoding_percent_encode_path_preserves_slashes_and_encodes_spaces_and_unicode() {
    let encoded = super::encoding::percent_encode_path("folder name/你好.txt");

    assert_eq!(encoded, "folder%20name/%E4%BD%A0%E5%A5%BD.txt");
}

#[test]
fn encoding_path_to_file_url_formats_absolute_paths() {
    let path = if cfg!(windows) {
        PathBuf::from(r"C:\Temp\clip.mp4")
    } else {
        PathBuf::from("/tmp/clip.mp4")
    };

    let url = super::encoding::path_to_file_url(&path);

    if cfg!(windows) {
        assert_eq!(url, "file:///C:/Temp/clip.mp4");
    } else {
        assert_eq!(url, "file:///tmp/clip.mp4");
    }
}

#[test]
fn encoding_path_to_file_url_encodes_spaces() {
    let path = if cfg!(windows) {
        PathBuf::from(r"C:\Program Files\clip one.mp4")
    } else {
        PathBuf::from("/tmp/clip one.mp4")
    };

    let url = super::encoding::path_to_file_url(&path);

    if cfg!(windows) {
        assert_eq!(url, "file:///C:/Program%20Files/clip%20one.mp4");
    } else {
        assert_eq!(url, "file:///tmp/clip%20one.mp4");
    }
}

#[test]
fn encoding_decode_hex_digit_decodes_numeric_lowercase_uppercase_and_invalid_inputs() {
    assert_eq!(super::encoding::decode_hex_digit(b'0'), Some(0));
    assert_eq!(super::encoding::decode_hex_digit(b'9'), Some(9));
    assert_eq!(super::encoding::decode_hex_digit(b'a'), Some(10));
    assert_eq!(super::encoding::decode_hex_digit(b'f'), Some(15));
    assert_eq!(super::encoding::decode_hex_digit(b'A'), Some(10));
    assert_eq!(super::encoding::decode_hex_digit(b'F'), Some(15));
    assert_eq!(super::encoding::decode_hex_digit(b'g'), None);
    assert_eq!(super::encoding::decode_hex_digit(b'/'), None);
}

// ---------------------------------------------------------------------------
// test-2: validation tests
// ---------------------------------------------------------------------------

#[test]
fn require_object_accepts_object() {
    let params = json!({ "name": "demo", "count": 2 });

    let object = require_object(&params).expect("object params should be accepted");

    assert_eq!(object.get("name"), Some(&json!("demo")));
    assert_eq!(object.get("count"), Some(&json!(2)));
}

#[test]
fn require_object_rejects_null_and_array() {
    let null_error = require_object(&Value::Null)
        .err()
        .expect("null params should return an error");
    assert_eq!(null_error, "params must be a JSON object");

    let array_error = require_object(&json!([1, 2, 3]))
        .err()
        .expect("array params should return an error");
    assert_eq!(array_error, "params must be a JSON object");
}

#[test]
fn require_string_handles_present_missing_and_non_string() {
    let params = json!({
        "name": "demo",
        "count": 2,
    });

    let name = require_string(&params, "name").expect("string value should be accepted");
    assert_eq!(name, "demo");

    let missing_error = require_string(&params, "title")
        .err()
        .expect("missing string should return an error");
    assert_eq!(missing_error, "missing params.title");

    let non_string_error = require_string(&params, "count")
        .err()
        .expect("non-string value should return an error");
    assert_eq!(non_string_error, "params.count must be a string");
}

#[test]
fn require_u32_handles_valid_negative_float_and_missing() {
    let params = json!({
        "count": 42,
        "negative": -1,
        "ratio": 1.5,
    });

    let count = require_u32(&params, "count").expect("unsigned integer should be accepted");
    assert_eq!(count, 42);

    let negative_error = require_u32(&params, "negative")
        .err()
        .expect("negative number should return an error");
    assert_eq!(negative_error, "params.negative must be an unsigned integer");

    let float_error = require_u32(&params, "ratio")
        .err()
        .expect("float should return an error");
    assert_eq!(float_error, "params.ratio must be an unsigned integer");

    let missing_error = require_u32(&params, "missing")
        .err()
        .expect("missing integer should return an error");
    assert_eq!(missing_error, "missing params.missing");
}

#[test]
fn require_positive_u32_rejects_zero() {
    let valid_params = json!({ "count": 7 });
    let zero_params = json!({ "count": 0 });

    let count =
        require_positive_u32(&valid_params, "count").expect("positive integer should be accepted");
    assert_eq!(count, 7);

    let zero_error = require_positive_u32(&zero_params, "count")
        .err()
        .expect("zero should return an error");
    assert_eq!(zero_error, "params.count must be greater than 0");
}

#[test]
fn require_positive_f64_rejects_zero_negative_and_non_number() {
    let valid_params = json!({ "volume": 0.75 });
    let zero_params = json!({ "volume": 0.0 });
    let negative_params = json!({ "volume": -0.25 });
    let string_params = json!({ "volume": "loud" });

    let volume =
        require_positive_f64(&valid_params, "volume").expect("positive number should be accepted");
    assert_eq!(volume, 0.75);

    let zero_error = require_positive_f64(&zero_params, "volume")
        .err()
        .expect("zero should return an error");
    assert_eq!(zero_error, "params.volume must be greater than 0");

    let negative_error = require_positive_f64(&negative_params, "volume")
        .err()
        .expect("negative number should return an error");
    assert_eq!(negative_error, "params.volume must be greater than 0");

    let string_error = require_positive_f64(&string_params, "volume")
        .err()
        .expect("non-number should return an error");
    assert_eq!(string_error, "params.volume must be a number");
}

#[test]
fn require_array_accepts_arrays_and_rejects_non_arrays() {
    let params = json!({
        "items": ["a", "b"],
        "name": "demo",
    });

    let items = require_array(&params, "items").expect("array value should be accepted");
    assert_eq!(items, &vec![json!("a"), json!("b")]);

    let non_array_error = require_array(&params, "name")
        .err()
        .expect("non-array should return an error");
    assert_eq!(non_array_error, "params.name must be an array");
}

#[test]
fn require_value_alias_returns_first_second_or_missing_error() {
    let first_params = json!({
        "primary": "first",
        "secondary": "second",
    });
    let second_params = json!({
        "secondary": "second",
    });
    let missing_params = json!({
        "other": true,
    });

    let first = require_value_alias(&first_params, &["primary", "secondary"])
        .expect("first alias should be returned");
    assert_eq!(first, &json!("first"));

    let second = require_value_alias(&second_params, &["primary", "secondary"])
        .expect("second alias should be returned");
    assert_eq!(second, &json!("second"));

    let missing_error = require_value_alias(&missing_params, &["primary", "secondary"])
        .err()
        .expect("missing aliases should return an error");
    assert_eq!(missing_error, "missing one of params.primary, params.secondary");
}

#[test]
fn read_optional_u8_in_range_handles_in_range_bounds_missing_and_non_number() {
    let in_range_params = json!({ "level": 3 });
    let below_params = json!({ "level": 1 });
    let above_params = json!({ "level": 5 });
    let missing_params = json!({});
    let string_params = json!({ "level": "high" });

    let in_range = read_optional_u8_in_range(&in_range_params, "level", 2, 4)
        .expect("in-range integer should be accepted");
    assert_eq!(in_range, Some(3));

    let below_error = read_optional_u8_in_range(&below_params, "level", 2, 4)
        .err()
        .expect("below-range integer should return an error");
    assert_eq!(below_error, "params.level must be between 2 and 4");

    let above_error = read_optional_u8_in_range(&above_params, "level", 2, 4)
        .err()
        .expect("above-range integer should return an error");
    assert_eq!(above_error, "params.level must be between 2 and 4");

    let missing = read_optional_u8_in_range(&missing_params, "level", 2, 4)
        .expect("missing optional integer should be accepted");
    assert_eq!(missing, None);

    let non_number_error = read_optional_u8_in_range(&string_params, "level", 2, 4)
        .err()
        .expect("non-number should return an error");
    assert_eq!(non_number_error, "params.level must be an unsigned integer");
}

#[test]
fn validate_project_component_allows_valid_names_and_dots() {
    validate_project_component("episode-01", "projectId")
        .expect("plain component should be accepted");
    validate_project_component("episode.cut.v1", "projectId")
        .expect("component containing dots should be accepted");
}

#[test]
fn validate_project_component_rejects_slashes() {
    let error = validate_project_component("folder/name", "projectId")
        .err()
        .expect("slash-containing component should return an error");

    assert_eq!(error, "invalid params.projectId: folder/name");
}

// ---------------------------------------------------------------------------
// test-3: path + time tests
// ---------------------------------------------------------------------------

#[test]
fn path_home_dir_returns_some_on_macos() {
    let dir = path::home_dir();

    #[cfg(target_os = "macos")]
    assert!(dir.is_some(), "expected HOME-derived path on macOS");

    #[cfg(not(target_os = "macos"))]
    let _ = dir;
}

#[test]
fn path_expand_home_dir_expands_and_preserves_expected_inputs() {
    let home = path::home_dir().expect("home directory available for expansion tests");

    assert_eq!(path::expand_home_dir("~"), home);
    assert_eq!(path::expand_home_dir("~/foo"), home.join("foo"));
    assert_eq!(path::expand_home_dir("/abs"), PathBuf::from("/abs"));
    assert_eq!(path::expand_home_dir("relative"), PathBuf::from("relative"));
}

#[test]
fn path_home_root_returns_ok() {
    let root = path::home_root().expect("home root should resolve");
    assert!(!root.as_os_str().is_empty());
}

#[test]
fn path_canonical_or_raw_canonicalizes_existing_and_preserves_missing() {
    let temp = TestDir::new("path-canonical-or-raw");

    let existing = temp.join("exists.txt");
    fs::write(&existing, "fixture").expect("write existing file");
    assert_eq!(
        path::canonical_or_raw(existing.clone()),
        fs::canonicalize(existing).expect("canonicalize existing file"),
    );

    let missing = temp.join("missing.txt");
    assert_eq!(path::canonical_or_raw(missing.clone()), missing);
}

#[test]
fn time_iso_now_matches_iso_8601_utc_format() {
    let now = time::iso_now();
    assert!(
        is_basic_iso_8601_utc(&now),
        "expected ISO 8601 UTC timestamp, got {now}"
    );
}

#[test]
fn time_epoch_days_to_date_matches_known_values() {
    assert_eq!(time::epoch_days_to_date(0), (1970, 1, 1));
    assert_eq!(time::epoch_days_to_date(18_628), (2021, 1, 1));
}

#[test]
fn time_unix_timestamp_secs_returns_reasonable_value() {
    let timestamp = time::unix_timestamp_secs().expect("unix timestamp should be available");
    assert!(timestamp > 1_700_000_000, "unexpected unix timestamp: {timestamp}");
}

#[test]
fn time_trim_float_trims_trailing_zeroes() {
    assert_eq!(time::trim_float(1.000), "1");
    assert_eq!(time::trim_float(1.500), "1.5");
    assert_eq!(time::trim_float(1.234), "1.234");
}

fn is_basic_iso_8601_utc(value: &str) -> bool {
    value.len() == 20
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value.as_bytes()[10] == b'T'
        && value.as_bytes()[13] == b':'
        && value.as_bytes()[16] == b':'
        && value.as_bytes()[19] == b'Z'
        && value
            .chars()
            .enumerate()
            .all(|(index, ch)| matches!(index, 4 | 7 | 10 | 13 | 16 | 19) || ch.is_ascii_digit())
}

// ---------------------------------------------------------------------------
// test-4: project / episode / segment tests
// ---------------------------------------------------------------------------

#[test]
fn project_list_returns_empty_array_for_empty_dir() {
    let temp = TestDir::new("project-list-empty");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    fs::create_dir_all(temp.join("NextFrame/projects")).expect("create projects root");

    let response = dispatch(request("project.list", json!({})));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "projects": [] }));
}

#[test]
fn project_create_creates_dir_and_project_json() {
    let temp = TestDir::new("project-create");
    let _home = HomeDirOverrideGuard::new(&temp.path);

    let response = dispatch(request("project.create", json!({ "name": "alpha" })));

    assert!(response.ok);

    let project_dir = temp.join("NextFrame/projects/alpha");
    let project_json_path = project_dir.join("project.json");
    assert_eq!(
        response.result,
        json!({ "path": project_dir.display().to_string() })
    );
    assert!(project_dir.is_dir());
    assert!(project_json_path.is_file());

    let meta: Value =
        serde_json::from_str(&fs::read_to_string(&project_json_path).expect("read project.json"))
            .expect("parse project.json");
    let created = meta
        .get("created")
        .and_then(Value::as_str)
        .expect("project created timestamp");
    let updated = meta
        .get("updated")
        .and_then(Value::as_str)
        .expect("project updated timestamp");
    assert_eq!(meta.get("name"), Some(&json!("alpha")));
    assert!(!created.is_empty());
    assert!(!updated.is_empty());
    assert_eq!(created, updated);
}

#[test]
fn episode_list_returns_empty_array_for_empty_project() {
    let temp = TestDir::new("episode-list-empty");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_dir = temp.join("NextFrame/projects/alpha");
    fs::create_dir_all(&project_dir).expect("create project dir");
    fs::write(
        project_dir.join("project.json"),
        serde_json::to_string_pretty(&json!({
            "name": "alpha",
            "created": "2000-01-01T00:00:00Z",
            "updated": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize project.json"),
    )
    .expect("write project.json");

    let response = dispatch(request("episode.list", json!({ "project": "alpha" })));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "episodes": [] }));
}

#[test]
fn episode_create_creates_dir_and_updates_project_timestamp() {
    let temp = TestDir::new("episode-create");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let project_dir = temp.join("NextFrame/projects/alpha");
    let project_json_path = project_dir.join("project.json");
    fs::create_dir_all(&project_dir).expect("create project dir");
    fs::write(
        &project_json_path,
        serde_json::to_string_pretty(&json!({
            "name": "alpha",
            "created": "2000-01-01T00:00:00Z",
            "updated": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize project.json"),
    )
    .expect("write project.json");

    let response = dispatch(request(
        "episode.create",
        json!({
            "project": "alpha",
            "name": "ep-01",
        }),
    ));

    assert!(response.ok);

    let episode_dir = project_dir.join("ep-01");
    let episode_json_path = episode_dir.join("episode.json");
    assert_eq!(
        response.result,
        json!({ "path": episode_dir.display().to_string() })
    );
    assert!(episode_dir.is_dir());
    assert!(episode_json_path.is_file());

    let episode_meta: Value =
        serde_json::from_str(&fs::read_to_string(&episode_json_path).expect("read episode.json"))
            .expect("parse episode.json");
    let episode_created = episode_meta
        .get("created")
        .and_then(Value::as_str)
        .expect("episode created timestamp");
    assert_eq!(episode_meta.get("name"), Some(&json!("ep-01")));
    assert_eq!(episode_meta.get("order"), Some(&json!(0)));
    assert!(!episode_created.is_empty());

    let project_meta: Value = serde_json::from_str(
        &fs::read_to_string(&project_json_path).expect("read updated project.json"),
    )
    .expect("parse updated project.json");
    assert_eq!(
        project_meta.get("created"),
        Some(&json!("2000-01-01T00:00:00Z"))
    );
    assert_eq!(project_meta.get("updated"), Some(&json!(episode_created)));
}

#[test]
fn segment_list_returns_empty_array_for_empty_episode() {
    let temp = TestDir::new("segment-list-empty");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_dir = temp.join("NextFrame/projects/alpha/ep-01");
    fs::create_dir_all(&episode_dir).expect("create episode dir");
    fs::write(
        episode_dir.join("episode.json"),
        serde_json::to_string_pretty(&json!({
            "name": "ep-01",
            "order": 0,
            "created": "2000-01-01T00:00:00Z",
        }))
        .expect("serialize episode.json"),
    )
    .expect("write episode.json");

    let response = dispatch(request(
        "segment.list",
        json!({
            "project": "alpha",
            "episode": "ep-01",
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "segments": [] }));
}

#[test]
fn segment_video_url_returns_exists_false_when_file_is_missing() {
    let temp = TestDir::new("segment-video-url-missing");
    let _home = HomeDirOverrideGuard::new(&temp.path);
    let episode_dir = temp.join("NextFrame/projects/alpha/ep-01");
    fs::create_dir_all(&episode_dir).expect("create episode dir");

    let response = dispatch(request(
        "segment.videoUrl",
        json!({
            "project": "alpha",
            "episode": "ep-01",
            "segment": "seg-01",
        }),
    ));

    assert!(response.ok);
    assert_eq!(response.result, json!({ "exists": false }));
}

// ---------------------------------------------------------------------------
// test-7: recorder_bridge tests
// ---------------------------------------------------------------------------

#[test]
fn recorder_request_construction_preserves_fields() {
    let output_path = PathBuf::from("exports/final.mp4");
    let request = RecorderRequest {
        url: "file:///tmp/runtime/web/index.html?record=true".to_string(),
        output_path: output_path.clone(),
        width: 1920,
        height: 1080,
        fps: 60,
        duration: 12.5,
        crf: 18,
    };

    assert_eq!(request.url, "file:///tmp/runtime/web/index.html?record=true");
    assert_eq!(request.output_path, output_path);
    assert_eq!(request.width, 1920);
    assert_eq!(request.height, 1080);
    assert_eq!(request.fps, 60);
    assert_eq!(request.duration, 12.5);
    assert_eq!(request.crf, 18);
}

#[test]
fn build_recording_url_encodes_special_characters_in_path() {
    let temp = TestDir::new("recorder build #1");
    let web_dir = temp.join("runtime/web");
    fs::create_dir_all(&web_dir).expect("create runtime web dir");
    let web_path = web_dir.join("index.html");
    fs::write(&web_path, "<!doctype html>").expect("write recorder frame");

    let url = build_recording_url(&temp.path).expect("build recording url");
    let canonical_web_path = web_path
        .canonicalize()
        .expect("canonicalize recorder frame");
    let raw_path = canonical_web_path.to_string_lossy().replace('\\', "/");
    let encoded_path = raw_path.replace('#', "%23").replace(' ', "%20");
    let prefix = if raw_path.starts_with('/') {
        "file://"
    } else {
        "file:///"
    };

    assert_eq!(url, format!("{prefix}{encoded_path}?record=true"));
    assert!(url.contains("%20"));
    assert!(url.contains("%23"));
}

#[test]
fn resolve_recorder_frame_path_from_file_url_returns_decoded_path() {
    let resolved = resolve_recorder_frame_path_from_url(
        "file://localhost/tmp/recorded%20frame.html?record=true#frame-1",
        Path::new("."),
    )
    .expect("resolve file recorder url");

    assert_eq!(resolved, PathBuf::from("/tmp/recorded frame.html"));
}

#[test]
fn resolve_recorder_frame_path_from_http_url_returns_relative_file() {
    let temp = TestDir::new("recorder-http");
    let frame_path = temp.join("runtime/web/recorded frame.html");
    let frame_parent = frame_path
        .parent()
        .expect("recorder frame path should have parent");
    fs::create_dir_all(frame_parent).expect("create frame parent dir");
    fs::write(&frame_path, "<html></html>").expect("write recorder frame");

    let resolved = resolve_recorder_frame_path_from_url(
        "http://localhost/runtime/web/recorded%20frame.html?record=true#frame-1",
        &temp.path,
    )
    .expect("resolve http recorder url");

    assert_eq!(resolved, frame_path);
}

#[test]
fn resolve_recorder_frame_path_from_invalid_url_returns_error() {
    let result =
        resolve_recorder_frame_path_from_url("ftp://example.com/frame.html", Path::new("."));

    assert_eq!(
        result.as_ref().map_err(std::string::String::as_str),
        Err("unsupported recorder url: ftp://example.com/frame.html")
    );
}

#[test]
fn decode_file_url_path_decodes_percent_encoded_segments() {
    let decoded =
        decode_file_url_path("/tmp/encoded%20dir/Recorder%23One.html").expect("decode file url");

    assert_eq!(decoded, PathBuf::from("/tmp/encoded dir/Recorder#One.html"));
}
