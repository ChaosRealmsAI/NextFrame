use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use directories::BaseDirs;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;

static SLUG_RE: Lazy<Result<Regex, regex::Error>> =
    Lazy::new(|| Regex::new(r"^[a-z][a-z0-9.-]{0,63}$"));

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("storage failed: {0}")]
    StorageFailed(String),
    #[error("invalid slug '{slug}' · hint: {hint}")]
    SlugInvalid { slug: String, hint: String },
    #[error("{0}")]
    ValidationFailed(String),
}

impl From<std::io::Error> for ProjectError {
    fn from(value: std::io::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}

impl From<serde_json::Error> for ProjectError {
    fn from(value: serde_json::Error) -> Self {
        Self::StorageFailed(value.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Registry {
    pub projects: Vec<RegistryProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegistryProject {
    pub slug: String,
    pub name: String,
    pub created: String,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub slug: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    pub created: String,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Episode {
    pub slug: String,
    pub name: String,
    pub duration: f64,
    #[serde(default)]
    pub anchors: BTreeMap<String, f64>,
    #[serde(default)]
    pub clips: Vec<Value>,
    #[serde(default)]
    pub log: Vec<Value>,
}

pub trait Storage {
    fn load_registry(&self) -> Result<Registry, ProjectError>;
    fn save_registry(&self, registry: &Registry) -> Result<(), ProjectError>;
    fn load_project(&self, slug: &str) -> Result<Project, ProjectError>;
    fn save_project(&self, project: &Project) -> Result<(), ProjectError>;
    fn load_episode(&self, project_slug: &str, episode_slug: &str)
    -> Result<Episode, ProjectError>;
    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), ProjectError>;
}

#[derive(Debug, Clone)]
pub struct JsonStorage {
    root: PathBuf,
}

impl JsonStorage {
    pub fn default_root() -> Result<PathBuf, ProjectError> {
        if let Some(root) = std::env::var_os("NEXTFRAME_HOME") {
            return Ok(PathBuf::from(root));
        }

        BaseDirs::new()
            .map(|dirs| dirs.home_dir().join(".nextframe"))
            .ok_or_else(|| ProjectError::StorageFailed("home directory is unavailable".to_string()))
    }

    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn registry_path(&self) -> PathBuf {
        self.root.join("registry.json")
    }

    fn project_path(&self, slug: &str) -> Result<PathBuf, ProjectError> {
        validate_slug(slug)?;
        Ok(self.root.join(slug).join("project.json"))
    }

    fn episode_path(
        &self,
        project_slug: &str,
        episode_slug: &str,
    ) -> Result<PathBuf, ProjectError> {
        validate_slug(project_slug)?;
        validate_slug(episode_slug)?;
        Ok(self
            .root
            .join(project_slug)
            .join("episodes")
            .join(format!("{episode_slug}.json")))
    }

    fn composition_path(
        &self,
        project_slug: &str,
        composition_slug: &str,
    ) -> Result<PathBuf, ProjectError> {
        validate_slug(project_slug)?;
        validate_slug(composition_slug)?;
        Ok(self
            .root
            .join(project_slug)
            .join("compositions")
            .join(format!("{composition_slug}.json")))
    }

    pub fn load_composition(
        &self,
        project_slug: &str,
        composition_slug: &str,
    ) -> Result<Value, ProjectError> {
        read_json(&self.composition_path(project_slug, composition_slug)?)
    }

    pub fn save_composition(
        &self,
        project_slug: &str,
        composition_slug: &str,
        composition: &Value,
    ) -> Result<(), ProjectError> {
        atomic_write(
            &self.composition_path(project_slug, composition_slug)?,
            composition,
        )
    }

    pub fn composition_exists(
        &self,
        project_slug: &str,
        composition_slug: &str,
    ) -> Result<bool, ProjectError> {
        Ok(self
            .composition_path(project_slug, composition_slug)?
            .exists())
    }
}

impl Storage for JsonStorage {
    fn load_registry(&self) -> Result<Registry, ProjectError> {
        read_json(&self.registry_path())
    }

    fn save_registry(&self, registry: &Registry) -> Result<(), ProjectError> {
        atomic_write(&self.registry_path(), registry)
    }

    fn load_project(&self, slug: &str) -> Result<Project, ProjectError> {
        read_json(&self.project_path(slug)?)
    }

    fn save_project(&self, project: &Project) -> Result<(), ProjectError> {
        validate_slug(&project.slug)?;
        atomic_write(&self.project_path(&project.slug)?, project)
    }

    fn load_episode(
        &self,
        project_slug: &str,
        episode_slug: &str,
    ) -> Result<Episode, ProjectError> {
        read_json(&self.episode_path(project_slug, episode_slug)?)
    }

    fn save_episode(&self, project_slug: &str, episode: &Episode) -> Result<(), ProjectError> {
        validate_slug(&episode.slug)?;
        atomic_write(&self.episode_path(project_slug, &episode.slug)?, episode)
    }
}

pub fn validate_slug(slug: &str) -> Result<(), ProjectError> {
    match &*SLUG_RE {
        Ok(regex) if regex.is_match(slug) => return Ok(()),
        Ok(_) => {}
        Err(err) => {
            return Err(ProjectError::ValidationFailed(format!(
                "built-in slug regex failed to compile: {err}"
            )));
        }
    }

    Err(ProjectError::SlugInvalid {
        slug: slug.to_string(),
        hint:
            "use lowercase letters, numbers, dots, and hyphens; start with a letter; max 64 chars"
                .to_string(),
    })
}

pub fn atomic_write<T: Serialize>(path: &Path, value: &T) -> Result<(), ProjectError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| ProjectError::StorageFailed(err.to_string()))?;
    }

    let tmp_path = path.with_extension("tmp");
    let result = (|| -> Result<(), ProjectError> {
        let json = serde_json::to_string_pretty(value)?;
        let mut tmp = fs::File::create(&tmp_path)?;
        tmp.write_all(json.as_bytes())?;
        tmp.write_all(b"\n")?;
        tmp.sync_all()?;
        fs::rename(&tmp_path, path)?;
        Ok(())
    })();

    if result.is_err() {
        let _cleanup_result = fs::remove_file(&tmp_path);
    }

    result
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, ProjectError> {
    let raw =
        fs::read_to_string(path).map_err(|err| ProjectError::StorageFailed(err.to_string()))?;
    serde_json::from_str(&raw).map_err(|err| ProjectError::StorageFailed(err.to_string()))
}

#[derive(Debug, Clone)]
pub struct SourceCompileResult {
    pub source: Value,
    pub warnings: Vec<String>,
}

pub fn compile_composition_source(
    storage: &JsonStorage,
    project_slug: &str,
    composition: &Value,
) -> Result<SourceCompileResult, ProjectError> {
    let object = composition.as_object().ok_or_else(|| {
        ProjectError::ValidationFailed("composition must be a JSON object".to_string())
    })?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ProjectError::ValidationFailed("composition.id is required".to_string()))?;
    validate_slug(id)?;
    let name = object
        .get("name")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(id);
    let duration_ms = time_value_ms(object.get("duration"), &BTreeMap::new(), "duration")?;
    if duration_ms == 0 {
        return Err(ProjectError::ValidationFailed(
            "composition.duration must be greater than zero".to_string(),
        ));
    }
    let anchors = resolve_composition_anchors(object.get("anchors"), duration_ms)?;
    let viewport = composition_viewport(object.get("viewport"));
    let theme_id = object
        .get("theme")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("default");
    let theme_css = load_theme_css(storage.root(), project_slug, theme_id)?;
    let tracks = object
        .get("tracks")
        .and_then(Value::as_array)
        .ok_or_else(|| ProjectError::ValidationFailed("composition.tracks must be an array".to_string()))?;

    let mut warnings = Vec::new();
    let mut source_tracks = Vec::new();
    let mut components = serde_json::Map::new();
    let mut has_visual = false;

    for (index, track_value) in tracks.iter().enumerate() {
        let Some(track) = track_value.as_object() else {
            warnings.push(format!("ignored non-object track at index {index}"));
            continue;
        };
        let track_id = track
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("track-{}", index + 1));
        let kind = track
            .get("kind")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or("component");
        let (begin, end) = track_time_ms(track, &anchors, duration_ms, &track_id)?;
        if end <= begin {
            return Err(ProjectError::ValidationFailed(format!(
                "track '{track_id}' end must be greater than start"
            )));
        }

        let clip_id = track
            .get("clip_id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(&track_id);
        let mut params = serde_json::Map::new();
        match kind {
            "component" => {
                let component_id = track
                    .get("component")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        ProjectError::ValidationFailed(format!(
                            "component track '{track_id}' missing component"
                        ))
                    })?;
                if !components.contains_key(component_id) {
                    let src = load_component_js(storage.root(), project_slug, component_id)?;
                    components.insert(component_id.to_string(), Value::String(src));
                }
                params.insert("component".to_string(), json!(component_id));
                params.insert(
                    "params".to_string(),
                    track.get("params").cloned().unwrap_or_else(|| json!({})),
                );
                params.insert(
                    "style".to_string(),
                    track.get("style").cloned().unwrap_or_else(|| json!({})),
                );
                params.insert("track".to_string(), json!({
                    "id": track_id,
                    "z": track.get("z").and_then(Value::as_i64).unwrap_or(index as i64),
                    "kind": kind
                }));
                has_visual = true;
            }
            "audio" => {
                let Some(src) = track.get("src").and_then(Value::as_str) else {
                    warnings.push(format!("ignored audio track '{track_id}' without src"));
                    continue;
                };
                params.insert("src".to_string(), json!(src));
                copy_number_param(track, &mut params, "from_ms");
                copy_number_param(track, &mut params, "to_ms");
                copy_number_param(track, &mut params, "volume");
                if let Some(tts) = track.get("tts").filter(|value| value.is_object()) {
                    params.insert("tts".to_string(), tts.clone());
                }
            }
            "subtitle" => {
                let Some(words) = subtitle_words(
                    track
                        .get("words")
                        .or_else(|| track.get("params").and_then(|p| p.get("words")))
                        .unwrap_or(&Value::Null),
                ) else {
                    warnings.push(format!("ignored subtitle track '{track_id}' without words"));
                    continue;
                };
                params.insert("source".to_string(), json!({ "words": words }));
                params.insert(
                    "style".to_string(),
                    track.get("style").cloned().unwrap_or_else(|| json!({})),
                );
                has_visual = true;
            }
            other => {
                params = track
                    .get("params")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                if other != "audio" {
                    has_visual = true;
                }
            }
        }

        source_tracks.push(json!({
            "id": track_id,
            "kind": kind,
            "z": track.get("z").cloned().unwrap_or_else(|| json!(index)),
            "clips": [{
                "id": clip_id,
                "begin": begin,
                "end": end,
                "params": Value::Object(params)
            }]
        }));
    }

    if !has_visual {
        return Err(ProjectError::ValidationFailed(
            "composition has no visual tracks".to_string(),
        ));
    }

    let source = json!({
        "meta": {
            "name": name,
            "project": project_slug,
            "composition": id,
            "version": "v2",
            "export": object.get("export").cloned().unwrap_or_else(|| json!({ "resolution": "1080p" }))
        },
        "viewport": viewport,
        "duration": duration_ms,
        "anchors": {},
        "theme": {
            "id": theme_id,
            "css": theme_css
        },
        "components": Value::Object(components),
        "tracks": source_tracks
    });

    Ok(SourceCompileResult { source, warnings })
}

pub fn compile_episode_source(
    project_slug: &str,
    episode: &Episode,
) -> Result<SourceCompileResult, ProjectError> {
    let mut warnings = Vec::new();
    let duration_ms = seconds_to_ms(episode.duration, "episode.duration")?;
    let mut scene_clips = Vec::new();
    let mut text_clips = Vec::new();
    let mut subtitle_clips = Vec::new();
    let mut overlay_clips = Vec::new();
    let mut audio_clips = Vec::new();
    let mut ignored_tracks = BTreeMap::<String, usize>::new();

    for clip in &episode.clips {
        let Some(object) = clip.as_object() else {
            warnings.push("ignored non-object clip".to_string());
            continue;
        };
        let track = object
            .get("track")
            .and_then(Value::as_str)
            .or_else(|| object.get("kind").and_then(Value::as_str))
            .unwrap_or("scene");
        let normalized_track = match track {
            "scene" => "scene",
            "text" => "text",
            "subtitle" => "subtitle",
            "overlay" => "overlay",
            "audio" => "audio",
            other => {
                *ignored_tracks.entry(other.to_string()).or_insert(0) += 1;
                continue;
            }
        };

        let id = object
            .get("slug")
            .or_else(|| object.get("id"))
            .or_else(|| object.get("clip"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| ProjectError::ValidationFailed("scene clip missing slug".to_string()))?;
        let title = object
            .get("label")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .or_else(|| object.get("title").and_then(Value::as_str))
            .unwrap_or(id);
        let subtitle = object
            .get("subtitle")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(id);
        let layout = object
            .get("layout")
            .and_then(Value::as_str)
            .filter(|value| matches!(*value, "hero" | "stat" | "split" | "quote"))
            .unwrap_or("hero");
        let accent = object
            .get("accent_color")
            .and_then(Value::as_str)
            .filter(|value| is_hex_color(value))
            .unwrap_or("#5eead4");
        let bg_color = object
            .get("bg_color")
            .and_then(Value::as_str)
            .filter(|value| is_hex_color(value))
            .unwrap_or("#07080d");
        let position = clip_position(object);
        let start_ms = resolve_time_ms(object.get("start"), &episode.anchors, "start")?;
        let end_ms = resolve_time_ms(object.get("end"), &episode.anchors, "end")?;
        if end_ms <= start_ms {
            return Err(ProjectError::ValidationFailed(format!(
                "clip '{id}' end must be greater than start"
            )));
        }
        if end_ms > duration_ms {
            warnings.push(format!(
                "clip '{id}' ends after episode duration and will still be exported"
            ));
        }

        let params = match normalized_track {
            "scene" => scene_params(object, title, subtitle, layout, accent, bg_color, position),
            "text" => text_params(object, title, accent, position),
            "subtitle" => match subtitle_params(object, accent) {
                Some(params) => params,
                None => {
                    warnings.push(format!("ignored subtitle clip '{id}' without valid words"));
                    continue;
                }
            },
            "overlay" => overlay_params(object, title, accent, position),
            "audio" => match audio_params(object) {
                Some(params) => params,
                None => {
                    warnings.push(format!(
                        "ignored audio clip '{id}' without file:// or data: src"
                    ));
                    continue;
                }
            },
            _ => {
                *ignored_tracks
                    .entry(normalized_track.to_string())
                    .or_insert(0) += 1;
                continue;
            }
        };

        let compiled_clip = json!({
            "id": id,
            "begin": start_ms,
            "end": end_ms,
            "params": Value::Object(params)
        });
        if normalized_track == "scene" {
            scene_clips.push(compiled_clip);
        } else if normalized_track == "text" {
            text_clips.push(compiled_clip);
        } else if normalized_track == "subtitle" {
            subtitle_clips.push(compiled_clip);
        } else if normalized_track == "audio" {
            audio_clips.push(compiled_clip);
        } else {
            overlay_clips.push(compiled_clip);
        }
    }

    for (track, count) in ignored_tracks {
        warnings.push(format!(
            "ignored {count} clip(s) on unsupported export track '{track}'"
        ));
    }

    if scene_clips.is_empty()
        && text_clips.is_empty()
        && subtitle_clips.is_empty()
        && overlay_clips.is_empty()
    {
        return Err(ProjectError::ValidationFailed(
            "episode has no visual clips to export".to_string(),
        ));
    }

    let mut tracks = Vec::new();
    if !scene_clips.is_empty() {
        tracks.push(json!({
            "id": "scene-main",
            "kind": "scene",
            "clips": scene_clips
        }));
    }
    if !text_clips.is_empty() {
        tracks.push(json!({
            "id": "text-main",
            "kind": "text",
            "clips": text_clips
        }));
    }
    if !subtitle_clips.is_empty() {
        tracks.push(json!({
            "id": "subtitle-main",
            "kind": "subtitle",
            "clips": subtitle_clips
        }));
    }
    if !overlay_clips.is_empty() {
        tracks.push(json!({
            "id": "overlay-main",
            "kind": "overlay",
            "clips": overlay_clips
        }));
    }
    if !audio_clips.is_empty() {
        tracks.push(json!({
            "id": "audio-main",
            "kind": "audio",
            "clips": audio_clips
        }));
    }

    let source = json!({
        "meta": {
            "name": episode.name,
            "project": project_slug,
            "episode": episode.slug,
            "version": "v0.5",
            "export": {
                "resolution": "1080p"
            }
        },
        "viewport": {
            "ratio": "16:9",
            "w": 1920,
            "h": 1080
        },
        "duration": duration_ms,
        "anchors": {},
        "tracks": tracks
    });

    Ok(SourceCompileResult { source, warnings })
}

fn scene_params(
    object: &serde_json::Map<String, Value>,
    title: &str,
    subtitle: &str,
    layout: &str,
    accent: &str,
    bg_color: &str,
    position: (f64, f64),
) -> serde_json::Map<String, Value> {
    let mut params = serde_json::Map::new();
    params.insert("layout".to_string(), json!(layout));
    params.insert("title".to_string(), json!(title));
    params.insert("subtitle".to_string(), json!(subtitle));
    params.insert("accent_color".to_string(), json!(accent));
    params.insert("bg_color".to_string(), json!(bg_color));
    params.insert("title_x".to_string(), json!(position.0));
    params.insert("title_y".to_string(), json!(position.1));
    copy_string_param(object, &mut params, "eyebrow");
    copy_string_param(object, &mut params, "description");
    copy_string_param(object, &mut params, "big_number");
    copy_string_param(object, &mut params, "label");
    copy_string_param(object, &mut params, "sublabel");
    params
}

fn text_params(
    object: &serde_json::Map<String, Value>,
    label: &str,
    accent: &str,
    position: (f64, f64),
) -> serde_json::Map<String, Value> {
    let mut params = serde_json::Map::new();
    let text = object
        .get("text")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(label);
    params.insert("text".to_string(), json!(text));
    params.insert("x".to_string(), json!(position.0));
    params.insert("y".to_string(), json!(position.1));
    params.insert("accent_color".to_string(), json!(accent));
    copy_string_param(object, &mut params, "style");
    copy_string_param(object, &mut params, "color");
    copy_string_param(object, &mut params, "align");
    if let Some(size) = object.get("size_px").and_then(Value::as_f64) {
        params.insert("size_px".to_string(), json!(size));
    }
    params
}

fn overlay_params(
    object: &serde_json::Map<String, Value>,
    label: &str,
    accent: &str,
    position: (f64, f64),
) -> serde_json::Map<String, Value> {
    let mut params = serde_json::Map::new();
    let variant = object
        .get("variant")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "badge" | "progress"))
        .unwrap_or("badge");
    let text = object
        .get("text")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or(label);
    params.insert("variant".to_string(), json!(variant));
    params.insert("text".to_string(), json!(text));
    params.insert("x".to_string(), json!(position.0));
    params.insert("y".to_string(), json!(position.1));
    params.insert("accent_color".to_string(), json!(accent));
    if let Some(progress) = object.get("progress").and_then(Value::as_f64) {
        params.insert("progress".to_string(), json!(progress.clamp(0.0, 1.0)));
    }
    params
}

fn subtitle_params(
    object: &serde_json::Map<String, Value>,
    accent: &str,
) -> Option<serde_json::Map<String, Value>> {
    let words = subtitle_words(object.get("words")?)?;
    let mut style = serde_json::Map::new();
    style.insert("active_color".to_string(), json!(accent));
    style.insert("position".to_string(), json!("bottom"));
    style.insert("size_px".to_string(), json!(38));
    style.insert("padding".to_string(), json!(58));
    if let Some(size) = object.get("size_px").and_then(Value::as_f64) {
        style.insert("size_px".to_string(), json!(size));
    }
    copy_string_param(object, &mut style, "active_color");
    copy_string_param(object, &mut style, "position");

    let mut source = serde_json::Map::new();
    source.insert("words".to_string(), Value::Array(words));

    let mut params = serde_json::Map::new();
    params.insert("source".to_string(), Value::Object(source));
    params.insert("style".to_string(), Value::Object(style));
    if let Some(tts) = object.get("tts").filter(|value| value.is_object()) {
        params.insert("tts".to_string(), tts.clone());
    }
    Some(params)
}

fn subtitle_words(value: &Value) -> Option<Vec<Value>> {
    let words = value.as_array()?;
    let normalized: Vec<Value> = words
        .iter()
        .filter_map(|word| {
            let object = word.as_object()?;
            let text = object.get("text").and_then(Value::as_str)?.trim();
            let start_ms = object.get("start_ms").and_then(Value::as_f64)?;
            let end_ms = object.get("end_ms").and_then(Value::as_f64)?;
            if text.is_empty() || end_ms < start_ms {
                return None;
            }
            Some(json!({
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms
            }))
        })
        .collect();
    (!normalized.is_empty()).then_some(normalized)
}

fn audio_params(object: &serde_json::Map<String, Value>) -> Option<serde_json::Map<String, Value>> {
    let src = object
        .get("src")
        .and_then(Value::as_str)
        .filter(|value| value.starts_with("file://") || value.starts_with("data:"))?;
    let mut params = serde_json::Map::new();
    params.insert("src".to_string(), json!(src));
    for key in ["from_ms", "to_ms", "volume"] {
        if let Some(value) = object.get(key).and_then(Value::as_f64) {
            params.insert(key.to_string(), json!(value));
        }
    }
    if let Some(tts) = object.get("tts").filter(|value| value.is_object()) {
        params.insert("tts".to_string(), tts.clone());
    }
    Some(params)
}

fn copy_string_param(
    source: &serde_json::Map<String, Value>,
    target: &mut serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = source
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        target.insert(key.to_string(), json!(value));
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value.chars().skip(1).all(|ch| ch.is_ascii_hexdigit())
}

fn clip_position(object: &serde_json::Map<String, Value>) -> (f64, f64) {
    let position = object.get("position").and_then(Value::as_object);
    let x = position
        .and_then(|value| value.get("x"))
        .and_then(Value::as_f64)
        .unwrap_or(50.0)
        .clamp(5.0, 95.0);
    let y = position
        .and_then(|value| value.get("y"))
        .and_then(Value::as_f64)
        .unwrap_or(50.0)
        .clamp(5.0, 95.0);
    (x, y)
}

fn resolve_time_ms(
    value: Option<&Value>,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    match value {
        Some(Value::Number(number)) => {
            let seconds = number.as_f64().ok_or_else(|| {
                ProjectError::ValidationFailed(format!("{field} must be a finite number"))
            })?;
            seconds_to_ms(seconds, field)
        }
        Some(Value::String(raw)) => resolve_time_expr_ms(raw, anchors, field),
        _ => Err(ProjectError::ValidationFailed(format!(
            "{field} must be a number, anchor, or simple anchor +/- seconds expression"
        ))),
    }
}

fn resolve_time_expr_ms(
    raw: &str,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ProjectError::ValidationFailed(format!("{field} is empty")));
    }
    if let Ok(seconds) = trimmed.parse::<f64>() {
        return seconds_to_ms(seconds, field);
    }
    if let Some(seconds) = anchors.get(trimmed).copied() {
        return seconds_to_ms(seconds, field);
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 3 && (parts[1] == "+" || parts[1] == "-") {
        let base = anchors.get(parts[0]).copied().ok_or_else(|| {
            ProjectError::ValidationFailed(format!("unknown anchor '{}' in {field}", parts[0]))
        })?;
        let delta = parts[2].parse::<f64>().map_err(|err| {
            ProjectError::ValidationFailed(format!("invalid seconds offset in {field}: {err}"))
        })?;
        let seconds = if parts[1] == "+" {
            base + delta
        } else {
            base - delta
        };
        return seconds_to_ms(seconds, field);
    }

    Err(ProjectError::ValidationFailed(format!(
        "unsupported time expression for {field}: '{trimmed}'"
    )))
}

fn seconds_to_ms(seconds: f64, field: &str) -> Result<u64, ProjectError> {
    if !seconds.is_finite() || seconds < 0.0 {
        return Err(ProjectError::ValidationFailed(format!(
            "{field} must be a non-negative finite number"
        )));
    }
    let ms = (seconds * 1000.0).round();
    if ms > u64::MAX as f64 {
        return Err(ProjectError::ValidationFailed(format!(
            "{field} is too large"
        )));
    }
    Ok(ms as u64)
}

fn composition_viewport(value: Option<&Value>) -> Value {
    let object = value.and_then(Value::as_object);
    let w = object
        .and_then(|item| item.get("w"))
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .unwrap_or(1920);
    let h = object
        .and_then(|item| item.get("h"))
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .unwrap_or(1080);
    let ratio = object
        .and_then(|item| item.get("ratio"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("16:9");
    json!({ "w": w, "h": h, "ratio": ratio })
}

fn resolve_composition_anchors(
    value: Option<&Value>,
    duration_ms: u64,
) -> Result<BTreeMap<String, f64>, ProjectError> {
    let mut anchors = BTreeMap::new();
    anchors.insert("start".to_string(), 0.0);
    anchors.insert("end".to_string(), duration_ms as f64 / 1000.0);
    let Some(object) = value.and_then(Value::as_object) else {
        return Ok(anchors);
    };

    for _ in 0..object.len().max(1) {
        let mut changed = false;
        for (name, raw) in object {
            if anchors.contains_key(name) {
                continue;
            }
            match time_value_ms(Some(raw), &anchors, &format!("anchor '{name}'")) {
                Ok(ms) => {
                    anchors.insert(name.clone(), ms as f64 / 1000.0);
                    changed = true;
                }
                Err(ProjectError::ValidationFailed(_)) => {}
                Err(err) => return Err(err),
            }
        }
        if !changed {
            break;
        }
    }

    let unresolved: Vec<String> = object
        .keys()
        .filter(|name| !anchors.contains_key(*name))
        .cloned()
        .collect();
    if !unresolved.is_empty() {
        return Err(ProjectError::ValidationFailed(format!(
            "unresolved composition anchors: {}",
            unresolved.join(", ")
        )));
    }
    Ok(anchors)
}

fn track_time_ms(
    track: &serde_json::Map<String, Value>,
    anchors: &BTreeMap<String, f64>,
    duration_ms: u64,
    track_id: &str,
) -> Result<(u64, u64), ProjectError> {
    let time = track.get("time").and_then(Value::as_object);
    let start_default = Value::String("start".to_string());
    let end_default = Value::String("end".to_string());
    let start_value = time
        .and_then(|value| value.get("start"))
        .or_else(|| track.get("start"))
        .unwrap_or(&start_default);
    let end_value = time
        .and_then(|value| value.get("end"))
        .or_else(|| track.get("end"))
        .unwrap_or(&end_default);
    let start = time_value_ms(Some(start_value), anchors, &format!("track '{track_id}' start"))?;
    let end = time_value_ms(Some(end_value), anchors, &format!("track '{track_id}' end"))?;
    Ok((start.min(duration_ms), end.min(duration_ms)))
}

fn time_value_ms(
    value: Option<&Value>,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    match value {
        Some(Value::Number(number)) => {
            let seconds = number.as_f64().ok_or_else(|| {
                ProjectError::ValidationFailed(format!("{field} must be a finite number"))
            })?;
            seconds_to_ms(seconds, field)
        }
        Some(Value::String(raw)) => time_expr_ms(raw, anchors, field),
        _ => Err(ProjectError::ValidationFailed(format!(
            "{field} must be a number or time expression"
        ))),
    }
}

fn time_expr_ms(
    raw: &str,
    anchors: &BTreeMap<String, f64>,
    field: &str,
) -> Result<u64, ProjectError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ProjectError::ValidationFailed(format!("{field} is empty")));
    }
    let without_unit = trimmed
        .strip_suffix("ms")
        .and_then(|value| value.trim().parse::<f64>().ok())
        .map(|value| value / 1000.0)
        .or_else(|| {
            trimmed
                .strip_suffix('s')
                .and_then(|value| value.trim().parse::<f64>().ok())
        });
    if let Some(seconds) = without_unit {
        return seconds_to_ms(seconds, field);
    }
    if let Ok(seconds) = trimmed.parse::<f64>() {
        return seconds_to_ms(seconds, field);
    }
    if let Some(seconds) = anchors.get(trimmed).copied() {
        return seconds_to_ms(seconds, field);
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 3 && (parts[1] == "+" || parts[1] == "-") {
        let base = anchors.get(parts[0]).copied().ok_or_else(|| {
            ProjectError::ValidationFailed(format!("unknown anchor '{}' in {field}", parts[0]))
        })?;
        let delta_ms = time_expr_ms(parts[2], anchors, field)?;
        let delta = delta_ms as f64 / 1000.0;
        let seconds = if parts[1] == "+" {
            base + delta
        } else {
            base - delta
        };
        return seconds_to_ms(seconds, field);
    }

    Err(ProjectError::ValidationFailed(format!(
        "unsupported time expression for {field}: '{trimmed}'"
    )))
}

fn load_theme_css(root: &Path, project_slug: &str, theme_id: &str) -> Result<String, ProjectError> {
    let theme_dir = root.join(project_slug).join("themes").join(theme_id);
    let mut css = String::new();
    for file in ["tokens.css", "theme.css", "components.css"] {
        let path = theme_dir.join(file);
        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|err| {
                ProjectError::StorageFailed(format!("theme CSS read failed: {}: {err}", path.display()))
            })?;
            css.push_str(&raw);
            css.push('\n');
        }
    }
    Ok(css)
}

fn load_component_js(
    root: &Path,
    project_slug: &str,
    component_id: &str,
) -> Result<String, ProjectError> {
    if component_id.contains('/') || component_id.contains('\\') || component_id.contains("..") {
        return Err(ProjectError::ValidationFailed(format!(
            "invalid component id: {component_id}"
        )));
    }
    let path = root
        .join(project_slug)
        .join("components")
        .join(format!("{component_id}.js"));
    fs::read_to_string(&path).map_err(|err| {
        ProjectError::StorageFailed(format!(
            "component source read failed: {}: {err}",
            path.display()
        ))
    })
}

fn copy_number_param(
    source: &serde_json::Map<String, Value>,
    target: &mut serde_json::Map<String, Value>,
    key: &str,
) {
    if let Some(value) = source.get(key).and_then(Value::as_f64) {
        target.insert(key.to_string(), json!(value));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        Episode, JsonStorage, Project, Registry, RegistryProject, Storage,
        compile_composition_source,
    };

    #[test]
    fn registry_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("registry")?;
        let registry = Registry {
            projects: vec![RegistryProject {
                slug: "next-frame".to_string(),
                name: "NextFrame".to_string(),
                created: "2026-04-21T00:00:00Z".to_string(),
                last_modified: "2026-04-21T00:00:00Z".to_string(),
            }],
        };

        storage.save_registry(&registry)?;
        let loaded = storage.load_registry()?;

        assert_eq!(loaded, registry);
        cleanup(storage.root())?;
        Ok(())
    }

    #[test]
    fn project_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("project")?;
        let project = Project {
            slug: "demo-video".to_string(),
            name: "Demo Video".to_string(),
            description: Some("Demo".to_string()),
            tags: Some(vec!["demo".to_string()]),
            created: "2026-04-21T00:00:00Z".to_string(),
            modified: "2026-04-21T00:00:00Z".to_string(),
        };
        let episode = Episode {
            slug: "ep-01".to_string(),
            name: "Episode 01".to_string(),
            duration: 60.0,
            anchors: Default::default(),
            clips: Vec::new(),
            log: Vec::new(),
        };

        storage.save_project(&project)?;
        storage.save_episode(&project.slug, &episode)?;

        assert_eq!(storage.load_project(&project.slug)?, project);
        assert_eq!(storage.load_episode(&project.slug, &episode.slug)?, episode);
        cleanup(storage.root())?;
        Ok(())
    }

    #[test]
    fn compiles_scene_clips_to_source_json() -> Result<(), Box<dyn std::error::Error>> {
        let episode = Episode {
            slug: "ep-01".to_string(),
            name: "Episode 01".to_string(),
            duration: 5.0,
            anchors: Default::default(),
            clips: vec![
                serde_json::json!({
                    "slug": "intro",
                    "label": "Hello NextFrame",
                    "track": "scene",
                    "start": "0",
                    "end": "5",
                    "position": {"x": 42.0, "y": 58.0}
                }),
                serde_json::json!({
                    "slug": "caption",
                    "label": "Text overlay",
                    "track": "text",
                    "start": "0",
                    "end": "5",
                    "position": {"x": 50.0, "y": 82.0}
                }),
            ],
            log: Vec::new(),
        };

        let compiled = super::compile_episode_source("demo", &episode)?;

        assert_eq!(compiled.source["duration"], 5000);
        assert_eq!(
            compiled.source["tracks"][0]["clips"][0]["params"]["title"],
            "Hello NextFrame"
        );
        assert_eq!(
            compiled.source["tracks"][0]["clips"][0]["params"]["title_x"],
            42.0
        );
        assert_eq!(
            compiled.source["tracks"][0]["clips"][0]["params"]["title_y"],
            58.0
        );
        assert_eq!(compiled.source["tracks"][1]["kind"], "text");
        assert_eq!(
            compiled.source["tracks"][1]["clips"][0]["params"]["text"],
            "Text overlay"
        );
        Ok(())
    }

    #[test]
    fn compiles_v2_composition_components() -> Result<(), Box<dyn std::error::Error>> {
        let storage = test_storage("composition")?;
        let project_dir = storage.root().join("demo");
        std::fs::create_dir_all(project_dir.join("components"))?;
        std::fs::create_dir_all(project_dir.join("themes").join("launch.dark"))?;
        std::fs::write(
            project_dir.join("components").join("html.hero-title.js"),
            "export function mount() {}\nexport function update() {}\n",
        )?;
        std::fs::write(
            project_dir
                .join("themes")
                .join("launch.dark")
                .join("tokens.css"),
            ":root { --accent: #62f5d2; }\n",
        )?;
        let composition = serde_json::json!({
            "id": "launch-open",
            "name": "Launch Open",
            "duration": "4s",
            "theme": "launch.dark",
            "anchors": { "in": "0s", "out": "4s" },
            "tracks": [{
                "id": "hero",
                "kind": "component",
                "component": "html.hero-title",
                "time": { "start": "in", "end": "out" },
                "params": { "title": "Hello" }
            }]
        });

        let compiled = compile_composition_source(&storage, "demo", &composition)?;

        assert_eq!(compiled.source["duration"], 4000);
        assert_eq!(compiled.source["tracks"][0]["kind"], "component");
        assert_eq!(
            compiled.source["tracks"][0]["clips"][0]["params"]["component"],
            "html.hero-title"
        );
        assert!(
            compiled.source["components"]["html.hero-title"]
                .as_str()
                .unwrap_or_default()
                .contains("update")
        );
        assert!(
            compiled.source["theme"]["css"]
                .as_str()
                .unwrap_or_default()
                .contains("--accent")
        );
        cleanup(storage.root())?;
        Ok(())
    }

    fn test_storage(label: &str) -> Result<JsonStorage, Box<dyn std::error::Error>> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("nextframe-{label}-{}-{nanos}", std::process::id()));
        Ok(JsonStorage::new(path))
    }

    fn cleanup(path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
        if path.exists() {
            std::fs::remove_dir_all(path)?;
        }
        Ok(())
    }
}
