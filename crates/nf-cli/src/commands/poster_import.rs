use std::fs;
use std::path::{Path, PathBuf};

use nf_project::{JsonStorage, validate_slug};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::commands::{PosterImportArgs, print_json};
use crate::errors::NfError;

const COMPOSITION_ID: &str = "main";
const IMAGE_COMPONENT: &str = "html.image-slide";

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
    let import = build_import(&args.src_dir, &args.out, examples_root)?;
    write_project_outputs(&args.src_dir, examples_root, &args.out, &import)?;
    sync_runtime_project(examples_root, runtime_root, &args.out, &import)?;

    print_json(&json!({
        "composition_path": import.composition_path.to_string_lossy(),
        "slides": import.slides.len(),
        "duration_ms": import.duration_ms,
        "tracks": import.tracks,
    }))
}

fn build_import(
    src_dir: &Path,
    project_slug: &str,
    examples_root: &Path,
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
    let mut slides = Vec::with_capacity(manifest.entries.len());
    let mut anchors = serde_json::Map::new();
    let mut tracks = Vec::with_capacity(manifest.entries.len() * 3);
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
        let words = subtitle_words(&timeline)?;
        let slide_anchor = format!("slide-{slide}");
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
        tracks.push(json!({
            "id": format!("img-{slide}"),
            "kind": "component",
            "component": IMAGE_COMPONENT,
            "z": 10,
            "time": { "start": slide_anchor, "end": end_anchor },
            "params": { "src": file_url(&image_dst)? }
        }));
        tracks.push(json!({
            "id": format!("audio-{slide}"),
            "kind": "audio",
            "time": { "start": format!("slide-{slide}"), "end": if slide == manifest.entries.len() { "out".to_string() } else { format!("slide-{}", slide + 1) } },
            "src": format!("audio/{audio_name}"),
            "volume": 1
        }));
        tracks.push(json!({
            "id": format!("sub-{slide}"),
            "kind": "subtitle",
            "z": 80,
            "time": { "start": format!("slide-{slide}"), "end": if slide == manifest.entries.len() { "out".to_string() } else { format!("slide-{}", slide + 1) } },
            "style": {
                "active_color": "#ffca66",
                "color": "#fff",
                "size_px": 42,
                "position": "bottom",
                "padding": 68
            },
            "params": { "words": words }
        }));

        slides.push(SlideImport {
            poster_src: poster.path.clone(),
            poster_dst: image_dst,
            audio_src,
            audio_dst,
        });
        cumulative_ms += duration_ms;
    }

    anchors.insert("out".to_string(), json!(format!("{cumulative_ms}ms")));
    let composition = json!({
        "schema": "nextframe.composition.v2",
        "id": COMPOSITION_ID,
        "name": project_slug.replace('-', " "),
        "duration": format!("{cumulative_ms}ms"),
        "viewport": { "w": 1920, "h": 1080, "ratio": "16:9" },
        "theme": "default",
        "export": { "resolution": "1080p" },
        "anchors": Value::Object(anchors),
        "tracks": tracks
    });

    Ok(ImportPlan {
        composition_path: project_dir.join("compositions").join("main.json"),
        composition,
        slides,
        duration_ms: cumulative_ms,
        tracks: manifest.entries.len() * 3,
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

    let component_path = project_dir
        .join("components")
        .join(format!("{IMAGE_COMPONENT}.js"));
    if !component_path.is_file() {
        return Err(validation(format!(
            "component source not found: {}",
            component_path.display()
        )));
    }

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
    copy_file(
        &example_project
            .join("components")
            .join(format!("{IMAGE_COMPONENT}.js")),
        &runtime_project
            .join("components")
            .join(format!("{IMAGE_COMPONENT}.js")),
    )?;
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

fn subtitle_words(timeline: &Timeline) -> Result<Vec<Value>, NfError> {
    let mut words = Vec::new();
    for segment in &timeline.segments {
        for word in &segment.words {
            if word.word.trim().is_empty() {
                return Err(validation("timeline word must not be empty"));
            }
            if word.end_ms <= word.start_ms {
                return Err(validation(format!(
                    "timeline word '{}' end_ms must be greater than start_ms",
                    word.word
                )));
            }
            words.push(json!({
                "text": word.word,
                "start_ms": word.start_ms,
                "end_ms": word.end_ms
            }));
        }
    }
    if words.is_empty() {
        return Err(validation("timeline must contain at least one word"));
    }
    Ok(words)
}

fn write_json(path: &Path, value: &Value) -> Result<(), NfError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)
        .map_err(|err| NfError::StorageFailed(format!("write failed: {}: {err}", path.display())))
}

fn copy_file(from: &Path, to: &Path) -> Result<(), NfError> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(from, to).map(|_| ()).map_err(|err| {
        NfError::StorageFailed(format!(
            "copy failed: {} -> {}: {err}",
            from.display(),
            to.display()
        ))
    })
}

fn file_url(path: &Path) -> Result<String, NfError> {
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|err| NfError::StorageFailed(format!("current directory failed: {err}")))?
            .join(path)
    };
    let mut encoded = String::new();
    for byte in path.to_string_lossy().as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(char::from(*byte))
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    Ok(format!("file://{encoded}"))
}

fn validation(detail: impl Into<String>) -> NfError {
    NfError::ValidationFailed(detail.into())
}

#[derive(Debug)]
struct ImportPlan {
    composition_path: PathBuf,
    composition: Value,
    slides: Vec<SlideImport>,
    duration_ms: u64,
    tracks: usize,
}

#[derive(Debug)]
struct SlideImport {
    poster_src: PathBuf,
    poster_dst: PathBuf,
    audio_src: PathBuf,
    audio_dst: PathBuf,
}

#[derive(Debug)]
struct PosterFile {
    number: usize,
    path: PathBuf,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Deserialize)]
struct ManifestEntry {
    id: usize,
    file: String,
}

#[derive(Debug, Deserialize)]
struct Timeline {
    segments: Vec<TimelineSegment>,
}

#[derive(Debug, Deserialize)]
struct TimelineSegment {
    end_ms: u64,
    #[serde(default)]
    words: Vec<TimelineWord>,
}

#[derive(Debug, Deserialize)]
struct TimelineWord {
    word: String,
    start_ms: u64,
    end_ms: u64,
}

#[cfg(test)]
mod tests {
    #![allow(clippy::expect_used)]
    #![allow(clippy::unwrap_used)]

    use super::*;

    #[test]
    fn builds_composition_and_copies_standardized_assets() {
        let tmp = temp_dir("ok");
        let src = tmp.join("src");
        let examples = tmp.join("examples");
        let runtime = tmp.join("runtime");
        sample_project(&examples, "demo-video");
        sample_import_source(&src, 2);

        run_with_roots(
            PosterImportArgs {
                src_dir: src,
                out: "demo-video".to_string(),
            },
            &examples,
            &runtime,
        )
        .unwrap();

        let composition_path = examples
            .join("demo-video")
            .join("compositions")
            .join("main.json");
        let composition: Value =
            serde_json::from_str(&fs::read_to_string(composition_path).unwrap()).unwrap();
        assert_eq!(composition["duration"], "3000ms");
        assert_eq!(composition["anchors"]["slide-2"], "1000ms");
        assert_eq!(composition["tracks"].as_array().unwrap().len(), 6);
        assert_eq!(
            composition["tracks"][2]["params"]["words"][0],
            json!({"text":"hello","start_ms":0,"end_ms":400})
        );
        assert!(
            examples
                .join("demo-video/components/posters/slide-02.png")
                .is_file()
        );
        assert!(runtime.join("demo-video/audio/slide-01.mp3").is_file());

        let _ = fs::remove_dir_all(tmp);
    }

    #[test]
    fn duration_uses_max_segment_end_ms() {
        let timeline = Timeline {
            segments: vec![
                TimelineSegment {
                    end_ms: 500,
                    words: vec![word("a", 0, 100)],
                },
                TimelineSegment {
                    end_ms: 1250,
                    words: vec![word("b", 100, 200)],
                },
            ],
        };

        assert_eq!(duration_ms(&timeline).unwrap(), 1250);
    }

    #[test]
    fn poster_files_sort_by_numeric_prefix() {
        let tmp = temp_dir("posters");
        let dir = tmp.join("posters");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("10-ten.png"), b"png").unwrap();
        fs::write(dir.join("2-two.png"), b"png").unwrap();
        fs::write(dir.join("1-one.png"), b"png").unwrap();

        let posters = poster_files(&dir).unwrap();
        let numbers: Vec<_> = posters.iter().map(|item| item.number).collect();
        assert_eq!(numbers, vec![1, 2, 10]);

        let _ = fs::remove_dir_all(tmp);
    }

    #[test]
    fn rejects_timeline_word_without_text_field() {
        let tmp = temp_dir("bad-word");
        fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join("timeline.json");
        fs::write(
            &path,
            r#"{"segments":[{"end_ms":100,"words":[{"text":"oops","start_ms":0,"end_ms":100}]}]}"#,
        )
        .unwrap();

        assert!(read_timeline(&path).is_err());

        let _ = fs::remove_dir_all(tmp);
    }

    fn sample_project(root: &Path, slug: &str) {
        let project = root.join(slug);
        fs::create_dir_all(project.join("components")).unwrap();
        fs::write(
            project.join("project.json"),
            json!({
                "slug": slug,
                "name": "Demo Video",
                "created": "2026-04-26T00:00:00Z",
                "modified": "2026-04-26T00:00:00Z"
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            project
                .join("components")
                .join(format!("{IMAGE_COMPONENT}.js")),
            "export function mount() {}\nexport function update() {}\n",
        )
        .unwrap();
    }

    fn sample_import_source(root: &Path, count: usize) {
        fs::create_dir_all(root.join("audio")).unwrap();
        fs::create_dir_all(root.join("posters")).unwrap();
        let mut entries = Vec::new();
        for slide in 1..=count {
            fs::write(
                root.join("posters").join(format!("{slide}-demo.png")),
                b"png",
            )
            .unwrap();
            fs::write(
                root.join("audio").join(format!("slide-{slide:02}.mp3")),
                b"mp3",
            )
            .unwrap();
            fs::write(
                root.join("audio")
                    .join(format!("slide-{slide:02}.timeline.json")),
                json!({
                    "segments": [{
                        "text": "hello",
                        "start_ms": 0,
                        "end_ms": slide as u64 * 1000,
                        "words": [{"word":"hello","start_ms":0,"end_ms":400}]
                    }]
                })
                .to_string(),
            )
            .unwrap();
            entries.push(json!({
                "id": slide,
                "text": "hello",
                "file": format!("audio/slide-{slide:02}.mp3")
            }));
        }
        fs::write(
            root.join("audio").join("manifest.json"),
            json!({ "entries": entries }).to_string(),
        )
        .unwrap();
    }

    fn word(text: &str, start_ms: u64, end_ms: u64) -> TimelineWord {
        TimelineWord {
            word: text.to_string(),
            start_ms,
            end_ms,
        }
    }

    fn temp_dir(label: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("nf-poster-import-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        path
    }
}
