use std::fs;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use nf_shell_mac::source_file::{SourceWatcher, write_atomic};

#[test]
fn watcher_single_flight_dedupes_rapid_atomic_renames() {
    let root = temp_dir("source-watch");
    let file = root.join("source.json");
    write_atomic(&file, br#"{"seq":0}"#).expect("seed source");

    let callbacks = Arc::new(AtomicUsize::new(0));
    let callbacks_for_watch = Arc::clone(&callbacks);
    let mut watcher = SourceWatcher::watch(&file, move || {
        callbacks_for_watch.fetch_add(1, Ordering::SeqCst);
    })
    .expect("watch source");

    thread::sleep(Duration::from_millis(150));
    for seq in 1..=100usize {
        let payload = format!(r#"{{"seq":{seq}}}"#);
        write_atomic(&file, payload.as_bytes()).expect("write burst event");
    }

    thread::sleep(Duration::from_millis(800));
    watcher.stop().expect("stop watcher");

    let observed = callbacks.load(Ordering::SeqCst);
    assert!(
        observed <= 10,
        "expected >= 90% dedupe for 100 writes, observed {observed} callbacks"
    );

    fs::remove_dir_all(root).expect("cleanup temp dir");
}

fn temp_dir(prefix: &str) -> std::path::PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "nf-shell-mac-{prefix}-{}-{stamp}",
        std::process::id()
    ));
    fs::create_dir_all(&path).expect("create temp dir");
    path
}
