use std::io;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum NfError {
    #[error("unknown project: {slug}")]
    UnknownProject { slug: String, hint: String },
    #[error("unknown episode: {slug}")]
    UnknownEpisode { slug: String, hint: String },
    #[error("unknown clip: {slug}")]
    UnknownClip { slug: String, hint: String },
    #[error("unknown log entry: {id}")]
    UnknownLog { id: String, hint: String },
    #[error("slug already exists: {slug}")]
    SlugExists { slug: String, hint: String },
    #[error("invalid slug: {slug}")]
    SlugInvalid { slug: String, hint: String },
    #[error("IPC socket failed: {0}")]
    SocketFailed(String),
    #[error("storage failed: {0}")]
    StorageFailed(String),
    #[error("validation failed: {0}")]
    ValidationFailed(String),
    #[error("not implemented: {0}")]
    NotImplemented(String),
    #[error("selector not found: {selector}")]
    SelectorNotFound { selector: String, hint: String },
    #[error("element not clickable: {selector}")]
    NotClickable { selector: String, hint: String },
    #[error("operation needs --confirm")]
    NeedsConfirm { hint: String },
    #[error("resource is still referenced: {detail}")]
    Referenced { detail: String, hint: String },
    #[error("{detail}")]
    Remote {
        error: String,
        detail: String,
        hint: String,
        exit_code: u8,
    },
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
            Self::SelectorNotFound { .. } => 3,
            Self::NotClickable { .. } => 4,
            Self::UnknownProject { .. }
            | Self::UnknownEpisode { .. }
            | Self::UnknownClip { .. }
            | Self::UnknownLog { .. } => 5,
            Self::SlugExists { .. } => 6,
            Self::NeedsConfirm { .. } => 7,
            Self::Referenced { .. } => 8,
            Self::SlugInvalid { .. } | Self::ValidationFailed(_) | Self::NotImplemented(_) => 2,
            Self::Remote { exit_code, .. } => *exit_code,
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
            Self::SelectorNotFound { .. } => "selector not found",
            Self::NotClickable { .. } => "not clickable",
            Self::NeedsConfirm { .. } => "needs confirm",
            Self::Referenced { .. } => "referenced",
            Self::Remote { .. } => "remote error",
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
            | Self::SelectorNotFound { hint, .. }
            | Self::NotClickable { hint, .. }
            | Self::NeedsConfirm { hint }
            | Self::Referenced { hint, .. } => hint.clone(),
            Self::Remote { hint, .. } => hint.clone(),
            Self::SocketFailed(_) => {
                "start nf-shell with `nf open` or check the socket path".to_string()
            }
            Self::StorageFailed(_) => {
                "check ~/.nextframe permissions and JSON validity".to_string()
            }
            Self::ValidationFailed(_) => {
                "run `nf help <command>` for accepted arguments".to_string()
            }
            Self::NotImplemented(_) => {
                "this command is reserved for a later v0.2 work wave".to_string()
            }
        }
    }

    pub fn detail(&self) -> String {
        match self {
            Self::Remote { detail, .. } => detail.clone(),
            _ => self.to_string(),
        }
    }

    pub fn to_record(&self) -> ErrorRecord {
        ErrorRecord {
            error: match self {
                Self::Remote { error, .. } => error.clone(),
                _ => self.error_type().to_string(),
            },
            detail: self.detail(),
            hint: self.hint(),
            exit_code: self.exit_code(),
        }
    }

    pub fn to_stderr_json(&self) -> String {
        match serde_json::to_string(&self.to_record()) {
            Ok(json) => json,
            Err(json_err) => {
                format!(
                    "{{\"error\":\"serialization failed\",\"detail\":\"{}\",\"hint\":\"report nf-cli error serialization\",\"exit_code\":2}}",
                    json_err
                )
            }
        }
    }

    pub fn write_stderr(&self) {
        eprintln!("{}", self.to_stderr_json());
    }
}

impl From<io::Error> for NfError {
    fn from(value: io::Error) -> Self {
        Self::SocketFailed(value.to_string())
    }
}

impl From<serde_json::Error> for NfError {
    fn from(value: serde_json::Error) -> Self {
        Self::ValidationFailed(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::NfError;

    #[test]
    fn serializes_error_as_stderr_json() -> Result<(), Box<dyn std::error::Error>> {
        let err = NfError::UnknownProject {
            slug: "typo".to_string(),
            hint: "nf projects list".to_string(),
        };

        let json = err.to_stderr_json();
        let value: serde_json::Value = serde_json::from_str(&json)?;

        assert_eq!(value["error"], "unknown project");
        assert_eq!(value["hint"], "nf projects list");
        assert_eq!(value["exit_code"], 5);

        Ok(())
    }
}
