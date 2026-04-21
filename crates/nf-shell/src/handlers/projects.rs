use std::fs;

use serde_json::{json, Value};

use crate::errors::NfError;
use crate::handlers::{
    archive_dir, ensure_project, episode_path, episodes_dir, fs_modified_iso,
    load_registry_or_empty, now_iso, optional_bool, optional_str, project_dir, project_path,
    remove_registry_project, required_str, save_registry_project, string_list,
};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{validate_slug, Episode, JsonStorage, Project, Storage};

#[derive(Debug, Clone)]
pub struct ProjectsOpHandler {
    storage: JsonStorage,
}

impl ProjectsOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn list(&self) -> Result<Value, NfError> {
        let registry = load_registry_or_empty(&self.storage)?;
        let mut projects = Vec::new();
        for entry in registry.projects {
            let project = ensure_project(&self.storage, &entry.slug)?;
            projects.push(json!({
                "slug": project.slug,
                "name": project.name,
                "episodes_count": episode_count(&self.storage, &entry.slug)?,
                "last_modified": entry.last_modified,
                "description": project.description,
                "tags": project.tags
            }));
        }

        Ok(Value::Array(projects))
    }

    fn show(&self, params: &Value) -> Result<Value, NfError> {
        let slug = required_str(params, "project")?;
        let project = ensure_project(&self.storage, &slug)?;
        let episodes = episode_summaries(&self.storage, &slug)?;

        Ok(json!({
            "slug": project.slug,
            "name": project.name,
            "description": project.description,
            "episodes": episodes,
            "created": project.created,
            "modified": project.modified,
            "tags": project.tags
        }))
    }

    fn create(&self, params: &Value) -> Result<Value, NfError> {
        let slug = required_str(params, "slug")?;
        validate_slug(&slug)?;
        if project_dir(&self.storage, &slug).exists()
            || load_registry_or_empty(&self.storage)?
                .projects
                .iter()
                .any(|project| project.slug == slug)
        {
            return Err(NfError::SlugExists {
                slug,
                hint: "nf projects show --project=<slug>".to_string(),
            });
        }

        let name = required_str(params, "name")?;
        let description = optional_str(params, "description");
        let tags = {
            let values = string_list(params, "tags");
            if values.is_empty() {
                None
            } else {
                Some(values)
            }
        };
        let now = now_iso();
        let project = Project {
            slug: slug.clone(),
            name: name.clone(),
            description,
            tags,
            created: now.clone(),
            modified: now.clone(),
        };
        self.storage.save_project(&project)?;
        fs::create_dir_all(episodes_dir(&self.storage, &slug))?;
        save_registry_project(&self.storage, &slug, &name, &now, &now)?;

        Ok(json!({
            "slug": slug,
            "name": name,
            "path": project_path(&self.storage, &project.slug),
            "created": now
        }))
    }

    fn rename(&self, params: &Value) -> Result<Value, NfError> {
        let slug = required_str(params, "project")?;
        let name = required_str(params, "name")?;
        let mut project = ensure_project(&self.storage, &slug)?;
        project.name = name.clone();
        project.modified = now_iso();
        self.storage.save_project(&project)?;
        save_registry_project(
            &self.storage,
            &project.slug,
            &name,
            &project.created,
            &project.modified,
        )?;

        Ok(json!({
            "slug": project.slug,
            "name": project.name,
            "modified": project.modified
        }))
    }

    fn archive(&self, params: &Value) -> Result<Value, NfError> {
        let slug = required_str(params, "project")?;
        ensure_project(&self.storage, &slug)?;
        let src = project_dir(&self.storage, &slug);
        let dst = archive_dir(&self.storage).join(&slug);
        if dst.exists() {
            return Err(NfError::SlugExists {
                slug,
                hint: "remove the archived project first".to_string(),
            });
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&src, &dst)?;
        remove_registry_project(&self.storage, &slug)?;

        Ok(json!({
            "archived": true,
            "slug": slug,
            "path": dst
        }))
    }

    fn delete(&self, params: &Value) -> Result<Value, NfError> {
        let slug = required_str(params, "project")?;
        if !optional_bool(params, "confirm") {
            return Err(NfError::NeedsConfirm {
                hint: "rerun with --confirm".to_string(),
            });
        }
        ensure_project(&self.storage, &slug)?;
        fs::remove_dir_all(project_dir(&self.storage, &slug))?;
        remove_registry_project(&self.storage, &slug)?;

        Ok(json!({
            "deleted": true,
            "slug": slug
        }))
    }

    fn episodes(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        ensure_project(&self.storage, &project)?;
        Ok(Value::Array(episode_summaries(&self.storage, &project)?))
    }

    fn clips(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode = required_str(params, "episode")?;
        let episode = crate::handlers::ensure_episode(&self.storage, &project, &episode)?;
        Ok(Value::Array(episode.clips))
    }
}

impl OpHandler for ProjectsOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "projects-list" => self.list()?,
            "projects-show" => self.show(&req.params)?,
            "projects-create" => self.create(&req.params)?,
            "projects-rename" => self.rename(&req.params)?,
            "projects-archive" => self.archive(&req.params)?,
            "projects-delete" => self.delete(&req.params)?,
            "projects-episodes" => self.episodes(&req.params)?,
            "projects-clips" => self.clips(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

pub(crate) fn episode_summaries(
    storage: &JsonStorage,
    project_slug: &str,
) -> Result<Vec<Value>, NfError> {
    let dir = episodes_dir(storage, project_slug);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Some(slug) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        let episode: Episode = storage.load_episode(project_slug, slug)?;
        summaries.push(json!({
            "slug": episode.slug,
            "name": episode.name,
            "duration": episode.duration,
            "clips_count": episode.clips.len(),
            "anchors_count": episode.anchors.len(),
            "last_modified": fs_modified_iso(&episode_path(storage, project_slug, slug))
        }));
    }

    summaries.sort_by(|left, right| {
        left["slug"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["slug"].as_str().unwrap_or_default())
    });
    Ok(summaries)
}

fn episode_count(storage: &JsonStorage, project_slug: &str) -> Result<usize, NfError> {
    Ok(episode_summaries(storage, project_slug)?.len())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::ProjectsOpHandler;
    use crate::handlers::test_support::{cleanup, test_storage};
    use crate::ipc_server::{IpcRequest, OpHandler};

    #[test]
    fn creates_and_lists_project() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("projects-create")?;
        let handler = ProjectsOpHandler::new(storage.clone());

        let req = IpcRequest {
            req_id: "1".to_string(),
            op: "projects-create".to_string(),
            params: json!({"slug": "demo-video", "name": "Demo Video", "tags": ["demo"]}),
        };
        handler.handle(&req)?;

        let list_req = IpcRequest {
            req_id: "2".to_string(),
            op: "projects-list".to_string(),
            params: json!({}),
        };
        let list = handler.handle(&list_req)?.unwrap_or_else(|| json!([]));

        assert_eq!(list[0]["slug"], "demo-video");
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn rejects_duplicate_project_slug() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("projects-dupe")?;
        let handler = ProjectsOpHandler::new(storage.clone());
        let req = IpcRequest {
            req_id: "1".to_string(),
            op: "projects-create".to_string(),
            params: json!({"slug": "demo-video", "name": "Demo Video"}),
        };
        handler.handle(&req)?;
        let err = match handler.handle(&req) {
            Err(err) => err,
            Ok(_) => return Err(std::io::Error::other("duplicate slug must fail").into()),
        };

        assert_eq!(err.exit_code(), 6);
        cleanup(&storage)?;
        Ok(())
    }
}
