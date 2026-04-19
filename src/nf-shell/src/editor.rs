use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
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

        self.selection = self.selection_for_clip(&clip_id);
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
        let selection_after = self.selection_for_clip(clip_id);
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
        self.push_with_cap(entry.clone());
        self.selection = selection_after;
        self.bump_commit_token();
        Ok(entry)
    }

    pub fn split_clip(&mut self, clip_id: &str, at_ms: u64) -> Result<UndoEntry, String> {
        let split_ms = i64::try_from(at_ms).map_err(|_| "split-clip: at_ms out of range")?;
        let (track_idx, clip_idx) = self
            .find_clip_by_id(clip_id)
            .ok_or_else(|| format!("split-clip: clip not found: {clip_id}"))?;
        let clips_path = format!("/tracks/{track_idx}/clips");
        let old_clips = self
            .source
            .pointer(&clips_path)
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| format!("split-clip: clips missing for track {track_idx}"))?;
        let original_clip = old_clips
            .get(clip_idx)
            .cloned()
            .ok_or_else(|| format!("split-clip: invalid clip index {clip_idx}"))?;
        let mut resolver = TimelineResolver::new(&self.source);
        let (begin_ms, end_ms) = clip_bounds_ms(&mut resolver, &original_clip)?;
        if split_ms <= begin_ms || split_ms >= end_ms {
            return Err(format!(
                "split-clip: split {split_ms}ms must be inside {begin_ms}..{end_ms} for {clip_id}"
            ));
        }

        let mut next_clips = old_clips.clone();
        let right_clip_id = make_editor_id("clip");

        let mut left_clip = original_clip.clone();
        if left_clip.get("id").is_none() {
            left_clip["id"] = Value::String(clip_id.to_string());
        }
        left_clip["end"] = ms_value(split_ms);

        let mut right_clip = original_clip;
        right_clip["id"] = Value::String(right_clip_id.clone());
        right_clip["begin"] = ms_value(split_ms);

        next_clips[clip_idx] = left_clip;
        next_clips.insert(clip_idx + 1, right_clip);

        let next_transitions =
            transitions_after_split(self.source.get("meta"), clip_id, &right_clip_id);
        let selection_before = self.selection.clone();
        let mut forward = Vec::new();
        let mut reverse = Vec::new();
        push_value_patch_if_changed(
            &mut forward,
            &mut reverse,
            clips_path,
            Some(Value::Array(old_clips)),
            Some(Value::Array(next_clips.clone())),
        )?;
        push_value_patch_if_changed(
            &mut forward,
            &mut reverse,
            "/meta/transitions".to_string(),
            self.source.pointer("/meta/transitions").cloned(),
            next_transitions,
        )?;

        Self::apply_patches(&mut self.source, &forward)?;
        let selection_after = selection_after_source_change(
            &self.source,
            &selection_before,
            if selection_before.clip_id.as_deref() == Some(clip_id) {
                Some(right_clip_id.as_str())
            } else {
                None
            },
        );
        let entry = UndoEntry {
            id: make_editor_id("undo"),
            ts: now_ms(),
            op_label: "split clip".to_string(),
            forward,
            reverse,
            selection_before,
            selection_after: selection_after.clone(),
        };
        self.push_with_cap(entry.clone());
        self.selection = selection_after;
        self.bump_commit_token();
        Ok(entry)
    }

    pub fn delete_clip(&mut self, clip_id: &str, ripple: bool) -> Result<UndoEntry, String> {
        let (track_idx, clip_idx) = self
            .find_clip_by_id(clip_id)
            .ok_or_else(|| format!("delete-clip: clip not found: {clip_id}"))?;
        let tracks = self
            .source
            .get("tracks")
            .and_then(Value::as_array)
            .ok_or_else(|| "delete-clip: source.tracks missing".to_string())?;
        let mut resolver = TimelineResolver::new(&self.source);
        let target_clip = tracks
            .get(track_idx)
            .and_then(|track| track.get("clips"))
            .and_then(Value::as_array)
            .and_then(|clips| clips.get(clip_idx))
            .cloned()
            .ok_or_else(|| format!("delete-clip: invalid clip index {clip_idx}"))?;
        let (cut_begin_ms, cut_end_ms) = clip_bounds_ms(&mut resolver, &target_clip)?;
        let gap_ms = cut_end_ms - cut_begin_ms;
        if gap_ms <= 0 {
            return Err(format!(
                "delete-clip: non-positive clip duration for {clip_id}"
            ));
        }

        let mut next_tracks = Vec::with_capacity(tracks.len());
        let mut modified_tracks = Vec::new();
        let mut removed_clip_ids = HashSet::from([clip_id.to_string()]);

        for (current_track_idx, track) in tracks.iter().enumerate() {
            let old_clips = track
                .get("clips")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut next_clips = Vec::with_capacity(old_clips.len());
            let mut changed = false;
            for clip in old_clips.iter() {
                let current_id = clip
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_default();
                if current_track_idx == track_idx && clip_identity_matches(clip, clip_id) {
                    changed = true;
                    continue;
                }
                if ripple {
                    let (begin_ms, end_ms) = clip_bounds_ms(&mut resolver, clip)?;
                    match ripple_adjust_clip_bounds(begin_ms, end_ms, cut_begin_ms, cut_end_ms) {
                        Some((next_begin_ms, next_end_ms)) => {
                            if next_begin_ms != begin_ms || next_end_ms != end_ms {
                                let mut next_clip = clip.clone();
                                next_clip["begin"] = ms_value(next_begin_ms);
                                next_clip["end"] = ms_value(next_end_ms);
                                next_clips.push(next_clip);
                                changed = true;
                            } else {
                                next_clips.push(clip.clone());
                            }
                        }
                        None => {
                            changed = true;
                            if !current_id.is_empty() {
                                removed_clip_ids.insert(current_id);
                            }
                        }
                    }
                } else {
                    next_clips.push(clip.clone());
                }
            }
            if changed {
                modified_tracks.push((current_track_idx, old_clips.clone(), next_clips.clone()));
            }
            let mut next_track = track.clone();
            next_track["clips"] = Value::Array(next_clips);
            next_tracks.push(next_track);
        }

        let fallback_clip_id = next_tracks
            .get(track_idx)
            .and_then(|track| track.get("clips"))
            .and_then(Value::as_array)
            .and_then(|clips| {
                clips
                    .get(clip_idx)
                    .or_else(|| clip_idx.checked_sub(1).and_then(|idx| clips.get(idx)))
            })
            .and_then(|clip| clip.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string);

        let selection_before = self.selection.clone();
        let mut forward = Vec::new();
        let mut reverse = Vec::new();
        for (changed_track_idx, old_clips, next_clips) in modified_tracks {
            push_value_patch_if_changed(
                &mut forward,
                &mut reverse,
                format!("/tracks/{changed_track_idx}/clips"),
                Some(Value::Array(old_clips)),
                Some(Value::Array(next_clips)),
            )?;
        }

        let next_transitions = transitions_after_delete(self.source.get("meta"), &removed_clip_ids);
        push_value_patch_if_changed(
            &mut forward,
            &mut reverse,
            "/meta/transitions".to_string(),
            self.source.pointer("/meta/transitions").cloned(),
            next_transitions,
        )?;

        if ripple {
            let next_duration_ms = next_tracks
                .iter()
                .flat_map(|track| {
                    track
                        .get("clips")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(|clip| {
                            let end = clip.get("end")?;
                            resolve_ms_in_value(&self.source, end).ok()
                        })
                })
                .max()
                .unwrap_or(0);
            push_value_patch_if_changed(
                &mut forward,
                &mut reverse,
                "/duration".to_string(),
                self.source.get("duration").cloned(),
                Some(ms_value(next_duration_ms)),
            )?;
        }

        Self::apply_patches(&mut self.source, &forward)?;
        let selection_after = selection_after_source_change(
            &self.source,
            &selection_before,
            if selection_before.clip_id.as_deref() == Some(clip_id) {
                fallback_clip_id.as_deref()
            } else {
                None
            },
        );
        let entry = UndoEntry {
            id: make_editor_id("undo"),
            ts: now_ms(),
            op_label: if ripple {
                "ripple delete clip".to_string()
            } else {
                "delete clip".to_string()
            },
            forward,
            reverse,
            selection_before,
            selection_after: selection_after.clone(),
        };
        self.push_with_cap(entry.clone());
        self.selection = selection_after;
        self.bump_commit_token();
        Ok(entry)
    }

    pub fn ripple_delete(&mut self, clip_id: &str) -> Result<UndoEntry, String> {
        self.delete_clip(clip_id, true)
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
        self.push_undo_capped(entry.clone());
        self.bump_commit_token();
        Some(entry)
    }

    pub fn set_track_mute(&mut self, track_id: &str, muted: bool) -> Result<UndoEntry, String> {
        self.set_track_flag(track_id, "muted", muted, "mute track")
    }

    pub fn set_track_solo(&mut self, track_id: &str, solo: bool) -> Result<UndoEntry, String> {
        self.set_track_flag(track_id, "solo", solo, "solo track")
    }

    pub fn apply_patches(source: &mut Value, patches: &[JsonPatch]) -> Result<(), String> {
        for patch in patches {
            apply_patch(source, patch)?;
        }
        Ok(())
    }

    pub fn find_track_by_id(&self, track_id: &str) -> Option<usize> {
        let tracks = self.source.get("tracks")?.as_array()?;
        for (track_idx, track) in tracks.iter().enumerate() {
            if track.get("id").and_then(Value::as_str) == Some(track_id) {
                return Some(track_idx);
            }
        }
        None
    }

    pub fn find_clip_by_id(&self, clip_id: &str) -> Option<(usize, usize)> {
        Self::find_clip_by_id_in_source(&self.source, clip_id)
    }

    pub fn bump_commit_token(&mut self) {
        self.commit_token = make_editor_id("commit");
    }

    fn find_clip_by_id_in_source(source: &Value, clip_id: &str) -> Option<(usize, usize)> {
        let tracks = source.get("tracks")?.as_array()?;
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

    fn selection_for_clip(&self, clip_id: &str) -> Selection {
        selection_for_clip_in_source(&self.source, clip_id)
    }

    fn set_track_flag(
        &mut self,
        track_id: &str,
        field: &str,
        value: bool,
        op_label: &str,
    ) -> Result<UndoEntry, String> {
        let track_idx = self
            .find_track_by_id(track_id)
            .ok_or_else(|| format!("set-track-{field}: track not found: {track_id}"))?;
        let pointer = format!("/tracks/{track_idx}/{}", escape_pointer_segment(field));
        let old_value = self.source.pointer(&pointer).cloned();
        let forward_patch = JsonPatch {
            op: if old_value.is_some() {
                "replace".to_string()
            } else {
                "add".to_string()
            },
            path: pointer.clone(),
            value: Some(Value::Bool(value)),
        };
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
        let selection_before = self.selection.clone();
        let selection_after = self.selection.clone();
        Self::apply_patches(&mut self.source, &[forward_patch.clone()])?;
        let entry = UndoEntry {
            id: make_editor_id("undo"),
            ts: now_ms(),
            op_label: op_label.to_string(),
            forward: vec![forward_patch],
            reverse: vec![reverse_patch],
            selection_before,
            selection_after,
        };
        self.push_with_cap(entry.clone());
        self.bump_commit_token();
        Ok(entry)
    }

    fn push_undo_capped(&mut self, entry: UndoEntry) {
        let cap = self.config.max_undo.max(1);
        if self.undo_stack.len() >= cap {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(entry);
    }

    fn push_with_cap(&mut self, entry: UndoEntry) {
        self.push_undo_capped(entry);
        self.redo_stack.clear();
    }
}

#[derive(Clone, Debug)]
enum ExprNode {
    Duration(i64),
    Ref {
        anchor: String,
        field: Option<String>,
    },
    Binary {
        op: char,
        left: Box<ExprNode>,
        right: Box<ExprNode>,
    },
}

#[derive(Clone, Debug)]
enum ResolvedAnchor {
    Point { at_ms: i64 },
    Range { begin_ms: i64, end_ms: i64 },
}

struct TimelineResolver<'a> {
    source: &'a Value,
    cache: HashMap<String, ResolvedAnchor>,
    visiting: HashSet<String>,
}

impl<'a> TimelineResolver<'a> {
    fn new(source: &'a Value) -> Self {
        Self {
            source,
            cache: HashMap::new(),
            visiting: HashSet::new(),
        }
    }

    fn resolve_value(&mut self, value: &Value) -> Result<i64, String> {
        match value {
            Value::Number(num) => {
                if let Some(raw) = num.as_i64() {
                    Ok(raw)
                } else if let Some(raw) = num.as_f64() {
                    Ok(raw.round() as i64)
                } else {
                    Err("timeline-resolve: unsupported numeric value".to_string())
                }
            }
            Value::String(raw) => self.resolve_expr(raw),
            other => Err(format!(
                "timeline-resolve: expected number|string, got {}",
                other
            )),
        }
    }

    fn resolve_expr(&mut self, expr: &str) -> Result<i64, String> {
        let parsed = parse_expr(expr)?;
        self.eval_expr(&parsed)
    }

    fn eval_expr(&mut self, expr: &ExprNode) -> Result<i64, String> {
        match expr {
            ExprNode::Duration(ms) => Ok(*ms),
            ExprNode::Binary { op, left, right } => {
                let lhs = self.eval_expr(left)?;
                let rhs = self.eval_expr(right)?;
                Ok(if *op == '+' { lhs + rhs } else { lhs - rhs })
            }
            ExprNode::Ref { anchor, field } => {
                let resolved = self.resolve_anchor(anchor)?;
                match (resolved, field.as_deref()) {
                    (ResolvedAnchor::Point { at_ms }, None) => Ok(at_ms),
                    (ResolvedAnchor::Range { begin_ms, .. }, None) => Ok(begin_ms),
                    (ResolvedAnchor::Point { at_ms }, Some("at")) => Ok(at_ms),
                    (ResolvedAnchor::Range { begin_ms, .. }, Some("begin")) => Ok(begin_ms),
                    (ResolvedAnchor::Range { end_ms, .. }, Some("end")) => Ok(end_ms),
                    (_, Some(name)) => Err(format!(
                        "timeline-resolve: unknown anchor field '{anchor}.{name}'"
                    )),
                }
            }
        }
    }

    fn resolve_anchor(&mut self, name: &str) -> Result<ResolvedAnchor, String> {
        if let Some(resolved) = self.cache.get(name).cloned() {
            return Ok(resolved);
        }
        if !self.visiting.insert(name.to_string()) {
            return Err(format!("timeline-resolve: anchor cycle at '{name}'"));
        }

        let raw = self
            .source
            .get("anchors")
            .and_then(Value::as_object)
            .and_then(|anchors| anchors.get(name))
            .cloned()
            .ok_or_else(|| format!("timeline-resolve: anchor '{name}' not found"))?;
        let resolved = if let Some(at_value) = raw.get("at").cloned() {
            ResolvedAnchor::Point {
                at_ms: self.resolve_value(&at_value)?,
            }
        } else {
            let begin_value = raw
                .get("begin")
                .cloned()
                .ok_or_else(|| format!("timeline-resolve: anchor '{name}' missing begin"))?;
            let begin_ms = self.resolve_value(&begin_value)?;
            self.cache.insert(
                name.to_string(),
                ResolvedAnchor::Range {
                    begin_ms,
                    end_ms: begin_ms,
                },
            );
            let end_value = raw
                .get("end")
                .cloned()
                .ok_or_else(|| format!("timeline-resolve: anchor '{name}' missing end"))?;
            let end_ms = self.resolve_value(&end_value)?;
            ResolvedAnchor::Range { begin_ms, end_ms }
        };

        self.cache.insert(name.to_string(), resolved.clone());
        self.visiting.remove(name);
        Ok(resolved)
    }
}

struct ExprParser<'a> {
    src: &'a str,
    pos: usize,
}

impl<'a> ExprParser<'a> {
    fn parse_add_sub(&mut self) -> Result<ExprNode, String> {
        let mut left = self.parse_term()?;
        loop {
            self.skip_ws();
            let op = match self.peek() {
                Some('+') => '+',
                Some('-') => '-',
                _ => break,
            };
            self.pos += 1;
            let right = self.parse_term()?;
            left = ExprNode::Binary {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<ExprNode, String> {
        self.skip_ws();
        match self.peek() {
            Some(ch) if ch.is_ascii_digit() => self.parse_duration(),
            Some(ch) if is_ident_start(ch) => self.parse_ref(),
            Some(ch) => Err(format!(
                "timeline-resolve: unexpected '{ch}' in '{}' at col {}",
                self.src, self.pos
            )),
            None => Err("timeline-resolve: unexpected end of expr".to_string()),
        }
    }

    fn parse_duration(&mut self) -> Result<ExprNode, String> {
        let start = self.pos;
        while matches!(self.peek(), Some(ch) if ch.is_ascii_digit()) {
            self.pos += 1;
        }
        if self.peek() == Some('.') {
            let dot_pos = self.pos;
            self.pos += 1;
            if !matches!(self.peek(), Some(ch) if ch.is_ascii_digit()) {
                self.pos = dot_pos;
            } else {
                while matches!(self.peek(), Some(ch) if ch.is_ascii_digit()) {
                    self.pos += 1;
                }
            }
        }
        let number = self.src[start..self.pos]
            .trim()
            .parse::<f64>()
            .map_err(|_| {
                format!(
                    "timeline-resolve: invalid duration '{}'",
                    &self.src[start..self.pos]
                )
            })?;
        let factor = if self.src[self.pos..].starts_with("ms") {
            self.pos += 2;
            1.0
        } else if self.src[self.pos..].starts_with('s') {
            self.pos += 1;
            1000.0
        } else if self.src[self.pos..].starts_with('m') {
            self.pos += 1;
            60_000.0
        } else {
            1.0
        };
        Ok(ExprNode::Duration((number * factor).round() as i64))
    }

    fn parse_ref(&mut self) -> Result<ExprNode, String> {
        let anchor = self.parse_ident()?;
        let field = if self.peek() == Some('.') {
            self.pos += 1;
            Some(self.parse_ident()?)
        } else {
            None
        };
        Ok(ExprNode::Ref { anchor, field })
    }

    fn parse_ident(&mut self) -> Result<String, String> {
        let start = self.pos;
        match self.peek() {
            Some(ch) if is_ident_start(ch) => self.pos += 1,
            _ => {
                return Err(format!(
                    "timeline-resolve: expected identifier in '{}' at col {}",
                    self.src, self.pos
                ))
            }
        }
        while matches!(self.peek(), Some(ch) if is_ident_continue(ch)) {
            self.pos += 1;
        }
        Ok(self.src[start..self.pos].to_string())
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(' ' | '\t')) {
            self.pos += 1;
        }
    }

    fn peek(&self) -> Option<char> {
        self.src.as_bytes().get(self.pos).map(|b| *b as char)
    }
}

fn parse_expr(src: &str) -> Result<ExprNode, String> {
    if src.trim().is_empty() {
        return Err("timeline-resolve: empty expression".to_string());
    }
    let mut parser = ExprParser { src, pos: 0 };
    let parsed = parser.parse_add_sub()?;
    parser.skip_ws();
    if parser.pos < src.len() {
        return Err(format!(
            "timeline-resolve: unexpected '{}' in '{}' at col {}",
            src.as_bytes()[parser.pos] as char,
            src,
            parser.pos
        ));
    }
    Ok(parsed)
}

fn is_ident_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_'
}

fn is_ident_continue(ch: char) -> bool {
    is_ident_start(ch) || ch.is_ascii_digit()
}

fn resolve_ms_in_value(source: &Value, value: &Value) -> Result<i64, String> {
    TimelineResolver::new(source).resolve_value(value)
}

fn clip_bounds_ms(resolver: &mut TimelineResolver<'_>, clip: &Value) -> Result<(i64, i64), String> {
    let begin_ms = clip
        .get("begin")
        .ok_or_else(|| "clip bounds: begin missing".to_string())
        .and_then(|value| resolver.resolve_value(value))?;
    let end_ms = clip
        .get("end")
        .ok_or_else(|| "clip bounds: end missing".to_string())
        .and_then(|value| resolver.resolve_value(value))?;
    Ok((begin_ms, end_ms))
}

fn ms_value(ms: i64) -> Value {
    Value::String(format!("{ms}ms"))
}

fn clip_identity_matches(clip: &Value, clip_id: &str) -> bool {
    clip.get("id").and_then(Value::as_str) == Some(clip_id)
        || (clip.get("id").is_none() && clip.get("begin").and_then(Value::as_str) == Some(clip_id))
}

fn selection_for_clip_in_source(source: &Value, clip_id: &str) -> Selection {
    if let Some((track_idx, _)) = EditorState::find_clip_by_id_in_source(source, clip_id) {
        let track_id = source
            .pointer(&format!("/tracks/{track_idx}/id"))
            .and_then(Value::as_str)
            .map(str::to_string);
        Selection {
            kind: "clip".to_string(),
            clip_id: Some(clip_id.to_string()),
            track_id,
            multi: Vec::new(),
        }
    } else {
        Selection::default()
    }
}

fn selection_after_source_change(
    source: &Value,
    selection_before: &Selection,
    preferred_clip_id: Option<&str>,
) -> Selection {
    if let Some(clip_id) = preferred_clip_id {
        let next = selection_for_clip_in_source(source, clip_id);
        if next.kind == "clip" {
            return next;
        }
    }
    if selection_before.kind == "clip" {
        if let Some(clip_id) = selection_before.clip_id.as_deref() {
            let current = selection_for_clip_in_source(source, clip_id);
            if current.kind == "clip" {
                return current;
            }
        }
    }
    Selection::default()
}

fn build_patch_pair(
    path: String,
    old_value: Option<Value>,
    new_value: Option<Value>,
) -> Result<(JsonPatch, JsonPatch), String> {
    match (old_value, new_value) {
        (Some(old), Some(new)) => Ok((
            JsonPatch {
                op: "replace".to_string(),
                path: path.clone(),
                value: Some(new),
            },
            JsonPatch {
                op: "replace".to_string(),
                path,
                value: Some(old),
            },
        )),
        (None, Some(new)) => Ok((
            JsonPatch {
                op: "add".to_string(),
                path: path.clone(),
                value: Some(new),
            },
            JsonPatch {
                op: "remove".to_string(),
                path,
                value: None,
            },
        )),
        (Some(old), None) => Ok((
            JsonPatch {
                op: "remove".to_string(),
                path: path.clone(),
                value: None,
            },
            JsonPatch {
                op: "add".to_string(),
                path,
                value: Some(old),
            },
        )),
        (None, None) => Err("patch pair: no-op value pair".to_string()),
    }
}

fn push_value_patch_if_changed(
    forward: &mut Vec<JsonPatch>,
    reverse: &mut Vec<JsonPatch>,
    path: String,
    old_value: Option<Value>,
    new_value: Option<Value>,
) -> Result<(), String> {
    if old_value == new_value {
        return Ok(());
    }
    let (next_forward, next_reverse) = build_patch_pair(path, old_value, new_value)?;
    forward.push(next_forward);
    reverse.push(next_reverse);
    Ok(())
}

fn transitions_after_split(
    meta: Option<&Value>,
    clip_id: &str,
    right_clip_id: &str,
) -> Option<Value> {
    let mut transitions = meta
        .and_then(|value| value.get("transitions"))
        .and_then(Value::as_array)
        .cloned()?;
    for transition in transitions.iter_mut() {
        let Some(between) = transition.get_mut("between").and_then(Value::as_array_mut) else {
            continue;
        };
        if between.len() != 2 {
            continue;
        }
        let first_is_target = between[0].as_str() == Some(clip_id);
        let second_is_target = between[1].as_str() == Some(clip_id);
        if first_is_target {
            between[0] = Value::String(right_clip_id.to_string());
        }
        if first_is_target && second_is_target {
            between[1] = Value::String(clip_id.to_string());
        }
    }
    Some(Value::Array(transitions))
}

fn transitions_after_delete(
    meta: Option<&Value>,
    removed_clip_ids: &HashSet<String>,
) -> Option<Value> {
    let transitions = meta
        .and_then(|value| value.get("transitions"))
        .and_then(Value::as_array)?;
    let filtered = transitions
        .iter()
        .filter(|transition| {
            let between = transition.get("between").and_then(Value::as_array);
            !between
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .any(|clip_id| removed_clip_ids.contains(clip_id))
        })
        .cloned()
        .collect::<Vec<_>>();
    Some(Value::Array(filtered))
}

fn ripple_adjust_clip_bounds(
    begin_ms: i64,
    end_ms: i64,
    cut_begin_ms: i64,
    cut_end_ms: i64,
) -> Option<(i64, i64)> {
    if end_ms <= cut_begin_ms {
        return Some((begin_ms, end_ms));
    }
    if begin_ms >= cut_end_ms {
        let delta = cut_end_ms - cut_begin_ms;
        return Some((begin_ms - delta, end_ms - delta));
    }
    let next_begin_ms = if begin_ms < cut_begin_ms {
        begin_ms
    } else {
        cut_begin_ms
    };
    let next_end_ms = if end_ms > cut_end_ms {
        end_ms - (cut_end_ms - cut_begin_ms)
    } else {
        cut_begin_ms
    };
    if next_end_ms <= next_begin_ms {
        None
    } else {
        Some((next_begin_ms, next_end_ms))
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

#[cfg(test)]
mod tests {
    use super::EditorState;
    use serde_json::{json, Value};

    fn sample_source() -> Value {
        json!({
            "meta": {
                "editor": {
                    "max_undo": 50
                }
            },
            "tracks": [
                {
                    "id": "tr_scene",
                    "kind": "scene",
                    "clips": [
                        {
                            "id": "clip_title",
                            "begin": 0,
                            "end": 1000,
                            "params": {
                                "title": "A"
                            }
                        }
                    ]
                },
                {
                    "id": "tr_audio",
                    "kind": "audio",
                    "clips": [
                        {
                            "id": "clip_audio",
                            "begin": 0,
                            "end": 1000,
                            "params": {
                                "src": "file:///tmp/demo.mp3"
                            }
                        }
                    ]
                }
            ]
        })
    }

    fn title(editor: &EditorState) -> String {
        editor
            .source
            .pointer("/tracks/0/clips/0/params/title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    }

    fn clip_edit_source() -> Value {
        json!({
            "duration": "5s",
            "tracks": [
                {
                    "id": "tr_scene",
                    "kind": "scene",
                    "clips": [
                        {
                            "id": "clip_a",
                            "begin": "0",
                            "end": "5s",
                            "params": {
                                "title": "A"
                            }
                        }
                    ]
                }
            ]
        })
    }

    fn ripple_source() -> Value {
        json!({
            "duration": "5s",
            "tracks": [
                {
                    "id": "tr_scene",
                    "kind": "scene",
                    "clips": [
                        {
                            "id": "clip_a",
                            "begin": "0",
                            "end": "3s",
                            "params": {
                                "title": "A"
                            }
                        },
                        {
                            "id": "clip_b",
                            "begin": "3s",
                            "end": "5s",
                            "params": {
                                "title": "B"
                            }
                        }
                    ]
                }
            ]
        })
    }

    #[test]
    fn undo_redo_restores_title_and_selection() {
        let mut editor = EditorState::new(sample_source());
        editor.select_clip(Some("clip_title".to_string()));
        let selection_before = editor.selection.clone();

        let entry = editor
            .set_param("clip_title", "title", Value::String("B".to_string()))
            .unwrap();
        assert_eq!(entry.op_label, "set param title");
        assert_eq!(title(&editor), "B");
        assert_eq!(editor.undo_stack.len(), 1);
        assert_eq!(editor.redo_stack.len(), 0);

        let undone = editor.undo().unwrap();
        assert_eq!(undone.id, entry.id);
        assert_eq!(title(&editor), "A");
        assert_eq!(editor.undo_stack.len(), 0);
        assert_eq!(editor.redo_stack.len(), 1);
        assert_eq!(editor.selection.clip_id, selection_before.clip_id);

        let redone = editor.redo().unwrap();
        assert_eq!(redone.id, entry.id);
        assert_eq!(title(&editor), "B");
        assert_eq!(editor.undo_stack.len(), 1);
        assert_eq!(editor.redo_stack.len(), 0);
        assert_eq!(editor.selection.clip_id.as_deref(), Some("clip_title"));
    }

    #[test]
    fn new_edit_clears_redo_stack() {
        let mut editor = EditorState::new(sample_source());
        editor.select_clip(Some("clip_title".to_string()));
        editor
            .set_param("clip_title", "title", Value::String("B".to_string()))
            .unwrap();
        editor.undo().unwrap();
        assert_eq!(editor.redo_stack.len(), 1);

        editor
            .set_param("clip_title", "title", Value::String("C".to_string()))
            .unwrap();
        assert_eq!(editor.redo_stack.len(), 0);
        assert_eq!(title(&editor), "C");
    }

    #[test]
    fn undo_stack_is_fifo_capped_at_fifty() {
        let mut editor = EditorState::new(sample_source());
        editor.select_clip(Some("clip_title".to_string()));
        for idx in 1..=51 {
            editor
                .set_param("clip_title", "title", Value::String(format!("T{idx}")))
                .unwrap();
        }

        assert_eq!(editor.undo_stack.len(), 50);
        let oldest_retained = &editor.undo_stack[0];
        assert_eq!(
            oldest_retained
                .reverse
                .first()
                .and_then(|patch| patch.value.as_ref())
                .and_then(Value::as_str),
            Some("T1")
        );
        assert_eq!(title(&editor), "T51");
    }

    #[test]
    fn track_mute_and_solo_are_undoable() {
        let mut editor = EditorState::new(sample_source());

        let mute = editor.set_track_mute("tr_audio", true).unwrap();
        assert_eq!(mute.op_label, "mute track");
        assert_eq!(
            editor
                .source
                .pointer("/tracks/1/muted")
                .and_then(Value::as_bool),
            Some(true)
        );
        editor.undo().unwrap();
        assert!(editor.source.pointer("/tracks/1/muted").is_none());
        editor.redo().unwrap();
        assert_eq!(
            editor
                .source
                .pointer("/tracks/1/muted")
                .and_then(Value::as_bool),
            Some(true)
        );

        let solo = editor.set_track_solo("tr_scene", true).unwrap();
        assert_eq!(solo.op_label, "solo track");
        assert_eq!(
            editor
                .source
                .pointer("/tracks/0/solo")
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn split_clip_creates_right_half_and_selects_it() {
        let mut editor = EditorState::new(clip_edit_source());
        editor.select_clip(Some("clip_a".to_string()));

        let entry = editor.split_clip("clip_a", 2_000).unwrap();
        assert_eq!(entry.op_label, "split clip");

        let clips = editor
            .source
            .pointer("/tracks/0/clips")
            .and_then(Value::as_array)
            .unwrap();
        assert_eq!(clips.len(), 2);
        assert_eq!(clips[0].get("id").and_then(Value::as_str), Some("clip_a"));
        assert_eq!(clips[0].get("begin").and_then(Value::as_str), Some("0"));
        assert_eq!(clips[0].get("end").and_then(Value::as_str), Some("2000ms"));
        assert_eq!(
            clips[1].get("begin").and_then(Value::as_str),
            Some("2000ms")
        );
        assert_eq!(clips[1].get("end").and_then(Value::as_str), Some("5s"));

        let right_id = clips[1].get("id").and_then(Value::as_str).unwrap();
        assert_ne!(right_id, "clip_a");
        assert_eq!(editor.selection.clip_id.as_deref(), Some(right_id));
    }

    #[test]
    fn undo_split_restores_single_clip() {
        let mut editor = EditorState::new(clip_edit_source());
        editor.select_clip(Some("clip_a".to_string()));
        editor.split_clip("clip_a", 2_000).unwrap();

        editor.undo().unwrap();

        let clips = editor
            .source
            .pointer("/tracks/0/clips")
            .and_then(Value::as_array)
            .unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].get("id").and_then(Value::as_str), Some("clip_a"));
        assert_eq!(clips[0].get("begin").and_then(Value::as_str), Some("0"));
        assert_eq!(clips[0].get("end").and_then(Value::as_str), Some("5s"));
        assert_eq!(editor.selection.clip_id.as_deref(), Some("clip_a"));
    }

    #[test]
    fn ripple_delete_shifts_later_clips_and_reduces_duration() {
        let mut editor = EditorState::new(ripple_source());
        editor.select_clip(Some("clip_a".to_string()));

        let entry = editor.ripple_delete("clip_a").unwrap();
        assert_eq!(entry.op_label, "ripple delete clip");

        let clips = editor
            .source
            .pointer("/tracks/0/clips")
            .and_then(Value::as_array)
            .unwrap();
        assert_eq!(clips.len(), 1);
        assert_eq!(clips[0].get("id").and_then(Value::as_str), Some("clip_b"));
        assert_eq!(clips[0].get("begin").and_then(Value::as_str), Some("0ms"));
        assert_eq!(clips[0].get("end").and_then(Value::as_str), Some("2000ms"));
        assert_eq!(
            editor.source.get("duration").and_then(Value::as_str),
            Some("2000ms")
        );
        assert_eq!(editor.selection.clip_id.as_deref(), Some("clip_b"));
    }
}
