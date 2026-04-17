use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use nf_shell_mac::source_file::write_atomic;

#[test]
fn atomic_write_never_exposes_partial_contents() {
    let root = temp_dir("atomic-write");
    let file = root.join("source.json");
    let original = br#"{"seq":0,"payload":"stable"}"#.to_vec();
    let updated = format!(r#"{{"seq":1,"payload":"{}"}}"#, "x".repeat(32_768)).into_bytes();

    write_atomic(&file, &original).expect("seed source");

    let stop = Arc::new(AtomicBool::new(false));
    let reader_stop = Arc::clone(&stop);
    let reader_file = file.clone();
    let original_expected = original.clone();
    let updated_expected = updated.clone();
    let reader = thread::spawn(move || {
        while !reader_stop.load(Ordering::SeqCst) {
            let bytes = fs::read(&reader_file).expect("read source");
            assert!(
                bytes == original_expected || bytes == updated_expected,
                "reader observed torn contents"
            );
        }
    });

    for _ in 0..32 {
        write_atomic(&file, &updated).expect("write update");
        write_atomic(&file, &original).expect("restore original");
    }
    write_atomic(&file, &updated).expect("final update");

    thread::sleep(Duration::from_millis(30));
    stop.store(true, Ordering::SeqCst);
    reader.join().expect("reader thread join");

    let final_bytes = fs::read(&file).expect("read final source");
    assert_eq!(final_bytes, updated);

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
