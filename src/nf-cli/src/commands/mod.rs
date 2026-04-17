pub mod ai_ops;
pub mod build;
pub mod record;
pub mod validate;

pub use self::ai_ops::AiOpsCmd;

#[derive(Debug)]
pub struct CommandOutput {
    pub value: Option<serde_json::Value>,
    pub exit_code: i32,
}

impl CommandOutput {
    pub fn json(value: serde_json::Value) -> Self {
        Self {
            value: Some(value),
            exit_code: 0,
        }
    }

    pub fn json_with_exit(value: serde_json::Value, exit_code: i32) -> Self {
        Self {
            value: Some(value),
            exit_code,
        }
    }

    pub fn empty() -> Self {
        Self {
            value: None,
            exit_code: 0,
        }
    }
}
