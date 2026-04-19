use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static EDITOR_ID_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Selection {
    pub kind: String,
    pub clip_id: Option<String>,
    pub track_id: Option<String>,
    pub multi: Vec<String>,
}

impl Default for Selection {
    fn default() -> Self {
        Self {
            kind: "none".to_string(),
            clip_id: None,
            track_id: None,
            multi: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EditorConfig {
    pub max_undo: usize,
    pub debounce_ms: u64,
    pub autosave: bool,
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            max_undo: 50,
            debounce_ms: 300,
            autosave: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UndoEntry {
    pub id: String,
    pub ts: u64,
    pub op_label: String,
    pub forward: Vec<JsonPatch>,
    pub reverse: Vec<JsonPatch>,
    pub selection_before: Selection,
    pub selection_after: Selection,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JsonPatch {
    pub op: String,
    pub path: String,
    pub value: Option<Value>,
}

pub struct EditorState {
    pub source: Value,
    pub selection: Selection,
    pub undo_stack: Vec<UndoEntry>,
    pub redo_stack: Vec<UndoEntry>,
    pub commit_token: String,
    pub config: EditorConfig,
}

impl EditorState {
    pub fn new(source: Value) -> Self {
        Self {
            config: config_from_source(&source),
            source,
            selection: Selection::default(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            commit_token: make_editor_id("commit"),
        }
    }

    pub fn select_clip(&mut self, clip_id: Option<String>) -> Selection {
        let Some(clip_id) = clip_id else {
            self.selection = Selection::default();
            return self.selection.clone();
        };

        if let Some((track_idx, _)) = self.find_clip_by_id(&clip_id) {
            let track_id = self
                .source
                .pointer(&format!("/tracks/{track_idx}/id"))
                .and_then(Value::as_str)
                .map(str::to_string);
            self.selection = Selection {
                kind: "clip".to_string(),
                clip_id: Some(clip_id),
                track_id,
                multi: Vec::new(),
            };
        } else {
            self.selection = Selection::default();
        }
        self.selection.clone()
    }

    pub fn set_param(
        &mut self,
        clip_id: &str,
        param_path: &str,
        value: Value,
    ) -> Result<UndoEntry, String> {
        if param_path.trim().is_empty() {
            return Err("set-param: path missing".to_string());
        }
        let (track_idx, clip_idx) = self
            .find_clip_by_id(clip_id)
            .ok_or_else(|| format!("set-param: clip not found: {clip_id}"))?;
        let pointer = clip_param_pointer(track_idx, clip_idx, param_path);
        let old_value = self.source.pointer(&pointer).cloned();
        let forward_op = if old_value.is_some() {
            "replace"
        } else {
            "add"
        };
        let selection_before = self.selection.clone();
        let selection_after = self.select_clip(Some(clip_id.to_string()));
        let reverse_patch = match old_value {
            Some(prev) => JsonPatch {
                op: "replace".to_string(),
                path: pointer.clone(),
                value: Some(prev),
            },
            None => JsonPatch {
                op: "remove".to_string(),
                path: pointer.clone(),
                value: None,
            },
        };
        let forward_patch = JsonPatch {
            op: forward_op.to_string(),
            path: pointer,
            value: Some(value),
        };
        Self::apply_patches(&mut self.source, &[forward_patch.clone()])?;

        let op_label = match param_path.rsplit('.').next() {
            Some(seg) if !seg.is_empty() => format!("set param {seg}"),
            _ => "set param".to_string(),
        };
        let entry = UndoEntry {
            id: make_editor_id("undo"),
            ts: now_ms(),
            op_label,
            forward: vec![forward_patch],
            reverse: vec![reverse_patch],
            selection_before,
            selection_after: selection_after.clone(),
        };
        self.push_undo(entry.clone());
        self.redo_stack.clear();
        self.selection = selection_after;
        self.bump_commit_token();
        Ok(entry)
    }

    pub fn undo(&mut self) -> Option<UndoEntry> {
        let entry = self.undo_stack.pop()?;
        if Self::apply_patches(&mut self.source, &entry.reverse).is_err() {
            self.undo_stack.push(entry);
            return None;
        }
        self.selection = entry.selection_before.clone();
        self.redo_stack.push(entry.clone());
        self.bump_commit_token();
        Some(entry)
    }

    pub fn redo(&mut self) -> Option<UndoEntry> {
        let entry = self.redo_stack.pop()?;
        if Self::apply_patches(&mut self.source, &entry.forward).is_err() {
            self.redo_stack.push(entry);
            return None;
        }
        self.selection = entry.selection_after.clone();
        self.push_undo(entry.clone());
        self.bump_commit_token();
        Some(entry)
    }

    pub fn apply_patches(source: &mut Value, patches: &[JsonPatch]) -> Result<(), String> {
        for patch in patches {
            apply_patch(source, patch)?;
        }
        Ok(())
    }

    pub fn find_clip_by_id(&self, clip_id: &str) -> Option<(usize, usize)> {
        let tracks = self.source.get("tracks")?.as_array()?;
        for (track_idx, track) in tracks.iter().enumerate() {
            let clips = track.get("clips")?.as_array()?;
            for (clip_idx, clip) in clips.iter().enumerate() {
                let clip_match = clip.get("id").and_then(Value::as_str) == Some(clip_id);
                let begin_match = clip.get("id").is_none()
                    && clip.get("begin").and_then(Value::as_str) == Some(clip_id);
                if clip_match || begin_match {
                    return Some((track_idx, clip_idx));
                }
            }
        }
        None
    }

    pub fn bump_commit_token(&mut self) {
        self.commit_token = make_editor_id("commit");
    }

    fn push_undo(&mut self, entry: UndoEntry) {
        self.undo_stack.push(entry);
        if self.undo_stack.len() > self.config.max_undo {
            let overflow = self.undo_stack.len().saturating_sub(self.config.max_undo);
            if overflow > 0 {
                self.undo_stack.drain(0..overflow);
            }
        }
    }
}

fn config_from_source(source: &Value) -> EditorConfig {
    let mut cfg = EditorConfig::default();
    let Some(editor_cfg) = source.pointer("/meta/editor") else {
        return cfg;
    };
    if let Some(max_undo) = editor_cfg.get("max_undo").and_then(Value::as_u64) {
        cfg.max_undo = usize::try_from(max_undo)
            .ok()
            .filter(|v| *v > 0)
            .unwrap_or(50);
    }
    if let Some(debounce_ms) = editor_cfg.get("debounce_ms").and_then(Value::as_u64) {
        cfg.debounce_ms = debounce_ms;
    }
    if let Some(autosave) = editor_cfg.get("autosave").and_then(Value::as_bool) {
        cfg.autosave = autosave;
    }
    cfg
}

fn clip_param_pointer(track_idx: usize, clip_idx: usize, param_path: &str) -> String {
    let mut pointer = format!("/tracks/{track_idx}/clips/{clip_idx}/params");
    for seg in param_path.split('.') {
        if seg.is_empty() {
            continue;
        }
        pointer.push('/');
        pointer.push_str(&escape_pointer_segment(seg));
    }
    pointer
}

fn apply_patch(source: &mut Value, patch: &JsonPatch) -> Result<(), String> {
    let segments = decode_pointer(&patch.path)?;
    match patch.op.as_str() {
        "add" | "replace" => {
            let Some(next_value) = patch.value.clone() else {
                return Err(format!("patch {} missing value", patch.op));
            };
            if segments.is_empty() {
                *source = next_value;
                return Ok(());
            }
            let (parent, key) = resolve_parent_mut(source, &segments)?;
            match parent {
                Value::Object(obj) => {
                    if patch.op == "replace" && !obj.contains_key(&key) {
                        return Err(format!("patch replace missing object key '{}'", key));
                    }
                    obj.insert(key, next_value);
                    Ok(())
                }
                Value::Array(arr) => {
                    let idx = parse_index(&key)?;
                    if patch.op == "add" {
                        if idx > arr.len() {
                            return Err(format!("patch add index {idx} out of bounds"));
                        }
                        if idx == arr.len() {
                            arr.push(next_value);
                        } else {
                            arr.insert(idx, next_value);
                        }
                    } else if idx < arr.len() {
                        arr[idx] = next_value;
                    } else {
                        return Err(format!("patch replace index {idx} out of bounds"));
                    }
                    Ok(())
                }
                _ => Err(format!("patch {} parent is not object/array", patch.op)),
            }
        }
        "remove" => {
            if segments.is_empty() {
                *source = Value::Null;
                return Ok(());
            }
            let (parent, key) = resolve_parent_mut(source, &segments)?;
            match parent {
                Value::Object(obj) => {
                    if obj.remove(&key).is_some() {
                        Ok(())
                    } else {
                        Err(format!("patch remove missing object key '{}'", key))
                    }
                }
                Value::Array(arr) => {
                    let idx = parse_index(&key)?;
                    if idx < arr.len() {
                        arr.remove(idx);
                        Ok(())
                    } else {
                        Err(format!("patch remove index {idx} out of bounds"))
                    }
                }
                _ => Err("patch remove parent is not object/array".to_string()),
            }
        }
        other => Err(format!("unsupported patch op '{other}'")),
    }
}

fn resolve_parent_mut<'a>(
    source: &'a mut Value,
    segments: &[String],
) -> Result<(&'a mut Value, String), String> {
    let Some(last) = segments.last() else {
        return Err("patch path empty".to_string());
    };
    let mut cursor = source;
    for seg in &segments[..segments.len().saturating_sub(1)] {
        cursor = match cursor {
            Value::Object(obj) => obj
                .get_mut(seg)
                .ok_or_else(|| format!("patch path missing object key '{seg}'"))?,
            Value::Array(arr) => {
                let idx = parse_index(seg)?;
                arr.get_mut(idx)
                    .ok_or_else(|| format!("patch path missing array index {idx}"))?
            }
            _ => return Err(format!("patch path walks into non-container at '{seg}'")),
        };
    }
    Ok((cursor, last.clone()))
}

fn decode_pointer(path: &str) -> Result<Vec<String>, String> {
    if path.is_empty() {
        return Ok(Vec::new());
    }
    if !path.starts_with('/') {
        return Err(format!("json pointer must start with '/', got '{path}'"));
    }
    Ok(path
        .split('/')
        .skip(1)
        .map(|seg| seg.replace("~1", "/").replace("~0", "~"))
        .collect())
}

fn escape_pointer_segment(seg: &str) -> String {
    seg.replace('~', "~0").replace('/', "~1")
}

fn parse_index(input: &str) -> Result<usize, String> {
    input
        .parse::<usize>()
        .map_err(|_| format!("invalid array index '{input}'"))
}

fn now_ms() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis().try_into().unwrap_or(u64::MAX),
        Err(_) => 0,
    }
}

fn make_editor_id(prefix: &str) -> String {
    let seq = EDITOR_ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{seq}", now_ms())
}
