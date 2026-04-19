use nf_tts::{Manifest, ManifestEntry, VoxConfig};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;
use std::time::{SystemTime, UNIX_EPOCH};

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-nf-tts-{label}-{}-{unique}",
            process::id()
        ));
        fs::create_dir_all(&path).expect("create temp test dir");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[test]
fn smoke_config_aliases_and_manifest_write_round_trip() {
    let mut config = VoxConfig {
        default_voice: Some("narrator".to_string()),
        default_dir: Some("exports".to_string()),
        default_backend: Some("edge".to_string()),
        aliases: HashMap::new(),
    };
    config.aliases.insert(
        "narrator".to_string(),
        "en-US-TestMultilingualNeural".to_string(),
    );

    assert_eq!(
        config.configured_voice().as_deref(),
        Some("en-US-TestMultilingualNeural")
    );
    assert_eq!(config.resolve_backend(None), "edge");

    let mut manifest = Manifest::new();
    manifest.add_entry(
        ManifestEntry {
            id: 0,
            text: "hello".to_string(),
            voice: "en-US-TestMultilingualNeural".to_string(),
            backend: "edge".to_string(),
            file: "hello.mp3".to_string(),
            duration_ms: Some(320),
            cached: false,
        },
        false,
    );

    let temp = TestDir::new("smoke");
    let manifest_path = manifest
        .write_to(temp.path())
        .expect("write manifest to disk");
    let manifest_json = fs::read_to_string(&manifest_path).expect("read manifest file");

    assert!(manifest_json.contains("\"total\": 1"));
    assert!(manifest_json.contains("\"hello.mp3\""));
}
