use std::fs;
use std::path::{Path, PathBuf};

use nf_project::{JsonStorage, validate_slug};
use serde_json::{Value, json};

use crate::commands::{PosterImportArgs, print_json};
use crate::errors::NfError;

#[path = "poster_import_io.rs"]
mod poster_import_io;
#[cfg(test)]
#[path = "poster_import_tests.rs"]
mod poster_import_tests;
#[path = "poster_import_types.rs"]
mod poster_import_types;

use poster_import_io::{copy_file, file_url, write_json};
use poster_import_types::{
    Cue, CueWord, ImportPlan, Manifest, PosterFile, SlideImport, Timeline, TimelineWord,
};
#[cfg(test)]
use poster_import_types::TimelineSegment;

const COMPOSITION_ID: &str = "main";
const IMAGE_COMPONENT: &str = "html.image-slide";
const PROGRESS_COMPONENT: &str = "html.progress-bar";
const CUE_COMPONENT: &str = "html.cue-bar";

pub fn run(args: PosterImportArgs) -> Result<(), NfError> {
    let runtime_root = JsonStorage::default_root()?;
    run_with_roots(args, Path::new("examples"), &runtime_root)
}

fn run_with_roots(
    args: PosterImportArgs,
    examples_root: &Path,
    runtime_root: &Path,
) -> Result<(), NfError> {
    validate_slug(&args.out)?;
    let import = build_import(
        &args.src_dir,
        &args.out,
        examples_root,
        runtime_root,
        args.gap_ms,
    )?;
    write_project_outputs(&args.src_dir, examples_root, &args.out, &import)?;
    sync_runtime_project(examples_root, runtime_root, &args.out, &import)?;

    print_json(&json!({
        "composition_path": import.composition_path.to_string_lossy(),
        "slides": import.slides.len(),
        "duration_ms": import.duration_ms,
        "tracks": import.tracks,
        "cues": import.cues,
    }))
}

fn build_import(
    src_dir: &Path,
    project_slug: &str,
    examples_root: &Path,
    runtime_root: &Path,
    gap_ms: u64,
) -> Result<ImportPlan, NfError> {
    if !src_dir.is_dir() {
        return Err(validation(format!(
            "source directory not found: {}",
            src_dir.display()
        )));
    }

    let manifest = read_manifest(&src_dir.join("audio").join("manifest.json"))?;
    let posters = poster_files(&src_dir.join("posters"))?;
    if manifest.entries.is_empty() {
        return Err(validation("audio manifest entries must not be empty"));
    }
    if posters.len() != manifest.entries.len() {
        return Err(validation(format!(
            "poster count {} does not match manifest entries {}",
            posters.len(),
            manifest.entries.len()
        )));
    }

    let project_dir = examples_root.join(project_slug);
    let image_root = project_dir.join("components").join("posters");
    let audio_root = project_dir.join("audio");
    let runtime_image_root = runtime_root
        .join(project_slug)
        .join("components")
        .join("posters");
    // First pass · compute total composition duration so progress-bar items can carry
    // composition_duration_ms / clip_offset_ms (clip-local components otherwise see only
    // their own clip span).
    let mut clip_durations: Vec<u64> = Vec::with_capacity(manifest.entries.len());
    for (idx, entry) in manifest.entries.iter().enumerate() {
        let timeline_src = timeline_path(src_dir, &entry.file)?;
        let timeline = read_timeline(&timeline_src)?;
        let audio_dur = duration_ms(&timeline)?;
        let clip_dur = if idx + 1 == manifest.entries.len() {
            audio_dur
        } else {
            audio_dur + gap_ms
        };
        clip_durations.push(clip_dur);
    }
    let composition_total_ms: u64 = clip_durations.iter().sum();

    let mut slides = Vec::with_capacity(manifest.entries.len());
    let mut clips: Vec<Value> = Vec::with_capacity(manifest.entries.len());
    let mut total_cues = 0_usize;
    let mut total_duration_ms = 0_u64;

    for (index, entry) in manifest.entries.iter().enumerate() {
        let slide = index + 1;
        if entry.id != slide {
            return Err(validation(format!(
                "manifest entry id {} must be sequential at position {}",
                entry.id, slide
            )));
        }
        let Some(poster) = posters.iter().find(|item| item.number == entry.id) else {
            return Err(validation(format!(
                "poster for slide {} not found",
                entry.id
            )));
        };

        let audio_src = src_dir.join(&entry.file);
        let timeline_src = timeline_path(src_dir, &entry.file)?;
        let timeline = read_timeline(&timeline_src)?;
        let audio_dur = duration_ms(&timeline)?;
        let local_cues = extract_cues_fallback(&timeline, 0)?;
        total_cues += local_cues.len();
        let local_cues_value = serde_json::to_value(&local_cues).map_err(|e| {
            NfError::ValidationFailed(format!("serialize cues: {e}"))
        })?;
        let clip_dur = if slide == manifest.entries.len() {
            audio_dur
        } else {
            audio_dur + gap_ms
        };

        let audio_name = format!("slide-{slide:02}.mp3");
        let poster_name = format!("slide-{slide:02}.png");
        let image_dst = image_root.join(&poster_name);
        let audio_dst = audio_root.join(&audio_name);

        let clip_anchors = json!({
            "in": "0ms",
            "audio-end": format!("{audio_dur}ms"),
            "out": format!("{clip_dur}ms"),
        });

        let clip_tracks = vec![
            json!({
                "id": "image",
                "kind": "component",
                "component": IMAGE_COMPONENT,
                "z": 10,
                "style": {},
                "items": [{
                    "id": "frame",
                    "time": { "start": "in", "end": "out" },
                    "params": { "src": file_url(&runtime_image_root.join(&poster_name))? }
                }]
            }),
            json!({
                "id": "audio",
                "kind": "audio",
                "z": 1,
                "style": {},
                "items": [{
                    "id": "voice",
                    // Audio spans the full clip · gap silence is expressed via anchors
                    // (audio-end < out) not by truncating the audio track. The mp3 file
                    // is only audio-end ms long, so the runtime naturally stops at end-of-file
                    // and the remaining clip time is silence — no forced pause/cutoff.
                    "time": { "start": "in", "end": "out" },
                    "src": format!("audio/{audio_name}"),
                    "volume": 1,
                    "params": {}
                }]
            }),
            json!({
                "id": "cue-bar",
                "kind": "component",
                "component": CUE_COMPONENT,
                "z": 85,
                "style": {},
                "items": [{
                    "id": "cues",
                    "time": { "start": "in", "end": "audio-end" },
                    "params": { "cues": local_cues_value }
                }]
            }),
            json!({
                "id": "progress-bar",
                "kind": "component",
                "component": PROGRESS_COMPONENT,
                "z": 90,
                "style": {},
                "items": [{
                    "id": "bar",
                    "time": { "start": "in", "end": "out" },
                    "params": {
                        "composition_duration_ms": composition_total_ms,
                        "clip_offset_ms": total_duration_ms
                    }
                }]
            }),
        ];

        clips.push(json!({
            "id": format!("slide-{slide}"),
            "name": format!("slide {slide}"),
            "duration": format!("{clip_dur}ms"),
            "anchors": clip_anchors,
            "tracks": clip_tracks,
        }));

        slides.push(SlideImport {
            poster_src: poster.path.clone(),
            poster_dst: image_dst,
            audio_src,
            audio_dst,
        });
        total_duration_ms += clip_dur;
    }

    let cue_count = total_cues;
    let cumulative_ms = total_duration_ms;

    let composition = json!({
        "schema": "nextframe.composition.v3",
        "id": COMPOSITION_ID,
        "name": project_slug.replace('-', " "),
        "viewport": { "w": 1920, "h": 1080, "ratio": "16:9" },
        "theme": "default",
        "export": { "resolution": "1080p" },
        "clips": clips,
    });

    Ok(ImportPlan {
        composition_path: project_dir.join("compositions").join("main.json"),
        composition,
        slides,
        duration_ms: cumulative_ms,
        tracks: manifest.entries.len() * 2 + 2,
        cues: cue_count,
    })
}

fn write_project_outputs(
    src_dir: &Path,
    examples_root: &Path,
    project_slug: &str,
    import: &ImportPlan,
) -> Result<(), NfError> {
    let project_dir = examples_root.join(project_slug);
    fs::create_dir_all(project_dir.join("components").join("posters"))?;
    fs::create_dir_all(project_dir.join("audio"))?;
    fs::create_dir_all(project_dir.join("compositions"))?;
    ensure_project_file(&project_dir, project_slug)?;

    ensure_components_exist(&project_dir)?;

    for slide in &import.slides {
        copy_file(&slide.poster_src, &slide.poster_dst)?;
        copy_file(&slide.audio_src, &slide.audio_dst)?;
    }

    write_json(&import.composition_path, &import.composition)?;

    if !src_dir.join("audio").join("manifest.json").is_file() {
        return Err(validation(format!(
            "audio manifest not found: {}",
            src_dir.join("audio").join("manifest.json").display()
        )));
    }
    Ok(())
}

fn sync_runtime_project(
    examples_root: &Path,
    runtime_root: &Path,
    project_slug: &str,
    import: &ImportPlan,
) -> Result<(), NfError> {
    let example_project = examples_root.join(project_slug);
    let runtime_project = runtime_root.join(project_slug);
    fs::create_dir_all(runtime_project.join("components").join("posters"))?;
    fs::create_dir_all(runtime_project.join("audio"))?;
    fs::create_dir_all(runtime_project.join("compositions"))?;

    write_runtime_project_file(&runtime_project, &example_project, project_slug)?;
    copy_components(&example_project, &runtime_project)?;
    for slide in &import.slides {
        let poster_name = slide
            .poster_dst
            .file_name()
            .ok_or_else(|| validation("poster destination has no filename"))?;
        let audio_name = slide
            .audio_dst
            .file_name()
            .ok_or_else(|| validation("audio destination has no filename"))?;
        copy_file(
            &slide.poster_dst,
            &runtime_project
                .join("components")
                .join("posters")
                .join(poster_name),
        )?;
        copy_file(
            &slide.audio_dst,
            &runtime_project.join("audio").join(audio_name),
        )?;
    }
    write_json(
        &runtime_project.join("compositions").join("main.json"),
        &import.composition,
    )
}

fn ensure_project_file(project_dir: &Path, project_slug: &str) -> Result<(), NfError> {
    let path = project_dir.join("project.json");
    if path.is_file() {
        return Ok(());
    }
    write_json(
        &path,
        &json!({
            "slug": project_slug,
            "name": project_slug.replace('-', " "),
            "created": "2026-04-26T00:00:00Z",
            "modified": "2026-04-26T00:00:00Z"
        }),
    )
}

fn write_runtime_project_file(
    runtime_project: &Path,
    example_project: &Path,
    project_slug: &str,
) -> Result<(), NfError> {
    let name = fs::read_to_string(example_project.join("project.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|value| {
            value
                .get("name")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .unwrap_or_else(|| project_slug.replace('-', " "));
    write_json(
        &runtime_project.join("project.json"),
        &json!({
            "slug": project_slug,
            "name": name,
            "created": "2026-04-26T00:00:00Z",
            "modified": "2026-04-26T00:00:00Z"
        }),
    )
}

fn required_components() -> [&'static str; 3] {
    [IMAGE_COMPONENT, PROGRESS_COMPONENT, CUE_COMPONENT]
}

fn ensure_components_exist(project_dir: &Path) -> Result<(), NfError> {
    for component in required_components() {
        let component_path = project_dir
            .join("components")
            .join(format!("{component}.js"));
        if !component_path.is_file() {
            return Err(validation(format!(
                "component source not found: {}",
                component_path.display()
            )));
        }
    }
    Ok(())
}

fn copy_components(example_project: &Path, runtime_project: &Path) -> Result<(), NfError> {
    for component in required_components() {
        copy_file(
            &example_project
                .join("components")
                .join(format!("{component}.js")),
            &runtime_project
                .join("components")
                .join(format!("{component}.js")),
        )?;
    }
    Ok(())
}

fn read_manifest(path: &Path) -> Result<Manifest, NfError> {
    let bytes = fs::read(path)
        .map_err(|err| NfError::StorageFailed(format!("read failed: {}: {err}", path.display())))?;
    serde_json::from_slice(&bytes).map_err(|err| {
        validation(format!(
            "cannot parse audio manifest {}: {err}",
            path.display()
        ))
    })
}

fn read_timeline(path: &Path) -> Result<Timeline, NfError> {
    let bytes = fs::read(path)
        .map_err(|err| NfError::StorageFailed(format!("read failed: {}: {err}", path.display())))?;
    serde_json::from_slice(&bytes)
        .map_err(|err| validation(format!("cannot parse timeline {}: {err}", path.display())))
}

fn poster_files(path: &Path) -> Result<Vec<PosterFile>, NfError> {
    if !path.is_dir() {
        return Err(validation(format!(
            "posters directory not found: {}",
            path.display()
        )));
    }
    let mut posters = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let item_path = entry.path();
        if !item_path.is_file() || item_path.extension().and_then(|ext| ext.to_str()) != Some("png")
        {
            continue;
        }
        let name = item_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                validation(format!("invalid poster filename: {}", item_path.display()))
            })?;
        let Some(prefix) = name.split_once('-').map(|(prefix, _)| prefix) else {
            return Err(validation(format!(
                "poster filename must be <number>-<slug>.png: {name}"
            )));
        };
        let number = prefix
            .parse::<usize>()
            .map_err(|_| validation(format!("poster filename has invalid number: {name}")))?;
        posters.push(PosterFile {
            number,
            path: item_path,
        });
    }
    posters.sort_by_key(|item| item.number);
    Ok(posters)
}

fn timeline_path(src_dir: &Path, audio_file: &str) -> Result<PathBuf, NfError> {
    let audio_path = Path::new(audio_file);
    let stem = audio_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| validation(format!("audio file has no stem: {audio_file}")))?;
    let parent = audio_path.parent().unwrap_or_else(|| Path::new("audio"));
    Ok(src_dir.join(parent).join(format!("{stem}.timeline.json")))
}

fn duration_ms(timeline: &Timeline) -> Result<u64, NfError> {
    let duration = timeline
        .segments
        .iter()
        .map(|segment| segment.end_ms)
        .max()
        .unwrap_or(0);
    if duration == 0 {
        return Err(validation("timeline duration must be greater than 0"));
    }
    Ok(duration)
}

fn extract_cues_fallback(timeline: &Timeline, cumulative_ms: u64) -> Result<Vec<Cue>, NfError> {
    // Rule-based cue splitter · keeps each cue ≤ MAX_CHARS visible chars and breaks on the
    // longest natural pause inside a segment. LLM-driven `nf cue` is the proper path · this
    // fallback exists so playback is sensible even when the LLM endpoint is slow/down.
    const MIN_CHARS: usize = 5; // never break before this · avoids 'v0' / '21' fragments
    const SOFT_CHARS: usize = 12; // start looking for a pause once we hit this
    const MAX_CHARS: usize = 18; // hard cap · break regardless of pause
    const SOFT_PAUSE_MS: u64 = 80;
    const STRONG_PAUSE_MS: u64 = 250;

    // Flatten segments · vox splits on '.' so segment boundaries don't reflect natural cue
    // breaks. Treat the whole timeline as one word stream and rely on inter-word pauses
    // (already preserved across segments since words[].end_ms / start_ms are absolute).
    let flat_words: Vec<&TimelineWord> = timeline
        .segments
        .iter()
        .flat_map(|seg| seg.words.iter())
        .filter(|w| !w.word.trim().is_empty())
        .collect();

    let mut cues: Vec<Cue> = Vec::new();
    let mut buf_words: Vec<CueWord> = Vec::new();
    let mut buf_chars: usize = 0;

    for (i, word) in flat_words.iter().enumerate() {
        let word_text = word.word.trim();
        if word.end_ms <= word.start_ms {
            return Err(validation(format!(
                "timeline word '{}' end_ms must be greater than start_ms",
                word_text
            )));
        }
        buf_words.push(CueWord {
            text: word_text.to_string(),
            start_ms: cumulative_ms + word.start_ms,
            end_ms: cumulative_ms + word.end_ms,
        });
        buf_chars += visible_char_count(word_text);

        let next_pause = flat_words
            .get(i + 1)
            .map(|nw| nw.start_ms.saturating_sub(word.end_ms))
            .unwrap_or(u64::MAX);
        let is_last = i + 1 == flat_words.len();

        let should_break = is_last
            || buf_chars >= MAX_CHARS
            || (buf_chars >= MIN_CHARS && {
                (buf_chars >= SOFT_CHARS && next_pause >= SOFT_PAUSE_MS)
                    || next_pause >= STRONG_PAUSE_MS
            });

        if should_break {
            cues.push(finalize_cue(buf_words.drain(..).collect()));
            buf_chars = 0;
        }
    }
    if cues.is_empty() {
        return Err(validation("timeline must contain at least one cue-eligible word"));
    }
    Ok(cues)
}

fn finalize_cue(words: Vec<CueWord>) -> Cue {
    let text = words
        .iter()
        .map(|w| w.text.as_str())
        .collect::<Vec<_>>()
        .join("");
    let start_ms = words.first().map(|w| w.start_ms).unwrap_or(0);
    let end_ms = words.last().map(|w| w.end_ms).unwrap_or(start_ms);
    Cue {
        text,
        start_ms,
        end_ms,
        words,
    }
}

fn visible_char_count(s: &str) -> usize {
    // CJK chars count as 1; ascii letters/digits collapse so "AI" = 1 not 2.
    let mut count = 0usize;
    let mut in_ascii_run = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            if !in_ascii_run {
                count += 1;
                in_ascii_run = true;
            }
        } else {
            in_ascii_run = false;
            if !ch.is_whitespace() && !ch.is_ascii_punctuation() {
                count += 1;
            }
        }
    }
    count
}

fn validation(detail: impl Into<String>) -> NfError {
    NfError::ValidationFailed(detail.into())
}
