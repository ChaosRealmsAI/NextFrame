use serde_json::{json, Value};

use crate::errors::NfError;
use crate::handlers::{ensure_episode, now_iso, optional_str, optional_usize, required_str};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, Storage};

#[derive(Debug, Clone)]
pub struct LogOpHandler {
    storage: JsonStorage,
}

impl LogOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn tail(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let limit = optional_usize(params, "limit", 20)?;
        let actor = optional_str(params, "actor");
        if let Some(actor) = &actor {
            validate_actor(actor)?;
        }
        let since = optional_str(params, "since");
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let entries = episode
            .log
            .into_iter()
            .rev()
            .filter(|entry| match actor.as_deref() {
                Some(actor) => entry.get("actor").and_then(Value::as_str) == Some(actor),
                None => true,
            })
            .filter(|entry| match since.as_deref() {
                Some(since) => entry
                    .get("time")
                    .and_then(Value::as_str)
                    .is_some_and(|time| time >= since),
                None => true,
            })
            .take(limit)
            .collect();

        Ok(Value::Array(entries))
    }

    fn show(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let id = required_str(params, "id")?;
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        episode
            .log
            .into_iter()
            .find(|entry| entry.get("id").and_then(Value::as_str) == Some(id.as_str()))
            .ok_or_else(|| NfError::UnknownLog {
                id,
                hint: format!("nf log tail --project={project} --episode={episode_slug}"),
            })
    }

    fn create(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let actor = required_str(params, "actor")?;
        validate_actor(&actor)?;
        let status = optional_str(params, "status").unwrap_or_else(|| "done".to_string());
        validate_status(&status)?;
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let entry = json!({
            "id": next_log_id(&episode.log),
            "time": now_iso(),
            "actor": actor,
            "desc": required_str(params, "desc")?,
            "cli": required_str(params, "cli")?,
            "status": status
        });
        episode.log.push(entry.clone());
        self.storage.save_episode(&project, &episode)?;

        Ok(entry)
    }
}

impl OpHandler for LogOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "log-tail" => self.tail(&req.params)?,
            "log-show" => self.show(&req.params)?,
            "log-create" => self.create(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

fn next_log_id(log: &[Value]) -> String {
    let next = log
        .iter()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .filter_map(|id| id.strip_prefix("lg-"))
        .filter_map(|number| number.parse::<u64>().ok())
        .max()
        .unwrap_or(0)
        + 1;
    format!("lg-{next}")
}

fn validate_actor(actor: &str) -> Result<(), NfError> {
    if matches!(actor, "AI" | "human") {
        return Ok(());
    }

    Err(NfError::ValidationFailed(
        "actor must be AI or human".to_string(),
    ))
}

fn validate_status(status: &str) -> Result<(), NfError> {
    if matches!(status, "pending" | "done" | "failed") {
        return Ok(());
    }

    Err(NfError::ValidationFailed(
        "status must be pending, done, or failed".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::LogOpHandler;
    use crate::handlers::episodes::EpisodesOpHandler;
    use crate::handlers::projects::ProjectsOpHandler;
    use crate::handlers::test_support::{cleanup, test_storage};
    use crate::ipc_server::{IpcRequest, OpHandler};

    #[test]
    fn creates_and_tails_log_entry() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("log-create")?;
        create_episode(&storage)?;
        let handler = LogOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "log-create".to_string(),
            params: json!({
                "project": "demo-video",
                "episode": "ep-01",
                "actor": "AI",
                "desc": "test log",
                "cli": "nf clips list"
            }),
        })?;
        let entries = handler
            .handle(&IpcRequest {
                req_id: "4".to_string(),
                op: "log-tail".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01", "limit": 1}),
            })?
            .unwrap_or_else(|| json!([]));

        assert_eq!(entries[0]["id"], "lg-1");
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn missing_log_returns_exit_five() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("log-missing")?;
        create_episode(&storage)?;
        let err = match LogOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "log-show".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "id": "lg-999"}),
        }) {
            Err(err) => err,
            Ok(_) => return Err(std::io::Error::other("missing log must fail").into()),
        };

        assert_eq!(err.exit_code(), 5);
        cleanup(&storage)?;
        Ok(())
    }

    fn create_episode(
        storage: &crate::storage::JsonStorage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        ProjectsOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "1".to_string(),
            op: "projects-create".to_string(),
            params: json!({"slug": "demo-video", "name": "Demo Video"}),
        })?;
        EpisodesOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "2".to_string(),
            op: "episodes-create".to_string(),
            params: json!({"project": "demo-video", "slug": "ep-01", "name": "Episode 01"}),
        })?;
        Ok(())
    }
}
