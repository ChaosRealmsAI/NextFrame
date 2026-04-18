//! Error envelope — every failure serializes to the error shape defined in
//! interfaces.json §1 (`{"ok":false,"error":{"code","message","hint?","location?"}}`).
//!
//! Exit codes follow interfaces.json §1:
//!   1 = user input (bad args / missing file / invalid JSON)
//!   2 = spec violation (schema / anchor cycle / track ABI)
//!   3 = internal (engine crash / IO)
//!   4 = timeout

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CliError {
    #[error("{message}")]
    UserInput {
        code: &'static str,
        message: String,
        hint: Option<String>,
    },

    #[error("{message}")]
    SpecViolation {
        code: String,
        message: String,
        hint: Option<String>,
        location: Option<serde_json::Value>,
    },

    #[error("{message}")]
    Internal {
        code: &'static str,
        message: String,
        hint: Option<String>,
    },
}

impl CliError {
    pub fn exit_code(&self) -> u8 {
        match self {
            CliError::UserInput { .. } => 1,
            CliError::SpecViolation { .. } => 2,
            CliError::Internal { .. } => 3,
        }
    }

    pub fn engine_not_found(path: &str) -> Self {
        CliError::Internal {
            code: "E_ENGINE_NOT_FOUND",
            message: format!("engine.js not found at {path}"),
            hint: Some(
                "Build the engine: cd src/nf-core-engine && npm run build. Or set NF_ENGINE_PATH env var."
                    .into(),
            ),
        }
    }

    pub fn engine_spawn(message: String) -> Self {
        CliError::Internal {
            code: "E_ENGINE_SPAWN",
            message,
            hint: Some("Ensure `node` is installed and on PATH.".into()),
        }
    }

    pub fn engine_stdout_parse(line: String) -> Self {
        CliError::Internal {
            code: "E_ENGINE_STDOUT",
            message: format!("could not parse engine stdout line: {line}"),
            hint: Some("Engine must emit JSON-only stdout per rule-ai-operable.".into()),
        }
    }

    pub fn io_read(path: &str, err: std::io::Error) -> Self {
        CliError::UserInput {
            code: "E_IO_READ",
            message: format!("cannot read {path}: {err}"),
            hint: Some("Check the path exists and is readable.".into()),
        }
    }

    pub fn io_write(path: &str, err: std::io::Error) -> Self {
        CliError::Internal {
            code: "E_IO_WRITE",
            message: format!("cannot write {path}: {err}"),
            hint: Some("Check the directory is writable.".into()),
        }
    }

    /// Convert an engine-emitted `{"error":{...}}` payload into a CliError.
    pub fn from_engine_error(err: &serde_json::Value) -> Self {
        let code = err
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or("E_ENGINE")
            .to_string();
        let message = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("engine error")
            .to_string();
        let hint = err
            .get("fix_hint")
            .or_else(|| err.get("hint"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let location = err.get("loc").cloned();
        CliError::SpecViolation {
            code,
            message,
            hint,
            location,
        }
    }
}

#[derive(Serialize)]
pub struct ErrorPayload<'a> {
    pub code: &'a str,
    pub message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<&'a serde_json::Value>,
}

impl CliError {
    pub fn payload(&self) -> ErrorPayload<'_> {
        match self {
            CliError::UserInput {
                code,
                message,
                hint,
            } => ErrorPayload {
                code,
                message,
                hint: hint.as_deref(),
                location: None,
            },
            CliError::SpecViolation {
                code,
                message,
                hint,
                location,
            } => ErrorPayload {
                code: code.as_str(),
                message,
                hint: hint.as_deref(),
                location: location.as_ref(),
            },
            CliError::Internal {
                code,
                message,
                hint,
            } => ErrorPayload {
                code,
                message,
                hint: hint.as_deref(),
                location: None,
            },
        }
    }
}
