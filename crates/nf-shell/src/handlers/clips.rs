use serde_json::{Map, Value, json};

use crate::errors::NfError;
use crate::handlers::{ensure_episode, optional_bool, optional_str, required_str, string_list};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, Storage, validate_slug};

const TRACKS: &[&str] = &["scene", "text", "subtitle", "overlay", "audio", "trans"];

#[derive(Debug, Clone)]
pub struct ClipsOpHandler {
    storage: JsonStorage,
}

impl ClipsOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self { storage }
    }

    fn list(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let track = optional_str(params, "track");
        if let Some(track) = &track {
            validate_track(track)?;
        }

        let clips = episode
            .clips
            .into_iter()
            .filter(|clip| match track.as_deref() {
                Some(track) => clip.get("track").and_then(Value::as_str) == Some(track),
                None => true,
            })
            .map(with_duration)
            .collect();
        Ok(Value::Array(clips))
    }

    fn show(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let clip_slug = required_str(params, "clip")?;
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        episode
            .clips
            .into_iter()
            .find(|clip| clip_slug_of(clip) == Some(clip_slug.as_str()))
            .map(with_duration)
            .ok_or_else(|| unknown_clip(&project, &episode_slug, &clip_slug))
    }

    fn create(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let slug = required_str(params, "slug")?;
        validate_slug(&slug)?;
        if episode
            .clips
            .iter()
            .any(|clip| clip_slug_of(clip) == Some(slug.as_str()))
        {
            return Err(NfError::SlugExists {
                slug,
                hint: format!(
                    "nf clips show --project={project} --episode={episode_slug} --clip=<slug>"
                ),
            });
        }

        let track = required_str(params, "track")?;
        validate_track(&track)?;
        let clip = json!({
            "slug": slug,
            "label": required_str(params, "label")?,
            "track": track,
            "start": required_str(params, "start")?,
            "end": required_str(params, "end")?,
            "effects": string_list(params, "effects"),
            "keyframes": []
        });
        episode.clips.push(clip.clone());
        self.storage.save_episode(&project, &episode)?;

        Ok(with_duration(clip))
    }

    fn update(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let slug = required_str(params, "clip")?;
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let index = clip_index(&episode.clips, &slug)
            .ok_or_else(|| unknown_clip(&project, &episode_slug, &slug))?;

        let Some(object) = episode.clips[index].as_object_mut() else {
            return Err(unknown_clip(&project, &episode_slug, &slug));
        };
        if let Some(start) = optional_str(params, "start") {
            object.insert("start".to_string(), Value::String(start));
        }
        if let Some(end) = optional_str(params, "end") {
            object.insert("end".to_string(), Value::String(end));
        }
        if let Some(label) = optional_str(params, "label") {
            object.insert("label".to_string(), Value::String(label));
        }
        if let Some(position) = optional_position(params)? {
            object.insert("position".to_string(), json!(position));
        }
        if params.get("effects").is_some_and(|value| !value.is_null()) {
            object.insert("effects".to_string(), json!(string_list(params, "effects")));
        }

        let updated = episode.clips[index].clone();
        self.storage.save_episode(&project, &episode)?;
        Ok(with_duration(updated))
    }

    fn delete(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let slug = required_str(params, "clip")?;
        if !optional_bool(params, "confirm") {
            return Err(NfError::NeedsConfirm {
                hint: "rerun with --confirm".to_string(),
            });
        }
        let mut episode = ensure_episode(&self.storage, &project, &episode_slug)?;
        let before = episode.clips.len();
        episode
            .clips
            .retain(|clip| clip_slug_of(clip) != Some(slug.as_str()));
        if episode.clips.len() == before {
            return Err(unknown_clip(&project, &episode_slug, &slug));
        }
        self.storage.save_episode(&project, &episode)?;

        Ok(json!({
            "deleted": true,
            "project": project,
            "episode": episode_slug,
            "clip": slug
        }))
    }
}

fn optional_position(params: &Value) -> Result<Option<Map<String, Value>>, NfError> {
    let Some(position) = params.get("position") else {
        return Ok(None);
    };
    if position.is_null() {
        return Ok(None);
    }
    let Some(object) = position.as_object() else {
        return Err(NfError::ValidationFailed(
            "`position` must be an object with x and y numbers".to_string(),
        ));
    };
    let x = object
        .get("x")
        .and_then(Value::as_f64)
        .ok_or_else(|| NfError::ValidationFailed("`position.x` must be a number".to_string()))?;
    let y = object
        .get("y")
        .and_then(Value::as_f64)
        .ok_or_else(|| NfError::ValidationFailed("`position.y` must be a number".to_string()))?;
    if !(0.0..=100.0).contains(&x) || !(0.0..=100.0).contains(&y) {
        return Err(NfError::ValidationFailed(
            "`position.x` and `position.y` must be between 0 and 100".to_string(),
        ));
    }

    let mut normalized = Map::new();
    normalized.insert("x".to_string(), json!(round_position(x)));
    normalized.insert("y".to_string(), json!(round_position(y)));
    Ok(Some(normalized))
}

fn round_position(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

impl OpHandler for ClipsOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "clips-list" => self.list(&req.params)?,
            "clips-show" => self.show(&req.params)?,
            "clips-create" => self.create(&req.params)?,
            "clips-update" => self.update(&req.params)?,
            "clips-delete" => self.delete(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

pub(crate) fn clip_slug_of(clip: &Value) -> Option<&str> {
    clip.get("slug")
        .or_else(|| clip.get("clip"))
        .and_then(Value::as_str)
}

pub(crate) fn clip_index(clips: &[Value], slug: &str) -> Option<usize> {
    clips
        .iter()
        .position(|clip| clip_slug_of(clip) == Some(slug))
}

pub(crate) fn anchor_references(clips: &[Value], anchor: &str) -> Vec<String> {
    clips
        .iter()
        .filter(|clip| {
            ["start", "end"].iter().any(|field| {
                clip.get(field)
                    .and_then(Value::as_str)
                    .is_some_and(|expr| expr.contains(anchor))
            })
        })
        .filter_map(clip_slug_of)
        .map(ToString::to_string)
        .collect()
}

fn validate_track(track: &str) -> Result<(), NfError> {
    if TRACKS.contains(&track) {
        return Ok(());
    }

    Err(NfError::ValidationFailed(format!(
        "track must be one of {}",
        TRACKS.join(", ")
    )))
}

fn unknown_clip(project: &str, episode: &str, slug: &str) -> NfError {
    NfError::UnknownClip {
        slug: slug.to_string(),
        hint: format!("nf clips list --project={project} --episode={episode}"),
    }
}

fn with_duration(mut clip: Value) -> Value {
    let duration = match (
        clip.get("start").and_then(Value::as_str),
        clip.get("end").and_then(Value::as_str),
    ) {
        (Some(start), Some(end)) => match (start.parse::<f64>(), end.parse::<f64>()) {
            (Ok(start), Ok(end)) => json!(end - start),
            _ => Value::Null,
        },
        _ => Value::Null,
    };

    match clip.as_object_mut() {
        Some(object) => {
            insert_default(object, "effects", json!([]));
            insert_default(object, "keyframes", json!([]));
            object.insert("duration".to_string(), duration);
            clip
        }
        None => clip,
    }
}

fn insert_default(object: &mut Map<String, Value>, key: &str, value: Value) {
    if !object.contains_key(key) {
        object.insert(key.to_string(), value);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::ClipsOpHandler;
    use crate::handlers::episodes::EpisodesOpHandler;
    use crate::handlers::projects::ProjectsOpHandler;
    use crate::handlers::test_support::{cleanup, test_storage};
    use crate::ipc_server::{IpcRequest, OpHandler};

    #[test]
    fn stores_anchor_expression_as_string() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("clips-create")?;
        create_episode(&storage)?;
        let handler = ClipsOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "clips-create".to_string(),
            params: json!({
                "project": "demo-video",
                "episode": "ep-01",
                "slug": "feat-1",
                "label": "Feature 1",
                "track": "scene",
                "start": "intro-end + 0.5",
                "end": "feat-1-end",
                "effects": ["fade"]
            }),
        })?;

        let shown = handler
            .handle(&IpcRequest {
                req_id: "4".to_string(),
                op: "clips-show".to_string(),
                params: json!({"project": "demo-video", "episode": "ep-01", "clip": "feat-1"}),
            })?
            .unwrap_or_else(|| json!({}));

        assert_eq!(shown["start"], "intro-end + 0.5");
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn missing_clip_returns_exit_five() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("clips-missing")?;
        create_episode(&storage)?;
        let handler = ClipsOpHandler::new(storage.clone());
        let err = match handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "clips-show".to_string(),
            params: json!({"project": "demo-video", "episode": "ep-01", "clip": "missing"}),
        }) {
            Err(err) => err,
            Ok(_) => return Err(std::io::Error::other("missing clip must fail").into()),
        };

        assert_eq!(err.exit_code(), 5);
        cleanup(&storage)?;
        Ok(())
    }

    #[test]
    fn updates_clip_position() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("clips-position")?;
        create_episode(&storage)?;
        let handler = ClipsOpHandler::new(storage.clone());
        handler.handle(&IpcRequest {
            req_id: "3".to_string(),
            op: "clips-create".to_string(),
            params: json!({
                "project": "demo-video",
                "episode": "ep-01",
                "slug": "intro",
                "label": "Intro",
                "track": "scene",
                "start": "0",
                "end": "5"
            }),
        })?;

        let shown = handler
            .handle(&IpcRequest {
                req_id: "4".to_string(),
                op: "clips-update".to_string(),
                params: json!({
                    "project": "demo-video",
                    "episode": "ep-01",
                    "clip": "intro",
                    "position": {"x": 42.345, "y": 58.0}
                }),
            })?
            .unwrap_or_else(|| json!({}));

        assert_eq!(shown["position"]["x"], 42.35);
        assert_eq!(shown["position"]["y"], 58.0);
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
