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
use poster_import_types::{Cue, CueWord, ImportPlan, Manifest, PosterFile, SlideImport, Timeline};
#[cfg(test)]
use poster_import_types::{TimelineSegment, TimelineWord};

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
    let mut slides = Vec::with_capacity(manifest.entries.len());
    let mut anchors = serde_json::Map::new();
    let mut tracks = Vec::with_capacity(manifest.entries.len() * 2 + 2);
    let mut cues = Vec::new();
    let mut cumulative_ms = 0_u64;

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
        let duration_ms = duration_ms(&timeline)?;
        cues.extend(extract_cues_fallback(&timeline, cumulative_ms)?);
        let slide_anchor = format!("slide-{slide}");
        let audio_end_anchor = format!("audio-{slide}-end");
        let end_anchor = if slide == manifest.entries.len() {
            "out".to_string()
        } else {
            format!("slide-{}", slide + 1)
        };
        let audio_name = format!("slide-{slide:02}.mp3");
        let poster_name = format!("slide-{slide:02}.png");
        let image_dst = image_root.join(&poster_name);
        let audio_dst = audio_root.join(&audio_name);

        anchors.insert(slide_anchor.clone(), json!(format!("{cumulative_ms}ms")));
        anchors.insert(
            audio_end_anchor.clone(),
            json!(format!("{}ms", cumulative_ms + duration_ms)),
        );
        tracks.push(json!({
            "id": format!("img-{slide}"),
            "kind": "component",
            "component": IMAGE_COMPONENT,
            "z": 10,
            "time": { "start": slide_anchor, "end": end_anchor },
            "params": { "src": file_url(&runtime_image_root.join(&poster_name))? }
        }));
        tracks.push(json!({
            "id": format!("audio-{slide}"),
            "kind": "audio",
            "time": { "start": format!("slide-{slide}"), "end": audio_end_anchor },
            "src": format!("audio/{audio_name}"),
            "volume": 1
        }));

        slides.push(SlideImport {
            poster_src: poster.path.clone(),
            poster_dst: image_dst,
            audio_src,
            audio_dst,
        });
        cumulative_ms += duration_ms;
        if slide < manifest.entries.len() {
            cumulative_ms += gap_ms;
        }
    }

    anchors.insert("out".to_string(), json!(format!("{cumulative_ms}ms")));
    let cue_count = cues.len();
    tracks.push(json!({
        "id": "progress-bar",
        "kind": "component",
        "component": PROGRESS_COMPONENT,
        "z": 90,
        "time": { "start": "slide-1", "end": "out" },
        "params": {}
    }));
    tracks.push(json!({
        "id": "cue-bar",
        "kind": "component",
        "component": CUE_COMPONENT,
        "z": 85,
        "time": { "start": "slide-1", "end": "out" },
        "params": { "cues": cues }
    }));
    // v3 clip-first: wrap all tracks into a single clip · move per-track {time, params, src}
    // into each track's items[0]. nf-shell preview now requires composition.clips[] (post v0.21
    // codex merge); v2 flat composition.tracks[] silently falls back to the idle hero.
    let v3_tracks: Vec<Value> = tracks
        .into_iter()
        .map(|track| {
            let mut t = track.as_object().cloned().unwrap_or_default();
            let id = t.remove("id").unwrap_or_else(|| json!(""));
            let kind = t.remove("kind").unwrap_or_else(|| json!("component"));
            let z = t.remove("z").unwrap_or_else(|| json!(0));
            let time = t.remove("time").unwrap_or_else(|| json!({}));
            let params = t.remove("params").unwrap_or_else(|| json!({}));
            let src = t.remove("src");
            let component = t.remove("component");
            let volume = t.remove("volume");
            let style = t.remove("style").unwrap_or_else(|| json!({}));

            let mut item = serde_json::Map::new();
            item.insert("id".into(), id.clone());
            item.insert("time".into(), time);
            // For audio tracks v3 clip-first compile reads item.src (top-level), not item.params.src.
            if let Some(s) = src {
                item.insert("src".into(), s);
            }
            if let Some(v) = volume {
                item.insert("volume".into(), v);
            }
            item.insert("params".into(), params);

            let mut out = serde_json::Map::new();
            out.insert("id".into(), id);
            out.insert("kind".into(), kind);
            out.insert("z".into(), z);
            if let Some(c) = component {
                out.insert("component".into(), c);
            }
            out.insert("style".into(), style);
            out.insert("items".into(), json!([Value::Object(item)]));
            Value::Object(out)
        })
        .collect();

    let composition = json!({
        "schema": "nextframe.composition.v3",
        "id": COMPOSITION_ID,
        "name": project_slug.replace('-', " "),
        "viewport": { "w": 1920, "h": 1080, "ratio": "16:9" },
        "theme": "default",
        "export": { "resolution": "1080p" },
        "clips": [{
            "id": "main",
            "name": project_slug.replace('-', " "),
            "duration": format!("{cumulative_ms}ms"),
            "anchors": Value::Object(anchors),
            "tracks": v3_tracks
        }]
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
    // TODO when nf-cue CLI lands · swap fallback for: spawn nf cue --timeline=... and parse stdout cues[]
    let mut cues = Vec::with_capacity(timeline.segments.len());
    for segment in &timeline.segments {
        let text = segment.text.trim();
        if text.is_empty() {
            return Err(validation("timeline segment text must not be empty"));
        }
        if segment.end_ms <= segment.start_ms {
            return Err(validation(format!(
                "timeline segment '{}' end_ms must be greater than start_ms",
                text
            )));
        }
        let mut words = Vec::with_capacity(segment.words.len());
        for word in &segment.words {
            let word_text = word.word.trim();
            if word_text.is_empty() {
                return Err(validation("timeline word must not be empty"));
            }
            if word.end_ms <= word.start_ms {
                return Err(validation(format!(
                    "timeline word '{}' end_ms must be greater than start_ms",
                    word_text
                )));
            }
            words.push(CueWord {
                text: word_text.to_string(),
                start_ms: cumulative_ms + word.start_ms,
                end_ms: cumulative_ms + word.end_ms,
            });
        }
        cues.push(Cue {
            text: text.to_string(),
            start_ms: cumulative_ms + segment.start_ms,
            end_ms: cumulative_ms + segment.end_ms,
            words,
        });
    }
    if cues.is_empty() {
        return Err(validation("timeline must contain at least one segment"));
    }
    Ok(cues)
}

fn validation(detail: impl Into<String>) -> NfError {
    NfError::ValidationFailed(detail.into())
}
