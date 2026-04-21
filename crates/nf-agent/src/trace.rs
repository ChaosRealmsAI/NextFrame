use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{Map, Value, json};

#[derive(Debug, Clone)]
pub struct TraceWriter {
    path: Option<PathBuf>,
    lock: Arc<Mutex<()>>,
}

impl TraceWriter {
    pub fn new(path: Option<impl Into<PathBuf>>) -> Self {
        Self {
            path: path.map(Into::into),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn emit(&self, event: &str, data: Value) {
        let Some(path) = &self.path else {
            return;
        };

        let Ok(_guard) = self.lock.lock() else {
            return;
        };

        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let mut line = Map::new();
        line.insert("t".to_owned(), json!(unix_ms_now()));
        line.insert("event".to_owned(), json!(event));
        if let Value::Object(fields) = data {
            line.extend(fields);
        } else {
            line.insert("data".to_owned(), data);
        }

        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", Value::Object(line));
        }
    }
}

fn unix_ms_now() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}
