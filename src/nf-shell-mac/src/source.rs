//! Source schema + loader for nf-shell-mac.
//!
//! Mirrors the TypeScript `SourceRaw` / `TrackRaw` / `ClipRaw` / `ViewportRaw`
//! definitions in `src/nf-core-engine/src/types.ts`, which is the single source
//! of truth for cross-boundary data shapes (FM-SHAPE in `spec/mistakes.json`).
//!
//! Field names and types are intentionally kept identical to the TS interfaces
//! (e.g. `viewport.w` / `viewport.h`, `duration: String` as an expression
//! string, `clip.begin` / `clip.end` as expression strings) so JSON written for
//! the TS pipeline deserialises here without a shim layer.
//!
//! Anchors and `params` are deserialised as `serde_json::Value` pass-through:
//! this crate does not evaluate anchor / duration expressions — v1.19 only
//! needs to load the source so a downstream WKWebView can render it.
//!
//! Error handling follows the workspace clippy baseline (`unwrap_used`,
//! `expect_used`, `panic` all denied). `LoadError` is a hand-written enum
//! implementing `Display` + `Error` so we do not need to add `thiserror`.

use std::error::Error;
use std::fmt;
use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Top-level source.json shape. Mirrors TS `SourceRaw`.
/// Also implements Serialize so shell can re-emit JSON into
/// window.__NF_SOURCE__ during html_template::assemble_html.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Source {
    pub viewport: Viewport,
    /// Duration expression (e.g. `"demo.end"`, `"10s"`). Not evaluated here.
    pub duration: String,
    pub tracks: Vec<Track>,
    /// Optional anchors map. Value pass-through — not evaluated here.
    #[serde(default)]
    pub anchors: Option<serde_json::Value>,
    /// Optional metadata bag. Preserved so downstream stages can read it.
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

/// Viewport definition. Mirrors TS `ViewportRaw` — note `w` / `h` (not
/// `width` / `height`) to match the JSON wire format produced by the TS engine.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Viewport {
    pub ratio: String,
    pub w: u32,
    pub h: u32,
}

/// Track definition. Mirrors TS `TrackRaw`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Track {
    pub id: String,
    pub kind: String,
    pub src: String,
    pub clips: Vec<Clip>,
}

/// Clip definition. Mirrors TS `ClipRaw` — `id` is optional; `begin` / `end`
/// are expression strings, not pre-resolved milliseconds.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Clip {
    #[serde(default)]
    pub id: Option<String>,
    pub begin: String,
    pub end: String,
    /// Track-kind specific parameter bag. Pass-through.
    #[serde(default)]
    pub params: serde_json::Value,
}

/// Errors `load_source` can return. Hand-written to avoid adding `thiserror`
/// as a new dependency (task-02 constraint).
#[derive(Debug)]
pub enum LoadError {
    /// File could not be read (missing path, permission, etc).
    Io(io::Error),
    /// File was read but JSON did not match the `Source` schema.
    Parse(serde_json::Error),
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LoadError::Io(err) => write!(f, "nf-shell-mac: source io error: {err}"),
            LoadError::Parse(err) => write!(f, "nf-shell-mac: source parse error: {err}"),
        }
    }
}

impl Error for LoadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            LoadError::Io(err) => Some(err),
            LoadError::Parse(err) => Some(err),
        }
    }
}

impl From<io::Error> for LoadError {
    fn from(err: io::Error) -> Self {
        LoadError::Io(err)
    }
}

impl From<serde_json::Error> for LoadError {
    fn from(err: serde_json::Error) -> Self {
        LoadError::Parse(err)
    }
}

/// Read a source.json file from disk and deserialise into [`Source`].
///
/// Returns [`LoadError::Io`] if the file cannot be read, or
/// [`LoadError::Parse`] if the JSON does not match the schema. Never panics.
pub fn load_source(path: &Path) -> Result<Source, LoadError> {
    let raw = fs::read_to_string(path)?;
    let source: Source = serde_json::from_str(&raw)?;
    Ok(source)
}

/// Deserialise a source from an in-memory JSON string. Useful for tests and
/// for shells that already have the JSON bytes loaded (e.g. drag-drop).
pub fn parse_source(json: &str) -> Result<Source, LoadError> {
    let source: Source = serde_json::from_str(json)?;
    Ok(source)
}
