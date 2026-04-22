use std::fs;

use serde_json::{Value, json};

use crate::errors::NfError;
use crate::handlers::{
    ensure_episode, episodes_dir, now_iso, optional_str, optional_usize, project_dir, required_str,
};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, Storage, atomic_write};

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

pub(crate) fn append_auto(storage: &JsonStorage, req: &IpcRequest) -> Result<(), NfError> {
    if is_read_op(&req.op) {
        return Ok(());
    }
    let Some(scope) = AutoScope::from_request(req) else {
        return Ok(());
    };
    let entry = auto_entry(req, &scope);

    if let Some(episode) = scope.episode.as_deref() {
        if req.op == "episodes-create" || req.op == "episodes.create" {
            for pending in take_pending_project_entries(storage, &scope.project)? {
                append_to_episode(storage, &scope.project, episode, pending)?;
            }
        }
        return append_to_episode(storage, &scope.project, episode, entry);
    }

    append_project_scoped(storage, &scope.project, entry)
}

fn append_project_scoped(
    storage: &JsonStorage,
    project: &str,
    entry: Value,
) -> Result<(), NfError> {
    let dir = episodes_dir(storage, project);
    if !dir.exists() {
        if project_dir(storage, project).exists() {
            push_pending_project_entry(storage, project, entry)?;
        }
        return Ok(());
    }

    let mut wrote_episode = false;
    for episode in fs::read_dir(dir)? {
        let path = episode?.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Some(slug) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        append_to_episode(storage, project, slug, entry.clone())?;
        wrote_episode = true;
    }

    if !wrote_episode && project_dir(storage, project).exists() {
        push_pending_project_entry(storage, project, entry)?;
    }
    Ok(())
}

fn append_to_episode(
    storage: &JsonStorage,
    project: &str,
    episode_slug: &str,
    mut entry: Value,
) -> Result<(), NfError> {
    let mut episode = ensure_episode(storage, project, episode_slug)?;
    if let Some(object) = entry.as_object_mut() {
        object.insert("id".to_string(), Value::String(next_log_id(&episode.log)));
        object.insert(
            "episode".to_string(),
            Value::String(episode_slug.to_string()),
        );
    }
    episode.log.push(entry);
    storage.save_episode(project, &episode)
}

fn push_pending_project_entry(
    storage: &JsonStorage,
    project: &str,
    entry: Value,
) -> Result<(), NfError> {
    let mut entries = read_pending_project_entries(storage, project)?;
    entries.push(entry);
    atomic_write(&pending_project_log_path(storage, project), &entries)
}

fn take_pending_project_entries(
    storage: &JsonStorage,
    project: &str,
) -> Result<Vec<Value>, NfError> {
    let path = pending_project_log_path(storage, project);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let entries = read_pending_project_entries(storage, project)?;
    fs::remove_file(path)?;
    Ok(entries)
}

fn read_pending_project_entries(
    storage: &JsonStorage,
    project: &str,
) -> Result<Vec<Value>, NfError> {
    let path = pending_project_log_path(storage, project);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path)?;
    serde_json::from_str(&raw).map_err(NfError::from)
}

fn pending_project_log_path(storage: &JsonStorage, project: &str) -> std::path::PathBuf {
    project_dir(storage, project).join(".pending-log.json")
}

fn auto_entry(req: &IpcRequest, scope: &AutoScope) -> Value {
    let op = dotted_op(&req.op);
    let time = now_iso();
    json!({
        "time": time,
        "at": time,
        "actor": "AI",
        "op": op,
        "project": scope.project,
        "episode": scope.episode,
        "slug": scope.slug,
        "desc": format!("{op} succeeded"),
        "cli": cli_for_op(&req.op),
        "status": "ok"
    })
}

#[derive(Debug)]
struct AutoScope {
    project: String,
    episode: Option<String>,
    slug: Option<String>,
}

impl AutoScope {
    fn from_request(req: &IpcRequest) -> Option<Self> {
        let (prefix, action) = op_parts(&req.op)?;
        let params = &req.params;
        let project = match prefix {
            "projects" => str_param(params, "project").or_else(|| str_param(params, "slug"))?,
            "episodes" | "clips" | "anchors" => str_param(params, "project")?,
            _ => return None,
        };
        let episode = match prefix {
            "episodes" if action == "create" => str_param(params, "slug"),
            "episodes" | "clips" | "anchors" => str_param(params, "episode"),
            _ => None,
        };
        let slug = match (prefix, action) {
            ("projects", "create") => str_param(params, "slug"),
            ("projects", _) => str_param(params, "project"),
            ("episodes", "create") => str_param(params, "slug"),
            ("episodes", _) => str_param(params, "episode"),
            ("clips", "create") => str_param(params, "slug"),
            ("clips", _) => str_param(params, "clip"),
            ("anchors", _) => str_param(params, "name"),
            _ => None,
        };

        Some(Self {
            project: project.to_string(),
            episode: episode.map(ToString::to_string),
            slug: slug.map(ToString::to_string),
        })
    }
}

fn is_read_op(op: &str) -> bool {
    let Some((prefix, action)) = op_parts(op) else {
        return false;
    };
    prefix == "log" || matches!(action, "list" | "show" | "tail" | "episodes" | "clips")
}

fn op_parts(op: &str) -> Option<(&str, &str)> {
    op.split_once('-').or_else(|| op.split_once('.'))
}

fn dotted_op(op: &str) -> String {
    op_parts(op)
        .map(|(prefix, action)| format!("{prefix}.{action}"))
        .unwrap_or_else(|| op.to_string())
}

fn cli_for_op(op: &str) -> String {
    op_parts(op)
        .map(|(prefix, action)| format!("nf {prefix} {action}"))
        .unwrap_or_else(|| format!("nf {op}"))
}

fn str_param<'a>(params: &'a Value, name: &str) -> Option<&'a str> {
    params
        .get(name)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
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
    use crate::handlers::ComposeOpHandler;
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

    #[test]
    fn auto_log_on_project_create() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("auto-log-project-create")?;
        let handler = ComposeOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "1".to_string(),
            op: "projects-create".to_string(),
            params: json!({"slug": "demo-video", "name": "Demo Video"}),
        })?;
        handler.handle(&IpcRequest {
            req_id: "2".to_string(),
            op: "episodes-create".to_string(),
            params: json!({"project": "demo-video", "slug": "ep-01", "name": "Episode 01"}),
        })?;

        let entries = LogOpHandler::new(storage.clone())
            .handle(&IpcRequest {
                req_id: "3".to_string(),
                op: "log-tail".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01", "limit": 10}),
            })?
            .unwrap_or_else(|| json!([]));
        let project_entry = entries
            .as_array()
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|entry| entry["op"] == "projects.create")
            })
            .ok_or_else(|| std::io::Error::other("missing project create auto log"))?;

        assert_eq!(project_entry["actor"], "AI");
        assert_eq!(project_entry["slug"], "demo-video");
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn no_auto_log_on_read() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("auto-log-read")?;
        create_episode(&storage)?;
        ComposeOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "projects-list".to_string(),
            params: json!({}),
        })?;

        let entries = LogOpHandler::new(storage.clone())
            .handle(&IpcRequest {
                req_id: "4".to_string(),
                op: "log-tail".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01", "limit": 10}),
            })?
            .unwrap_or_else(|| json!([]));

        assert_eq!(entries, json!([]));
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
