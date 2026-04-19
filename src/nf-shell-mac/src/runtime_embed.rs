// runtime_embed · compile-time embedding of runtime IIFE + 7 official track
// sources into the nf-shell-mac binary (ADR-057 "shell consumer").
//
// Why include_str!
// - shell runs as a single binary without external files.
// - build.rs is not required: include_str! re-reads on any change.
//   (If cargo ever misses a rebuild, touch build.rs with a rerun-if-changed
//   line covering dist/runtime-iife.js — FM-RUNTIME-IIFE-STALE.)

/// Runtime JS (IIFE form) · produced by `src/nf-runtime/scripts/emit-iife.mjs`.
/// Exposes `window.__nf_boot` + `window.NFRuntime` on load.
pub const RUNTIME_JS: &str = include_str!("../../nf-runtime/dist/runtime-iife.js");

/// A single track kind's JS source.
#[derive(Debug, Clone, Copy)]
pub struct TrackSource {
    pub kind: &'static str,
    pub src: &'static str,
}

/// All 7 official track sources bundled at compile time.
pub const TRACK_SOURCES: &[TrackSource] = &[
    TrackSource {
        kind: "video",
        src: include_str!("../../nf-tracks/official/video.js"),
    },
    TrackSource {
        kind: "bg",
        src: include_str!("../../nf-tracks/official/bg.js"),
    },
    TrackSource {
        kind: "scene",
        src: include_str!("../../nf-tracks/official/scene.js"),
    },
    TrackSource {
        kind: "chart",
        src: include_str!("../../nf-tracks/official/chart.js"),
    },
    TrackSource {
        kind: "data",
        src: include_str!("../../nf-tracks/official/data.js"),
    },
    TrackSource {
        kind: "subtitle",
        src: include_str!("../../nf-tracks/official/subtitle.js"),
    },
    TrackSource {
        kind: "audio",
        src: include_str!("../../nf-tracks/official/audio.js"),
    },
];

/// Look up the JS source for a given track `kind`. Returns `None` if the kind
/// is not an official track (caller emits `E_UNKNOWN_KIND`).
pub fn track_source_by_kind(kind: &str) -> Option<&'static str> {
    TRACK_SOURCES
        .iter()
        .find(|t| t.kind == kind)
        .map(|t| t.src)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn runtime_js_is_non_empty_and_contains_boot_symbol() {
        assert!(!RUNTIME_JS.is_empty());
        assert!(
            RUNTIME_JS.contains("__nf_boot") || RUNTIME_JS.contains("NFRuntime"),
            "runtime IIFE missing boot/NFRuntime symbol — stale dist? (FM-RUNTIME-IIFE-STALE)"
        );
    }

    #[test]
    fn all_seven_track_kinds_present_and_non_empty() {
        let expected = [
            "video", "bg", "scene", "chart", "data", "subtitle", "audio",
        ];
        assert_eq!(TRACK_SOURCES.len(), expected.len());
        for kind in expected {
            let src = track_source_by_kind(kind).unwrap_or("");
            assert!(!src.is_empty(), "track {kind} source is empty (kind not registered?)");
        }
    }

    #[test]
    fn unknown_kind_returns_none() {
        assert!(track_source_by_kind("does-not-exist").is_none());
    }
}
