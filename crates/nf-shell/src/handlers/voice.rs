use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

use serde_json::{Value, json};

use crate::errors::NfError;
use crate::handlers::{ensure_episode, now_iso, optional_str, required_str};
use crate::ipc_server::{IpcRequest, OpHandler};
use crate::storage::{JsonStorage, Storage, validate_slug};

#[derive(Debug, Clone)]
pub struct VoiceOpHandler {
    storage: JsonStorage,
    jobs: Arc<Mutex<BTreeMap<String, VoiceJob>>>,
}

#[derive(Debug, Clone)]
struct VoiceJob {
    status: VoiceStatus,
    audio: PathBuf,
    timeline: PathBuf,
    result: Option<Value>,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VoiceStatus {
    Running,
    Succeeded,
    Failed,
}

impl VoiceStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
        }
    }
}

impl VoiceOpHandler {
    pub fn new(storage: JsonStorage) -> Self {
        Self {
            storage,
            jobs: Arc::new(Mutex::new(BTreeMap::new())),
        }
    }

    fn start(&self, params: &Value) -> Result<Value, NfError> {
        let project = required_str(params, "project")?;
        let episode_slug = required_str(params, "episode")?;
        let clip = optional_str(params, "clip").unwrap_or_else(|| "narration".to_string());
        let text = required_str(params, "text")?;
        let voice = optional_str(params, "voice");
        let backend = optional_str(params, "backend");
        let rate = optional_str(params, "rate");
        validate_slug(&project)?;
        validate_slug(&episode_slug)?;
        let episode = ensure_episode(&self.storage, &project, &episode_slug)?;

        let job_id = voice_job_id(&project, &episode_slug);
        let base_slug = safe_slug(&format!("voice-{clip}"));
        let audio_dir = self.storage.root().join(&project).join("audio");
        let audio = audio_dir.join(format!("{base_slug}.mp3"));
        let timeline = audio.with_extension("timeline.json");

        {
            let mut jobs = self
                .jobs
                .lock()
                .map_err(|err| NfError::SocketFailed(format!("voice jobs lock failed: {err}")))?;
            jobs.insert(
                job_id.clone(),
                VoiceJob {
                    status: VoiceStatus::Running,
                    audio: audio.clone(),
                    timeline: timeline.clone(),
                    result: None,
                    error: None,
                },
            );
        }

        let jobs = Arc::clone(&self.jobs);
        let storage = self.storage.clone();
        let job_id_for_thread = job_id.clone();
        let audio_for_response = audio.clone();
        let timeline_for_response = timeline.clone();
        std::thread::spawn(move || {
            let update = run_voice_job(VoiceJobRequest {
                storage,
                project,
                episode,
                clip,
                text,
                voice,
                backend,
                rate,
                audio_dir,
                base_slug,
                audio,
                timeline,
            });
            if let Ok(mut jobs) = jobs.lock() {
                if let Some(job) = jobs.get_mut(&job_id_for_thread) {
                    match update {
                        Ok(result) => {
                            job.status = VoiceStatus::Succeeded;
                            job.result = Some(result);
                            job.error = None;
                        }
                        Err(err) => {
                            job.status = VoiceStatus::Failed;
                            job.result = None;
                            job.error = Some(err);
                        }
                    }
                }
            }
        });

        Ok(json!({
            "job_id": job_id,
            "status": VoiceStatus::Running.as_str(),
            "audio": audio_for_response.display().to_string(),
            "timeline": timeline_for_response.display().to_string()
        }))
    }

    fn status(&self, params: &Value) -> Result<Value, NfError> {
        let job_id = required_str(params, "job_id")?;
        let jobs = self
            .jobs
            .lock()
            .map_err(|err| NfError::SocketFailed(format!("voice jobs lock failed: {err}")))?;
        let job = jobs
            .get(&job_id)
            .ok_or_else(|| NfError::ValidationFailed(format!("unknown voice job: {job_id}")))?;
        Ok(json!({
            "job_id": job_id,
            "status": job.status.as_str(),
            "audio": job.audio.display().to_string(),
            "timeline": job.timeline.display().to_string(),
            "result": job.result,
            "error": job.error
        }))
    }
}

impl OpHandler for VoiceOpHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        let data = match req.op.as_str() {
            "voice-start" | "voice.start" => self.start(&req.params)?,
            "voice-status" | "voice.status" => self.status(&req.params)?,
            _ => return Ok(None),
        };

        Ok(Some(data))
    }
}

struct VoiceJobRequest {
    storage: JsonStorage,
    project: String,
    episode: nf_project::Episode,
    clip: String,
    text: String,
    voice: Option<String>,
    backend: Option<String>,
    rate: Option<String>,
    audio_dir: PathBuf,
    base_slug: String,
    audio: PathBuf,
    timeline: PathBuf,
}

fn run_voice_job(request: VoiceJobRequest) -> Result<Value, String> {
    std::fs::create_dir_all(&request.audio_dir).map_err(|err| {
        format!(
            "failed to create audio directory {}: {err}",
            request.audio_dir.display()
        )
    })?;

    let mut command = Command::new(nf_tts_binary());
    command
        .arg("synth")
        .arg(&request.text)
        .arg("-o")
        .arg(format!("{}.mp3", request.base_slug))
        .arg("-d")
        .arg(&request.audio_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(voice) = &request.voice {
        command.arg("--voice").arg(voice);
    }
    if let Some(backend) = &request.backend {
        command.arg("--backend").arg(backend);
    }
    if let Some(rate) = &request.rate {
        command.arg("--rate").arg(rate);
    }

    let output = command
        .output()
        .map_err(|err| format!("spawn nf-tts failed: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("nf-tts exited with status {}", output.status)
        };
        return Err(detail);
    }
    if !request.audio.exists() {
        return Err(format!(
            "nf-tts succeeded but audio file was not created: {}",
            request.audio.display()
        ));
    }

    let (duration_ms, words) = load_timeline_or_fallback(
        &request.timeline,
        &request.text,
        fallback_duration_ms(&request.text),
    )?;
    let updated = update_episode_with_voice(&request, duration_ms, words)?;
    Ok(updated)
}

fn update_episode_with_voice(
    request: &VoiceJobRequest,
    duration_ms: u64,
    words: Vec<Value>,
) -> Result<Value, String> {
    let audio_slug = request.base_slug.clone();
    let subtitle_slug = format!("{}-subtitle", request.base_slug);
    let label = format!("Voice · {}", request.clip);
    let subtitle_label = format!("Subtitle · {}", request.clip);
    let end = format_seconds(duration_ms);

    let mut episode = request.episode.clone();
    episode.clips.retain(|clip| {
        clip_slug(clip) != Some(audio_slug.as_str())
            && clip_slug(clip) != Some(subtitle_slug.as_str())
    });
    episode.clips.push(json!({
        "slug": audio_slug,
        "label": label,
        "track": "audio",
        "start": "0",
        "end": end,
        "src": file_url(&request.audio),
        "volume": 1.0,
        "effects": ["tts-generated"]
    }));
    episode.clips.push(json!({
        "slug": subtitle_slug,
        "label": subtitle_label,
        "track": "subtitle",
        "start": "0",
        "end": end,
        "accent_color": "#fbbf24",
        "words": words,
        "effects": ["tts-timeline"]
    }));
    episode.log.push(json!({
        "time": now_iso(),
        "actor": "AI",
        "desc": format!("生成语音和字幕 · {}", request.clip),
        "cli": format!("nf-tts synth <text> -o {}.mp3", request.base_slug),
        "accent": true
    }));
    request
        .storage
        .save_episode(&request.project, &episode)
        .map_err(|err| format!("failed to save episode: {err}"))?;

    Ok(json!({
        "audio_clip": request.base_slug,
        "subtitle_clip": subtitle_slug,
        "audio": request.audio.display().to_string(),
        "timeline": request.timeline.display().to_string(),
        "duration_ms": duration_ms
    }))
}

fn load_timeline_or_fallback(
    path: &Path,
    text: &str,
    fallback_duration_ms: u64,
) -> Result<(u64, Vec<Value>), String> {
    if path.exists() {
        let content = std::fs::read_to_string(path)
            .map_err(|err| format!("failed to read timeline {}: {err}", path.display()))?;
        let value = serde_json::from_str::<Value>(&content)
            .map_err(|err| format!("failed to parse timeline {}: {err}", path.display()))?;
        let words = timeline_words(&value);
        if !words.is_empty() {
            let duration_ms = value
                .get("duration_ms")
                .and_then(Value::as_u64)
                .unwrap_or_else(|| words_end_ms(&words));
            return Ok((duration_ms.max(words_end_ms(&words)), words));
        }
    }

    let words = fallback_words(text, fallback_duration_ms);
    Ok((fallback_duration_ms, words))
}

fn timeline_words(value: &Value) -> Vec<Value> {
    if let Some(words) = value.get("words").and_then(Value::as_array) {
        return normalized_words(words);
    }
    value
        .get("segments")
        .and_then(Value::as_array)
        .map(|segments| {
            segments
                .iter()
                .filter_map(|segment| segment.get("words").and_then(Value::as_array))
                .flat_map(|words| normalized_words(words))
                .collect()
        })
        .unwrap_or_default()
}

fn normalized_words(words: &[Value]) -> Vec<Value> {
    words
        .iter()
        .filter_map(|word| {
            let object = word.as_object()?;
            let text = object
                .get("text")
                .or_else(|| object.get("word"))
                .and_then(Value::as_str)?;
            let start_ms = object.get("start_ms").and_then(Value::as_u64)?;
            let end_ms = object.get("end_ms").and_then(Value::as_u64)?;
            Some(json!({
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms.max(start_ms + 1)
            }))
        })
        .collect()
}

fn fallback_words(text: &str, duration_ms: u64) -> Vec<Value> {
    let units: Vec<String> = text
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .map(|ch| ch.to_string())
        .collect();
    if units.is_empty() {
        return vec![json!({"text": "Voice", "start_ms": 0, "end_ms": duration_ms})];
    }
    let step = (duration_ms / units.len() as u64).max(80);
    units
        .into_iter()
        .enumerate()
        .map(|(index, text)| {
            let start_ms = index as u64 * step;
            let end_ms = if index == 0 {
                step
            } else {
                ((index as u64 + 1) * step).min(duration_ms)
            };
            json!({"text": text, "start_ms": start_ms, "end_ms": end_ms.max(start_ms + 1)})
        })
        .collect()
}

fn words_end_ms(words: &[Value]) -> u64 {
    words
        .iter()
        .filter_map(|word| word.get("end_ms").and_then(Value::as_u64))
        .max()
        .unwrap_or(0)
}

fn fallback_duration_ms(text: &str) -> u64 {
    let units = text.chars().filter(|ch| !ch.is_whitespace()).count() as u64;
    (units * 240).clamp(1_800, 20_000)
}

fn file_url(path: &Path) -> String {
    format!("file://{}", path.display())
}

fn clip_slug(clip: &Value) -> Option<&str> {
    clip.get("slug")
        .or_else(|| clip.get("clip"))
        .and_then(Value::as_str)
}

fn format_seconds(ms: u64) -> String {
    let seconds = ms as f64 / 1000.0;
    format!("{seconds:.3}")
}

fn voice_job_id(project: &str, episode: &str) -> String {
    format!("{project}-{episode}-voice-{}", safe_timestamp(&now_iso()))
}

fn safe_timestamp(raw: &str) -> String {
    raw.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn safe_slug(raw: &str) -> String {
    let mut slug = String::new();
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-' || ch == '.' {
            slug.push(ch);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug = slug.trim_matches('-').to_string();
    let slug = if slug.is_empty() {
        "narration-voice".to_string()
    } else {
        slug
    };
    let slug = if slug
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_lowercase())
    {
        slug
    } else {
        format!("v-{slug}")
    };
    slug.chars().take(64).collect()
}

fn nf_tts_binary() -> PathBuf {
    if let Some(path) = std::env::var_os("NF_TTS_BIN") {
        return PathBuf::from(path);
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            let candidate = parent.join("nf-tts");
            if candidate.exists() {
                return candidate;
            }
        }
    }
    PathBuf::from("nf-tts")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{fallback_words, timeline_words};

    #[test]
    fn reads_top_level_timeline_words() {
        let timeline = json!({
            "duration_ms": 1200,
            "words": [
                {"text": "你", "start_ms": 0, "end_ms": 400},
                {"text": "好", "start_ms": 400, "end_ms": 800}
            ],
            "segments": []
        });

        let words = timeline_words(&timeline);

        assert_eq!(words.len(), 2);
        assert_eq!(words[0]["text"], "你");
        assert_eq!(words[1]["end_ms"], 800);
    }

    #[test]
    fn reads_legacy_segment_word_field() {
        let timeline = json!({
            "segments": [
                {
                    "text": "hi",
                    "start_ms": 0,
                    "end_ms": 500,
                    "words": [{"word": "hi", "start_ms": 0, "end_ms": 500}]
                }
            ]
        });

        let words = timeline_words(&timeline);

        assert_eq!(words.len(), 1);
        assert_eq!(words[0]["text"], "hi");
    }

    #[test]
    fn fallback_words_are_timed() {
        let words = fallback_words("语音", 1000);

        assert_eq!(words.len(), 2);
        assert_eq!(words[0]["start_ms"], 0);
        assert_eq!(words[1]["end_ms"], 1000);
    }
}
