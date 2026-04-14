use serde::Serialize;

#[derive(Serialize)]
pub struct Event<'a> {
    id: usize,
    status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cached: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<&'a str>,
}

impl<'a> Event<'a> {
    pub fn queued(id: usize) -> Self {
        Self {
            id,
            status: "queued",
            file: None,
            duration_ms: None,
            cached: None,
            message: None,
        }
    }

    pub fn started(id: usize) -> Self {
        Self {
            id,
            status: "started",
            file: None,
            duration_ms: None,
            cached: None,
            message: None,
        }
    }

    pub fn done(id: usize, file: &'a str, cached: bool, duration_ms: Option<u64>) -> Self {
        Self {
            id,
            status: "done",
            file: Some(file),
            duration_ms,
            cached: Some(cached),
            message: None,
        }
    }

    pub fn error(id: usize, message: &'a str) -> Self {
        Self {
            id,
            status: "error",
            file: None,
            duration_ms: None,
            cached: None,
            message: Some(message),
        }
    }

    pub fn emit(&self) {
        if let Ok(line) = serde_json::to_string(self) {
            println!("{line}");
        }
    }
}
