use std::io;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NfError {
    #[error("unknown project '{slug}' · hint: {hint}")]
    UnknownProject { slug: String, hint: String },
    #[error("unknown episode '{slug}' · hint: {hint}")]
    UnknownEpisode { slug: String, hint: String },
    #[error("unknown clip '{slug}' · hint: {hint}")]
    UnknownClip { slug: String, hint: String },
    #[error("unknown log entry '{id}' · hint: {hint}")]
    UnknownLog { id: String, hint: String },
    #[error("slug '{slug}' already exists · hint: {hint}")]
    SlugExists { slug: String, hint: String },
    #[error("invalid slug '{slug}' · hint: {hint}")]
    SlugInvalid { slug: String, hint: String },
    #[error("IPC socket failed: {0}")]
    SocketFailed(String),
    #[error("storage failed: {0}")]
    StorageFailed(String),
    #[error("{0} · see `nf <cmd> --help` for expected format")]
    ValidationFailed(String),
    #[error("not implemented: {0}")]
    NotImplemented(String),
    #[error("operation needs --confirm · hint: {hint}")]
    NeedsConfirm { hint: String },
    #[error("resource is still referenced: {detail} · hint: {hint}")]
    Referenced { detail: String, hint: String },
}

#[derive(Debug, Serialize)]
pub struct ErrorRecord {
    pub error: String,
    pub detail: String,
    pub hint: String,
    pub exit_code: u8,
}

impl NfError {
    pub fn exit_code(&self) -> u8 {
        match self {
            Self::SocketFailed(_) | Self::StorageFailed(_) => 1,
            Self::UnknownProject { .. }
            | Self::UnknownEpisode { .. }
            | Self::UnknownClip { .. }
            | Self::UnknownLog { .. } => 5,
            Self::SlugExists { .. } => 6,
            Self::NeedsConfirm { .. } => 7,
            Self::Referenced { .. } => 8,
            Self::SlugInvalid { .. } | Self::ValidationFailed(_) | Self::NotImplemented(_) => 2,
        }
    }

    pub fn error_type(&self) -> &'static str {
        match self {
            Self::UnknownProject { .. } => "unknown project",
            Self::UnknownEpisode { .. } => "unknown episode",
            Self::UnknownClip { .. } => "unknown clip",
            Self::UnknownLog { .. } => "unknown log",
            Self::SlugExists { .. } => "slug exists",
            Self::SlugInvalid { .. } => "slug invalid",
            Self::SocketFailed(_) => "socket failed",
            Self::StorageFailed(_) => "storage failed",
            Self::ValidationFailed(_) => "validation failed",
            Self::NotImplemented(_) => "not implemented",
            Self::NeedsConfirm { .. } => "needs confirm",
            Self::Referenced { .. } => "referenced",
        }
    }

    pub fn hint(&self) -> String {
        match self {
            Self::UnknownProject { hint, .. }
            | Self::UnknownEpisode { hint, .. }
            | Self::UnknownClip { hint, .. }
            | Self::UnknownLog { hint, .. }
            | Self::SlugExists { hint, .. }
            | Self::SlugInvalid { hint, .. }
            | Self::NeedsConfirm { hint }
            | Self::Referenced { hint, .. } => hint.clone(),
            Self::SocketFailed(_) => "remove a stale socket or restart nf-shell".to_string(),
            Self::StorageFailed(_) => {
                "check ~/.nextframe permissions and JSON validity".to_string()
            }
            Self::ValidationFailed(_) => {
                "run `nf help <command>` for accepted arguments".to_string()
            }
            Self::NotImplemented(_) => {
                "this operation is reserved for a later v0.2 work wave".to_string()
            }
        }
    }

    pub fn to_record(&self) -> ErrorRecord {
        ErrorRecord {
            error: self.error_type().to_string(),
            detail: self.to_string(),
            hint: self.hint(),
            exit_code: self.exit_code(),
        }
    }
}

impl From<io::Error> for NfError {
    fn from(value: io::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}

impl From<serde_json::Error> for NfError {
    fn from(value: serde_json::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}
