use serde_json::{json, Value};

use crate::errors::NfError;
use crate::handlers::clips::anchor_references;
use crate::handlers::{ensure_episode, required_f64, required_str};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{validate_slug, JsonStorage, Storage};

#[derive(Debug, Clone)]
pub struct AnchorsOpHandler {
    storage: JsonStorage,
}

impl AnchorsOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn list(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        Ok(json!(episode.anchors))
    }

    fn set(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let name = required_str(params, "name")?;
        validate_slug(&name)?;
        let time = required_f64(params, "time")?;
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        episode.anchors.insert(name.clone(), time);
        self.storage.save_episode(&project, &episode)?;

        Ok(json!({
            "name": name,
            "time": time
        }))
    }

    fn unset(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let name = required_str(params, "name")?;
        validate_slug(&name)?;
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let references = anchor_references(&episode.clips, &name);
        if !references.is_empty() {
            return Err(NfError::Referenced {
                detail: format!("anchor `{name}` is referenced by clips: {references:?}"),
                hint: format!("nf clips update 先改 start/end · 影响 clip: {references:?}"),
            });
        }
        let removed = episode.anchors.remove(&name).is_some();
        self.storage.save_episode(&project, &episode)?;

        Ok(json!({
            "unset": removed,
            "name": name
        }))
    }
}

impl OpHandler for AnchorsOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "anchors-list" => self.list(&req.params)?,
            "anchors-set" => self.set(&req.params)?,
            "anchors-unset" => self.unset(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::AnchorsOpHandler;
    use crate::handlers::clips::ClipsOpHandler;
    use crate::handlers::episodes::EpisodesOpHandler;
    use crate::handlers::projects::ProjectsOpHandler;
    use crate::handlers::test_support::{cleanup, test_storage};
    use crate::ipc_server::{IpcRequest, OpHandler};

    #[test]
    fn sets_and_unsets_anchor() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("anchors-set")?;
        create_episode(&storage)?;
        let handler = AnchorsOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "anchors-set".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "name": "intro-end", "time": 5.0}),
        })?;
        handler.handle(&IpcRequest {
            req_id: "4".to_string(),
            op: "anchors-unset".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "name": "intro-end"}),
        })?;
        let anchors = handler
            .handle(&IpcRequest {
                req_id: "5".to_string(),
                op: "anchors-list".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01"}),
            })?
            .unwrap_or_else(|| json!({}));

        assert!(anchors.get("intro-end").is_none());
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn rejects_unset_when_clip_references_anchor() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("anchors-reference")?;
        create_episode(&storage)?;
        AnchorsOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "anchors-set".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "name": "intro-end", "time": 5.0}),
        })?;
        ClipsOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "4".to_string(),
            op: "clips-create".to_string(),
            params: json!({
                "project": "demo-video",
                "episode": "ep-01",
                "slug": "intro",
                "label": "Intro",
                "track": "scene",
                "start": "0",
                "end": "intro-end"
            }),
        })?;
        let err = match AnchorsOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "5".to_string(),
            op: "anchors-unset".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "name": "intro-end"}),
        }) {
            Err(err) => err,
            Ok(_) => return Err(std::io::Error::other("referenced anchor must fail").into()),
        };

        assert_eq!(err.exit_code(), 8);
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
