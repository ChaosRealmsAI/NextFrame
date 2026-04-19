// html_template · assemble an in-memory HTML string that bootstraps the
// nf-runtime against a given Source, then loadHTMLString-injects into the
// shell's WKWebView.
//
// Design (ADR-057):
// - No intermediate bundle.html file. Pure in-process string build.
// - Runtime JS is compile-time embedded (runtime_embed::RUNTIME_JS).
// - Only the track kinds actually used by this source get shipped in the
//   tracks map (kind → source), keyed by first-seen order via deduplication.
//
// Safety rails (FM-SHAPE + bundler.ts parity):
// - Any JSON placed inside <script> must escape `</script` / `<!--` / `]]>`
//   to prevent premature script termination or HTML-comment injection.
// - Tracks map uses only dedup'd kinds used by the source — not all 7 — to
//   keep payload tight.

use crate::runtime_embed::{track_source_by_kind, RUNTIME_JS};
use crate::source::Source;
use std::collections::BTreeMap;

/// HTML skeleton injected into the WKWebView on load. Ordering matters:
/// 1. `__NF_SOURCE__` (data) before runtime boot.
/// 2. `__NF_TRACKS__` (code-as-strings map) before runtime boot.
/// 3. runtime IIFE defines `window.__nf_boot`.
/// 4. final boot script calls `__nf_boot({ stage, source, tracks, autoplay:false })`.
const TEMPLATE: &str = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;padding:0;background:#000;color:#fff;overflow:hidden;font-family:-apple-system,system-ui,sans-serif}
#nf-stage{width:100vw;height:100vh;position:relative}
</style>
</head><body>
<div id="nf-stage"></div>
<script>window.__NF_SOURCE__ = {{SOURCE_JSON}};</script>
<script>window.__NF_TRACKS__ = {{TRACKS_MAP}};</script>
<script>{{RUNTIME_IIFE}}</script>
<script>if(window.__nf_boot){window.nfHandle=window.__nf_boot({stage:'#nf-stage', source:window.__NF_SOURCE__, tracks:window.__NF_TRACKS__, autoplay:false});}</script>
</body></html>"#;

/// Errors produced while assembling the HTML.
/// Hand-written impls (no thiserror) to match workspace dep policy.
#[derive(Debug)]
pub enum AssembleError {
    /// A track in the source declared a `kind` that has no official track source.
    UnknownKind(String),
    /// serde_json failed to serialize the source.
    Serialize(serde_json::Error),
}

impl std::fmt::Display for AssembleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AssembleError::UnknownKind(k) => write!(
                f,
                "E_UNKNOWN_KIND: no official track source registered for kind `{k}`"
            ),
            AssembleError::Serialize(e) => {
                write!(f, "E_SERIALIZE: failed to serialize source: {e}")
            }
        }
    }
}

impl std::error::Error for AssembleError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AssembleError::UnknownKind(_) => None,
            AssembleError::Serialize(e) => Some(e),
        }
    }
}

impl From<serde_json::Error> for AssembleError {
    fn from(e: serde_json::Error) -> Self {
        AssembleError::Serialize(e)
    }
}

/// Escape a string so it is safe to place inside a `<script>…</script>`.
/// Mirrors `src/nf-core-engine/src/bundler.ts::escapeForScript`.
///
/// Rules (must match bundler parity):
/// - `</script` (case-insensitive on the tag name) → `<\/script`
/// - `<!--` → `<\!--`
/// - `]]>` → `]]\u003E`
///
/// This is applied to the serialized JSON strings (`SOURCE_JSON`, `TRACKS_MAP`)
/// but NOT to the runtime IIFE itself — the IIFE is trusted source we ship.
fn escape_for_script(s: &str) -> String {
    // </script case-insensitive replacement. Ripgrep-style: walk bytes, detect
    // the literal "</" followed by any-case "script", insert "\".
    // Given JSON strings are small (KBs at most), a simple scan is fine.
    let lower = s.to_ascii_lowercase();
    let bytes = s.as_bytes();
    let lbytes = lower.as_bytes();
    let mut out = String::with_capacity(s.len() + 8);
    let mut i = 0usize;
    while i < bytes.len() {
        // Check `</script` (8 bytes) case-insensitively via the lowercased copy.
        if i + 8 <= lbytes.len() && &lbytes[i..i + 8] == b"</script" {
            out.push_str("<\\/");
            // preserve original casing of "script"
            out.push_str(std::str::from_utf8(&bytes[i + 2..i + 8]).unwrap_or("script"));
            i += 8;
            continue;
        }
        // Check `<!--`
        if i + 4 <= bytes.len() && &bytes[i..i + 4] == b"<!--" {
            out.push_str("<\\!--");
            i += 4;
            continue;
        }
        // Check `]]>`
        if i + 3 <= bytes.len() && &bytes[i..i + 3] == b"]]>" {
            out.push_str("]]\\u003E");
            i += 3;
            continue;
        }
        // Push one char (handle UTF-8 boundaries).
        let ch_len = utf8_char_len(bytes[i]);
        // Fallback: if ch_len says we'd exceed, push single byte as lossy.
        let end = (i + ch_len).min(bytes.len());
        out.push_str(std::str::from_utf8(&bytes[i..end]).unwrap_or(""));
        i = end;
    }
    out
}

/// Return the UTF-8 code-unit length for a leading byte. Returns 1 for both
/// ASCII and stray continuation bytes — the caller uses a lossy fallback if
/// the slice happens to be invalid UTF-8 (which the serde_json serializer
/// guarantees won't happen here anyway).
fn utf8_char_len(b: u8) -> usize {
    match b {
        b if b < 0xC0 => 1, // ASCII or continuation byte treated as single.
        b if b < 0xE0 => 2,
        b if b < 0xF0 => 3,
        _ => 4,
    }
}

/// Assemble the full HTML document string for the given source.
///
/// Steps:
/// 1. Serialize `source` to JSON, then script-escape.
/// 2. For each unique track kind used by `source.tracks`, look up its JS
///    source from `runtime_embed::TRACK_SOURCES`; fail on unknown kind.
/// 3. Serialize the `{ kind: source_js }` map to JSON, then script-escape.
/// 4. Substitute `{{SOURCE_JSON}}`, `{{TRACKS_MAP}}`, `{{RUNTIME_IIFE}}`.
pub fn assemble_html(source: &Source) -> Result<String, AssembleError> {
    // 1. Source → JSON (escaped for <script>).
    let source_json_raw = serde_json::to_string(source)?;
    let source_json = escape_for_script(&source_json_raw);

    // 2. Build deduplicated tracks map (BTreeMap for deterministic output).
    let mut tracks_map: BTreeMap<&str, &'static str> = BTreeMap::new();
    for track in &source.tracks {
        if tracks_map.contains_key(track.kind.as_str()) {
            continue;
        }
        let js = track_source_by_kind(&track.kind)
            .ok_or_else(|| AssembleError::UnknownKind(track.kind.clone()))?;
        tracks_map.insert(track.kind.as_str(), js);
    }

    // 3. Map → JSON (escaped).
    let tracks_json_raw = serde_json::to_string(&tracks_map)?;
    let tracks_json = escape_for_script(&tracks_json_raw);

    // 4. Substitute. The runtime IIFE is injected verbatim — it is trusted
    //    source that ships with the binary.
    let html = TEMPLATE
        .replace("{{SOURCE_JSON}}", &source_json)
        .replace("{{TRACKS_MAP}}", &tracks_json)
        .replace("{{RUNTIME_IIFE}}", RUNTIME_JS);

    Ok(html)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    #![allow(clippy::expect_used)]
    use super::*;

    #[test]
    fn escape_rewrites_script_close_case_insensitive() {
        assert_eq!(escape_for_script("</script>"), "<\\/script>");
        assert_eq!(escape_for_script("</SCRIPT>"), "<\\/SCRIPT>");
        assert_eq!(escape_for_script("</ScRiPt foo"), "<\\/ScRiPt foo");
    }

    #[test]
    fn escape_rewrites_html_comment_open() {
        assert_eq!(escape_for_script("a<!--b-->c"), "a<\\!--b-->c");
    }

    #[test]
    fn escape_rewrites_cdata_close() {
        assert_eq!(escape_for_script("foo]]>bar"), "foo]]\\u003Ebar");
    }

    #[test]
    fn escape_preserves_unicode() {
        // Chinese + emoji round-trip. (Not exhaustive — just a smoke test.)
        let s = "你好 🎬 video";
        assert_eq!(escape_for_script(s), s);
    }
}
