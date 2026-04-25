use std::fs;

use nf_project::{
    ComponentValidationReport, JsonStorage, SourceCompileResult, Storage,
    compile_composition_source, validate_composition_components,
};
use serde::Serialize;
use serde_json::Value;

use crate::commands::{VerifyArgs, print_json};
use crate::errors::NfError;

const DEFAULT_ASCII_WIDTH: u16 = 48;

pub fn run(args: VerifyArgs) -> Result<(), NfError> {
    let storage = JsonStorage::new(JsonStorage::default_root()?);
    storage.load_project(&args.project)?;
    if !storage.composition_exists(&args.project, &args.composition)? {
        return Err(NfError::ValidationFailed(format!(
            "composition not found: {}/{}",
            args.project, args.composition
        )));
    }

    let composition_json = storage.load_composition(&args.project, &args.composition)?;
    let component_report =
        validate_composition_components(&storage, &args.project, &composition_json)?;
    let compiled = compile_composition_source(&storage, &args.project, &composition_json)?;
    let report = build_report(&args, &composition_json, component_report, compiled);
    let value = serde_json::to_value(&report)?;

    if let Some(out) = &args.out {
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(out, serde_json::to_string_pretty(&value)?)?;
    }

    print_json(&value)?;
    if report.ok {
        Ok(())
    } else {
        Err(NfError::ValidationFailed(format!(
            "composition verification failed: {}/{}",
            args.project, args.composition
        )))
    }
}

fn build_report(
    args: &VerifyArgs,
    composition: &Value,
    component_report: ComponentValidationReport,
    compiled: SourceCompileResult,
) -> VerifyReport {
    let duration_ms = compiled
        .source
        .get("duration")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let viewport = compiled
        .source
        .get("viewport")
        .cloned()
        .unwrap_or(Value::Null);
    let tracks = collect_tracks(compiled.source.get("tracks").and_then(Value::as_array));
    let width = args
        .ascii_width
        .unwrap_or(DEFAULT_ASCII_WIDTH)
        .clamp(24, 96);
    let ascii = render_ascii_timeline(duration_ms, &tracks, usize::from(width));
    let screenshot_plan = screenshot_plan(
        &args.project,
        &args.composition,
        duration_ms,
        &args.screenshot_dir,
    );
    let anchor_guide = build_anchor_guide(composition);
    let intent = VerificationIntent {
        overlap_policy: "allowed-by-default".to_string(),
        error_policy: "only explicit contract violations become errors; designed multi-track overlap is normal".to_string(),
        ai_time_rule: "prefer named anchors and expressions such as `layers + 1s`; avoid raw numeric track start/end values".to_string(),
    };
    let mut checks = Vec::new();

    checks.push(VerifyCheck {
        id: "schema.compile".to_string(),
        level: CheckLevel::Ok,
        message: "composition compiled into export source".to_string(),
        track: None,
    });

    for warning in compiled.warnings {
        checks.push(VerifyCheck {
            id: "schema.warning".to_string(),
            level: CheckLevel::Warn,
            message: warning,
            track: None,
        });
    }

    if component_report.ok {
        checks.push(VerifyCheck {
            id: "component.abi".to_string(),
            level: CheckLevel::Ok,
            message: format!(
                "{} used component(s), {} available component(s)",
                component_report.components.len(),
                component_report.available_components.len()
            ),
            track: None,
        });
    } else {
        for error in &component_report.errors {
            checks.push(VerifyCheck {
                id: "component.abi".to_string(),
                level: CheckLevel::Error,
                message: error.clone(),
                track: None,
            });
        }
    }

    for warning in &component_report.warnings {
        checks.push(VerifyCheck {
            id: "component.warning".to_string(),
            level: CheckLevel::Warn,
            message: warning.clone(),
            track: None,
        });
    }

    checks.extend(lint_anchor_contract(&anchor_guide));
    checks.extend(lint_tracks(duration_ms, &tracks));

    let errors = checks
        .iter()
        .filter(|check| check.level == CheckLevel::Error)
        .count();
    let warnings = checks
        .iter()
        .filter(|check| check.level == CheckLevel::Warn)
        .count();

    VerifyReport {
        ok: errors == 0,
        project: args.project.clone(),
        composition: args.composition.clone(),
        summary: VerifySummary {
            duration_ms,
            tracks: tracks.len(),
            checks: checks.len(),
            errors,
            warnings,
        },
        viewport,
        intent,
        anchor_guide,
        component_validation: ComponentValidationSummary {
            ok: component_report.ok,
            used: component_report.components.len(),
            available: component_report.available_components.len(),
            errors: component_report.errors,
            warnings: component_report.warnings,
        },
        timeline: VerifyTimeline {
            width,
            ascii,
            tracks,
        },
        screenshot_plan,
        checks,
    }
}

fn collect_tracks(raw_tracks: Option<&Vec<Value>>) -> Vec<TimelineTrack> {
    let Some(raw_tracks) = raw_tracks else {
        return Vec::new();
    };

    raw_tracks
        .iter()
        .filter_map(|track| {
            let object = track.as_object()?;
            let id = object.get("id").and_then(Value::as_str)?.to_string();
            let kind = object
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            let clips = object
                .get("clips")
                .and_then(Value::as_array)
                .map(|items| collect_clips(items, &kind))
                .unwrap_or_default();
            let start_ms = clips.iter().map(|clip| clip.begin_ms).min().unwrap_or(0);
            let end_ms = clips.iter().map(|clip| clip.end_ms).max().unwrap_or(0);
            Some(TimelineTrack {
                id,
                kind,
                start_ms,
                end_ms,
                clips,
            })
        })
        .collect()
}

fn build_anchor_guide(composition: &Value) -> AnchorGuide {
    let anchors = composition
        .get("anchors")
        .and_then(Value::as_object)
        .map(|items| {
            items
                .iter()
                .map(|(name, value)| AnchorEntry {
                    name: name.clone(),
                    expr: anchor_expr(value),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let anchor_names = anchors
        .iter()
        .map(|anchor| anchor.name.as_str())
        .collect::<Vec<_>>();
    let tracks = composition
        .get("tracks")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|track| {
                    let object = track.as_object()?;
                    let id = object.get("id").and_then(Value::as_str)?.to_string();
                    let time = object.get("time").and_then(Value::as_object);
                    let start = time
                        .and_then(|value| value.get("start"))
                        .or_else(|| object.get("start"));
                    let end = time
                        .and_then(|value| value.get("end"))
                        .or_else(|| object.get("end"));
                    let start_expr = start.map(anchor_expr);
                    let end_expr = end.map(anchor_expr);
                    Some(TrackAnchorUsage {
                        track: id,
                        start: start_expr.clone(),
                        end: end_expr.clone(),
                        start_uses_anchor: start
                            .and_then(Value::as_str)
                            .is_some_and(|expr| expr_uses_anchor(expr, &anchor_names)),
                        end_uses_anchor: end
                            .and_then(Value::as_str)
                            .is_some_and(|expr| expr_uses_anchor(expr, &anchor_names)),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    AnchorGuide {
        rule: "Tracks should use named anchor expressions for start/end; anchors are the composition API for AI edits.".to_string(),
        examples: vec![
            "intro".to_string(),
            "layers + 1s".to_string(),
            "out".to_string(),
        ],
        anchors,
        tracks,
    }
}

fn anchor_expr(value: &Value) -> String {
    match value {
        Value::String(raw) => raw.clone(),
        Value::Number(number) => number.to_string(),
        other => other.to_string(),
    }
}

fn expr_uses_anchor(expr: &str, anchor_names: &[&str]) -> bool {
    let tokens = expr
        .split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.'))
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    tokens
        .iter()
        .any(|token| anchor_names.iter().any(|anchor| anchor == token))
}

fn collect_clips(raw_clips: &[Value], kind: &str) -> Vec<TimelineClip> {
    raw_clips
        .iter()
        .filter_map(|clip| {
            let object = clip.as_object()?;
            let id = object
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("clip")
                .to_string();
            let begin_ms = object.get("begin").and_then(Value::as_u64).unwrap_or(0);
            let end_ms = object
                .get("end")
                .and_then(Value::as_u64)
                .unwrap_or(begin_ms);
            let params = object.get("params").unwrap_or(&Value::Null);
            Some(TimelineClip {
                id,
                begin_ms,
                end_ms,
                text: clip_text(params, kind),
                layout: clip_layout(params, kind),
            })
        })
        .collect()
}

fn clip_text(params: &Value, kind: &str) -> Option<String> {
    let object = params.as_object()?;
    if kind == "subtitle" {
        let words = object
            .get("source")
            .and_then(|source| source.get("words"))
            .and_then(Value::as_array)?;
        let text = words
            .iter()
            .filter_map(|word| word.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" ");
        return (!text.is_empty()).then_some(text);
    }

    let nested = object.get("params").and_then(Value::as_object);
    ["title", "subtitle", "text", "label"]
        .iter()
        .find_map(|key| {
            nested
                .and_then(|value| value.get(*key))
                .or_else(|| object.get(*key))
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
}

fn clip_layout(params: &Value, kind: &str) -> Option<ClipLayout> {
    if kind == "audio" {
        return None;
    }
    if kind == "subtitle" {
        return Some(ClipLayout {
            x: 50.0,
            y: 88.0,
            w: 86.0,
            h: 10.0,
            source: "subtitle-default".to_string(),
        });
    }

    let object = params.as_object()?;
    let nested = object.get("params").and_then(Value::as_object);
    let style = object.get("style").and_then(Value::as_object);
    let x = number_from_maps("x", nested, style);
    let y = number_from_maps("y", nested, style);
    match (x, y) {
        (Some(x), Some(y)) => Some(ClipLayout {
            x,
            y,
            w: number_from_maps("w", nested, style)
                .or_else(|| number_from_maps("width", nested, style))
                .unwrap_or(34.0),
            h: number_from_maps("h", nested, style)
                .or_else(|| number_from_maps("height", nested, style))
                .unwrap_or(14.0),
            source: "params".to_string(),
        }),
        _ => None,
    }
}

fn number_from_maps(
    key: &str,
    primary: Option<&serde_json::Map<String, Value>>,
    secondary: Option<&serde_json::Map<String, Value>>,
) -> Option<f64> {
    primary
        .and_then(|map| map.get(key))
        .or_else(|| secondary.and_then(|map| map.get(key)))
        .and_then(Value::as_f64)
}

fn render_ascii_timeline(duration_ms: u64, tracks: &[TimelineTrack], width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push(format!("{:<20} {}", "time", tick_line(duration_ms, width)));
    for track in tracks {
        let mut cells = vec![' '; width];
        for clip in &track.clips {
            let start = cell_for_time(clip.begin_ms, duration_ms, width);
            let mut end = cell_for_time(clip.end_ms, duration_ms, width);
            if end <= start {
                end = (start + 1).min(width);
            }
            for cell in cells.iter_mut().take(end).skip(start) {
                *cell = if track.kind == "audio" { '~' } else { '#' };
            }
        }
        lines.push(format!(
            "{:<20} {}",
            short_label(&track.id, 20),
            cells.into_iter().collect::<String>()
        ));
    }
    lines
}

fn tick_line(duration_ms: u64, width: usize) -> String {
    let mut cells = vec!['-'; width];
    if width == 0 {
        return String::new();
    }
    for index in 0..=4 {
        let position = ((width.saturating_sub(1)) * index) / 4;
        cells[position] = '|';
    }
    let duration_s = duration_ms as f64 / 1000.0;
    format!(
        "{} 0s/{:.1}s/{:.1}s/{:.1}s/{:.1}s",
        cells.into_iter().collect::<String>(),
        duration_s * 0.25,
        duration_s * 0.5,
        duration_s * 0.75,
        duration_s
    )
}

fn cell_for_time(time_ms: u64, duration_ms: u64, width: usize) -> usize {
    if duration_ms == 0 || width == 0 {
        return 0;
    }
    let scaled = (time_ms.min(duration_ms) as f64 / duration_ms as f64) * width as f64;
    (scaled.floor() as usize).min(width)
}

fn short_label(value: &str, width: usize) -> String {
    if value.chars().count() <= width {
        return value.to_string();
    }
    value
        .chars()
        .take(width.saturating_sub(1))
        .collect::<String>()
        + "."
}

fn screenshot_plan(
    project: &str,
    composition: &str,
    duration_ms: u64,
    screenshot_dir: &Option<std::path::PathBuf>,
) -> Vec<ScreenshotPoint> {
    let dir = screenshot_dir
        .as_ref()
        .map(|value| value.display().to_string())
        .unwrap_or_else(|| format!("tmp/verify-{project}-{composition}"));
    let points = [
        ("start", 0.0),
        ("quarter", 0.25),
        ("middle", 0.5),
        ("three-quarter", 0.75),
        ("end", 0.96),
    ];
    points
        .iter()
        .map(|(label, ratio)| {
            let t_ms = (duration_ms as f64 * ratio).round() as u64;
            let seconds = t_ms as f64 / 1000.0;
            ScreenshotPoint {
                label: (*label).to_string(),
                t_ms,
                open_command: format!(
                    "target/debug/nf open --project {project} --composition {composition} --t {seconds:.2}"
                ),
                capture_command: format!(
                    "target/debug/nf capture --project {project} --episode {composition} --out {dir}/{label}.png"
                ),
            }
        })
        .collect()
}

fn lint_tracks(duration_ms: u64, tracks: &[TimelineTrack]) -> Vec<VerifyCheck> {
    let mut checks = Vec::new();
    if tracks.is_empty() {
        checks.push(VerifyCheck {
            id: "timeline.empty".to_string(),
            level: CheckLevel::Error,
            message: "composition has no tracks after compile".to_string(),
            track: None,
        });
        return checks;
    }

    let has_visual = tracks.iter().any(|track| track.kind != "audio");
    if !has_visual {
        checks.push(VerifyCheck {
            id: "timeline.visual".to_string(),
            level: CheckLevel::Error,
            message: "composition has no visual track".to_string(),
            track: None,
        });
    }

    for track in tracks {
        for clip in &track.clips {
            if clip.end_ms <= clip.begin_ms {
                checks.push(VerifyCheck {
                    id: "timeline.duration".to_string(),
                    level: CheckLevel::Error,
                    message: format!("clip '{}' end_ms must be greater than begin_ms", clip.id),
                    track: Some(track.id.clone()),
                });
            }
            if clip.end_ms > duration_ms {
                checks.push(VerifyCheck {
                    id: "timeline.bounds".to_string(),
                    level: CheckLevel::Error,
                    message: format!("clip '{}' exceeds composition duration", clip.id),
                    track: Some(track.id.clone()),
                });
            }
            if let Some(layout) = &clip.layout {
                checks.extend(lint_layout(track, clip, layout));
            } else if track.kind != "audio" {
                checks.push(VerifyCheck {
                    id: "layout.missing".to_string(),
                    level: CheckLevel::Warn,
                    message: format!("clip '{}' has no machine-readable x/y layout", clip.id),
                    track: Some(track.id.clone()),
                });
            }
            if let Some(text) = &clip.text {
                checks.extend(lint_text(track, clip, text));
            }
        }
    }

    checks
}

fn lint_anchor_contract(anchor_guide: &AnchorGuide) -> Vec<VerifyCheck> {
    let mut checks = Vec::new();
    if anchor_guide.anchors.is_empty() {
        checks.push(VerifyCheck {
            id: "anchor.missing".to_string(),
            level: CheckLevel::Warn,
            message: "composition has no named anchors; AI edits should use anchor expressions instead of raw time numbers".to_string(),
            track: None,
        });
    }
    for track in &anchor_guide.tracks {
        if track.start.is_none() || track.end.is_none() {
            checks.push(VerifyCheck {
                id: "anchor.track-time".to_string(),
                level: CheckLevel::Warn,
                message: format!(
                    "track '{}' should declare time.start and time.end with anchor expressions",
                    track.track
                ),
                track: Some(track.track.clone()),
            });
            continue;
        }
        if !track.start_uses_anchor || !track.end_uses_anchor {
            checks.push(VerifyCheck {
                id: "anchor.raw-time".to_string(),
                level: CheckLevel::Warn,
                message: format!(
                    "track '{}' uses raw or non-anchor time; prefer named anchors such as `intro`, `layers + 1s`, or `out`",
                    track.track
                ),
                track: Some(track.track.clone()),
            });
        }
    }
    if checks.is_empty() {
        checks.push(VerifyCheck {
            id: "anchor.contract".to_string(),
            level: CheckLevel::Ok,
            message: format!(
                "{} anchor(s), {} track time range(s) use the anchor contract",
                anchor_guide.anchors.len(),
                anchor_guide.tracks.len()
            ),
            track: None,
        });
    }
    checks
}

fn lint_layout(
    track: &TimelineTrack,
    clip: &TimelineClip,
    layout: &ClipLayout,
) -> Vec<VerifyCheck> {
    let mut checks = Vec::new();
    for (key, value) in [
        ("x", layout.x),
        ("y", layout.y),
        ("w", layout.w),
        ("h", layout.h),
    ] {
        if !(0.0..=100.0).contains(&value) {
            checks.push(VerifyCheck {
                id: "layout.bounds".to_string(),
                level: CheckLevel::Error,
                message: format!(
                    "clip '{}' layout {key}={} is outside 0..100 ({})",
                    clip.id, value, layout.source
                ),
                track: Some(track.id.clone()),
            });
        }
    }
    let left = layout.x - layout.w / 2.0;
    let right = layout.x + layout.w / 2.0;
    let top = layout.y - layout.h / 2.0;
    let bottom = layout.y + layout.h / 2.0;
    if left < 0.0 || right > 100.0 || top < 0.0 || bottom > 100.0 {
        checks.push(VerifyCheck {
            id: "layout.viewport".to_string(),
            level: CheckLevel::Warn,
            message: format!(
                "clip '{}' estimated bbox may exceed viewport: left={left:.1}, right={right:.1}, top={top:.1}, bottom={bottom:.1}",
                clip.id
            ),
            track: Some(track.id.clone()),
        });
    }
    checks
}

fn lint_text(track: &TimelineTrack, clip: &TimelineClip, text: &str) -> Vec<VerifyCheck> {
    let mut checks = Vec::new();
    let max_chars = if track.kind == "subtitle" { 96 } else { 84 };
    if text.chars().count() > max_chars {
        checks.push(VerifyCheck {
            id: "text.long".to_string(),
            level: CheckLevel::Warn,
            message: format!(
                "clip '{}' text is {} chars; verify wrapping in screenshots",
                clip.id,
                text.chars().count()
            ),
            track: Some(track.id.clone()),
        });
    }
    checks
}

#[derive(Debug, Serialize)]
struct VerifyReport {
    ok: bool,
    project: String,
    composition: String,
    summary: VerifySummary,
    viewport: Value,
    intent: VerificationIntent,
    anchor_guide: AnchorGuide,
    component_validation: ComponentValidationSummary,
    timeline: VerifyTimeline,
    screenshot_plan: Vec<ScreenshotPoint>,
    checks: Vec<VerifyCheck>,
}

#[derive(Debug, Serialize)]
struct VerificationIntent {
    overlap_policy: String,
    error_policy: String,
    ai_time_rule: String,
}

#[derive(Debug, Serialize)]
struct AnchorGuide {
    rule: String,
    examples: Vec<String>,
    anchors: Vec<AnchorEntry>,
    tracks: Vec<TrackAnchorUsage>,
}

#[derive(Debug, Serialize)]
struct AnchorEntry {
    name: String,
    expr: String,
}

#[derive(Debug, Serialize)]
struct TrackAnchorUsage {
    track: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    start: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end: Option<String>,
    start_uses_anchor: bool,
    end_uses_anchor: bool,
}

#[derive(Debug, Serialize)]
struct VerifySummary {
    duration_ms: u64,
    tracks: usize,
    checks: usize,
    errors: usize,
    warnings: usize,
}

#[derive(Debug, Serialize)]
struct ComponentValidationSummary {
    ok: bool,
    used: usize,
    available: usize,
    errors: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
struct VerifyTimeline {
    width: u16,
    ascii: Vec<String>,
    tracks: Vec<TimelineTrack>,
}

#[derive(Debug, Serialize)]
struct TimelineTrack {
    id: String,
    kind: String,
    start_ms: u64,
    end_ms: u64,
    clips: Vec<TimelineClip>,
}

#[derive(Debug, Serialize)]
struct TimelineClip {
    id: String,
    begin_ms: u64,
    end_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    layout: Option<ClipLayout>,
}

#[derive(Debug, Serialize)]
struct ClipLayout {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    source: String,
}

#[derive(Debug, Serialize)]
struct ScreenshotPoint {
    label: String,
    t_ms: u64,
    open_command: String,
    capture_command: String,
}

#[derive(Debug, Serialize)]
struct VerifyCheck {
    id: String,
    level: CheckLevel,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    track: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum CheckLevel {
    Ok,
    Warn,
    Error,
}
