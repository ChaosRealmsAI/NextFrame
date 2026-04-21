use std::fs;

use serde_json::{json, Value};

use crate::errors::NfError;
use crate::handlers::projects::episode_summaries;
use crate::handlers::{
    archive_dir, ensure_episode, ensure_project, episode_path, fs_modified_iso, now_iso,
    optional_bool, optional_f64, required_str,
};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{validate_slug, Episode, JsonStorage, Storage};

#[derive(Debug, Clone)]
pub struct EpisodesOpHandler {
    storage: JsonStorage,
}

impl EpisodesOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn list(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        ensure_project(&self.storage, &project)?;
        Ok(Value::Array(episode_summaries(&self.storage, &project)?))
    }

    fn show(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode = required_str(params, "episode")?;
        Ok(json!(ensure_episode(&self.storage, &project, &episode)?))
    }

    fn create(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        ensure_project(&self.storage, &project)?;
        let slug = required_str(params, "slug")?;
        validate_slug(&slug)?;
        if episode_path(&self.storage, &project, &slug).exists() {
            return Err(NfError::SlugExists {
                slug,
                hint: format!("nf episodes show --project={project} --episode=<slug>"),
            });
        }

        let episode = Episode {
            slug: slug.clone(),
            name: required_str(params, "name")?,
            duration: optional_f64(params, "duration")?.unwrap_or(60.0),
            anchors: Default::default(),
            clips: Vec::new(),
            log: Vec::new(),
        };
        self.storage.save_episode(&project, &episode)?;

        Ok(json!({
            "slug": episode.slug,
            "name": episode.name,
            "duration": episode.duration,
            "path": episode_path(&self.storage, &project, &slug),
            "created": now_iso()
        }))
    }

    fn rename(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let slug = required_str(params, "episode")?;
        let mut episode = ensure_episode(&self.storage, &project, &slug)?;
        episode.name = required_str(params, "name")?;
        self.storage.save_episode(&project, &episode)?;

        Ok(json!({
            "slug": episode.slug,
            "name": episode.name,
            "modified": fs_modified_iso(&episode_path(&self.storage, &project, &slug))
        }))
    }

    fn archive(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let slug = required_str(params, "episode")?;
        ensure_episode(&self.storage, &project, &slug)?;
        let src = episode_path(&self.storage, &project, &slug);
        let dst = archive_dir(&self.storage)
            .join(&project)
            .join("episodes")
            .join(format!("{slug}.json"));
        if dst.exists() {
            return Err(NfError::SlugExists {
                slug,
                hint: "remove the archived episode first".to_string(),
            });
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(src, &dst)?;

        Ok(json!({
            "archived": true,
            "project": project,
            "episode": slug,
            "path": dst
        }))
    }

    fn delete(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let slug = required_str(params, "episode")?;
        if !optional_bool(params, "confirm") {
            return Err(NfError::NeedsConfirm {
                hint: "rerun with --confirm".to_string(),
            });
        }
        ensure_episode(&self.storage, &project, &slug)?;
        fs::remove_file(episode_path(&self.storage, &project, &slug))?;

        Ok(json!({
            "deleted": true,
            "project": project,
            "episode": slug
        }))
    }
}

impl OpHandler for EpisodesOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "episodes-list" => self.list(&req.params)?,
            "episodes-show" => self.show(&req.params)?,
            "episodes-create" => self.create(&req.params)?,
            "episodes-rename" => self.rename(&req.params)?,
            "episodes-archive" => self.archive(&req.params)?,
            "episodes-delete" => self.delete(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::EpisodesOpHandler;
    use crate::handlers::projects::ProjectsOpHandler;
    use crate::handlers::test_support::{cleanup, test_storage};
    use crate::ipc_server::{IpcRequest, OpHandler};

    #[test]
    fn creates_and_shows_episode() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("episodes-create")?;
        create_project(&storage)?;
        let handler = EpisodesOpHandler::new(storage.clone());

        handler.handle(&IpcRequest {
            req_id: "2".to_string(),
            op: "episodes-create".to_string(),
            params: json!({"project": "demo-video", "slug": "ep-01", "name": "Episode 01", "duration": 90.0}),
        })?;
        let shown = handler
            .handle(&IpcRequest {
                req_id: "3".to_string(),
                op: "episodes-show".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01"}),
            })?
            .unwrap_or_else(|| json!({}));

        assert_eq!(shown["duration"], 90.0);
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn delete_requires_confirm() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("episodes-confirm")?;
        create_project(&storage)?;
        let handler = EpisodesOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "2".to_string(),
            op: "episodes-create".to_string(),
            params: json!({"project": "demo-video", "slug": "ep-01", "name": "Episode 01"}),
        })?;
        let err = match handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "episodes-delete".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01"}),
        }) {
            Err(err) => err,
            Ok(_) => return Err(std::io::Error::other("missing confirm must fail").into()),
        };

        assert_eq!(err.exit_code(), 7);
        cleanup(&storage)?;
        Ok(())
    }

    fn create_project(
        storage: &crate::storage::JsonStorage,
    ) -> Result<(), Box<dyn std::error::Error>> {
        ProjectsOpHandler::new(storage.clone()).handle(&IpcRequest {
            req_id: "1".to_string(),
            op: "projects-create".to_string(),
            params: json!({"slug": "demo-video", "name": "Demo Video"}),
        })?;
        Ok(())
    }
}
