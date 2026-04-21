//! output naming helpers
use std::path::{Path, PathBuf};

pub fn sequential_name(id: usize) -> String {
    format!("{id:03}.mp3")
}

pub fn hash_name(text: &str, voice: &str, rate: &str, pitch: &str, volume: &str) -> String {
    let input = format!("{text}\0{voice}\0{rate}\0{pitch}\0{volume}");
    let hash = blake3::hash(input.as_bytes());
    let bytes = hash.as_bytes();
    format!("{:02x}{:02x}{:02x}.mp3", bytes[0], bytes[1], bytes[2])
}

/// Resolve the directory where the primary audio file and its sidecars
/// (timeline.json, srt) should be written.
///
/// * `base_dir` — the directory passed via `-d/--dir`.
/// * `filename` — the final output filename (e.g. `fb.mp3`).
/// * `subdir`  — when true, nest outputs under `{base_dir}/{stem}/` for
///   explicit isolation (old default). When false (new default), outputs
///   land flat in `base_dir`.
pub fn resolve_output_dir(base_dir: &Path, filename: &str, subdir: bool) -> PathBuf {
    if !subdir {
        return base_dir.to_path_buf();
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("vox-output");
    base_dir.join(stem)
}

#[cfg(test)]
mod tests {
    use super::resolve_output_dir;
    use std::path::PathBuf;

    #[test]
    fn resolve_output_dir_flat_by_default() {
        let base = PathBuf::from("/tmp/nftts-flat");
        let resolved = resolve_output_dir(&base, "fb.mp3", false);
        assert_eq!(resolved, PathBuf::from("/tmp/nftts-flat"));
    }

    #[test]
    fn resolve_output_dir_subdir_uses_stem() {
        let base = PathBuf::from("/tmp/nftts-sub");
        let resolved = resolve_output_dir(&base, "fb.mp3", true);
        assert_eq!(resolved, PathBuf::from("/tmp/nftts-sub/fb"));
    }

    #[test]
    fn resolve_output_dir_subdir_handles_nested_name() {
        let base = PathBuf::from("out");
        let resolved = resolve_output_dir(&base, "v1.12-demo.mp3", true);
        assert_eq!(resolved, PathBuf::from("out/v1.12-demo"));
    }

    #[test]
    fn resolve_output_dir_subdir_falls_back_when_stem_missing() {
        let base = PathBuf::from("out");
        // empty filename -> fallback stem
        let resolved = resolve_output_dir(&base, "", true);
        assert_eq!(resolved, PathBuf::from("out/vox-output"));
    }
}
