//! nf-tts library exports
mod config;
mod output {
    pub(crate) mod manifest;
}

pub use config::VoxConfig;
pub use output::manifest::{Manifest, ManifestEntry};

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]

    use super::*;

    // ── VoxConfig ──────────────────────────────────────────────

    #[test]
    fn resolve_voice_returns_alias_when_present() {
        let mut cfg = VoxConfig::default();
        cfg.aliases
            .insert("narrator".to_string(), "en-US-AriaNeural".to_string());

        assert_eq!(cfg.resolve_voice("narrator"), "en-US-AriaNeural");
    }

    #[test]
    fn resolve_voice_returns_raw_name_when_no_alias() {
        let cfg = VoxConfig::default();
        assert_eq!(
            cfg.resolve_voice("zh-CN-XiaoxiaoNeural"),
            "zh-CN-XiaoxiaoNeural"
        );
    }

    #[test]
    fn resolve_backend_falls_back_to_edge() {
        let cfg = VoxConfig::default();
        // No explicit backend, no config default → "edge"
        assert_eq!(cfg.resolve_backend(None), "edge");
    }

    #[test]
    fn resolve_backend_prefers_explicit_over_config_default() {
        let mut cfg = VoxConfig::default();
        cfg.default_backend = Some("volcengine".to_string());

        // Explicit arg wins over config default
        assert_eq!(cfg.resolve_backend(Some("edge".to_string())), "edge");
        // Falls back to config default when arg is None
        assert_eq!(cfg.resolve_backend(None), "volcengine");
    }

    #[test]
    fn configured_voice_resolves_through_alias() {
        let mut cfg = VoxConfig::default();
        cfg.default_voice = Some("narrator".to_string());
        cfg.aliases
            .insert("narrator".to_string(), "en-US-GuyNeural".to_string());

        assert_eq!(cfg.configured_voice().unwrap(), "en-US-GuyNeural");
    }

    #[test]
    fn configured_voice_returns_none_when_unset() {
        let cfg = VoxConfig::default();
        assert!(cfg.configured_voice().is_none());
    }

    // ── Manifest ───────────────────────────────────────────────

    #[test]
    fn manifest_tracks_counts_correctly() {
        let mut m = Manifest::new();
        assert_eq!(m.total, 0);

        m.add_entry(
            ManifestEntry {
                id: 1,
                text: "hello".into(),
                voice: "v".into(),
                backend: "edge".into(),
                file: "1.mp3".into(),
                duration_ms: Some(500),
                cached: false,
            },
            false,
        );
        m.add_entry(
            ManifestEntry {
                id: 2,
                text: "world".into(),
                voice: "v".into(),
                backend: "edge".into(),
                file: "2.mp3".into(),
                duration_ms: None,
                cached: true,
            },
            true,
        );

        assert_eq!(m.total, 2);
        assert_eq!(m.synthesized, 1);
        assert_eq!(m.cached, 1);
        assert_eq!(m.errors, 0);
        assert_eq!(m.entries.len(), 2);
    }

    #[test]
    fn manifest_write_produces_valid_json() {
        let dir = std::env::temp_dir().join(format!("nf-tts-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let mut m = Manifest::new();
        m.add_entry(
            ManifestEntry {
                id: 1,
                text: "test".into(),
                voice: "v".into(),
                backend: "edge".into(),
                file: "1.mp3".into(),
                duration_ms: Some(100),
                cached: false,
            },
            false,
        );

        let path_str = m.write_to(&dir).unwrap();
        let content = std::fs::read_to_string(&path_str).unwrap();
        let roundtrip: Manifest = serde_json::from_str(&content).unwrap();

        assert_eq!(roundtrip.total, 1);
        assert_eq!(roundtrip.entries[0].text, "test");

        // Cleanup
        let _ = std::fs::remove_dir_all(&dir);
    }
}
