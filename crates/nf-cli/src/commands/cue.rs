use std::fs;
use std::path::Path;
use std::time::Duration;

use nf_agent::{LlmProvider, Message, OpenAiCompat, ProviderConfig, truncate_middle};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::commands::{CueArgs, print_json};
use crate::errors::NfError;

#[path = "cue_prompt.rs"]
mod cue_prompt;

const MAX_LLM_ATTEMPTS: usize = 3;
const DEFAULT_BASE_URL: &str = "https://api.siliconflow.cn/v1";
const DEFAULT_API_KEY_ENV: &str = "SILICONFLOW_API_KEY";
const DEFAULT_MODEL: &str = "Pro/MiniMaxAI/MiniMax-M2.5";
const DEFAULT_TIMEOUT_SEC: u64 = 60;

pub fn run(args: CueArgs) -> Result<(), NfError> {
    let timeline = read_timeline(&args.timeline)?;
    let words = extract_words(&timeline)?;
    let duration_ms = timeline
        .duration_ms
        .unwrap_or_else(|| words.iter().map(|word| word.end_ms).max().unwrap_or(0));
    let provider_config = provider_config_from_env();
    let provider = OpenAiCompat::from_provider_config(&provider_config)
        .map_err(|err| llm_error(format!("{err:#}")))?;
    let model = provider_config.model.clone();
    let timeout = provider_timeout_from_env();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| NfError::StorageFailed(format!("failed to start async runtime: {err}")))?;
    let cue_result = runtime.block_on(request_cues_with_chat(
        &words,
        args.max_chars,
        args.min_pause_ms,
        |messages| {
            let provider = &provider;
            let model = model.clone();
            async move {
                let response = tokio::time::timeout(timeout, provider.chat(&model, &messages, &[]))
                    .await
                    .map_err(|_| {
                        llm_error(format!(
                            "provider request timed out after {}s",
                            timeout.as_secs()
                        ))
                    })?
                    .map_err(|err| llm_error(format!("{err:#}")))?;
                response
                    .content
                    .ok_or_else(|| llm_error("provider returned no message content"))
            }
        },
    ))?;

    let output = json!({
        "ok": true,
        "cues_count": cue_result.cues.len(),
        "duration_ms": duration_ms,
        "max_chars": args.max_chars,
        "cues": cue_result.cues,
        "warnings": cue_result.warnings,
    });
    if let Some(out) = args.out {
        write_json(&out, &output)?;
    }
    print_json(&output)
}

async fn request_cues_with_chat<F, Fut>(
    words: &[TimelineWord],
    max_chars: usize,
    min_pause_ms: u64,
    mut chat: F,
) -> Result<CueResult, NfError>
where
    F: FnMut(Vec<Message>) -> Fut,
    Fut: std::future::Future<Output = Result<String, NfError>>,
{
    let mut last_error = None;
    for attempt in 1..=MAX_LLM_ATTEMPTS {
        let messages = cue_prompt::cue_messages(
            words,
            max_chars,
            min_pause_ms,
            attempt,
            last_error.as_deref(),
        );
        let raw = chat(messages).await?;
        match parse_and_validate(&raw, words, max_chars, min_pause_ms) {
            Ok(result) => return Ok(result),
            Err(err) => {
                last_error = Some(format!("{err}; raw={}", truncate_middle(raw.trim(), 800)));
            }
        }
    }
    Err(validation(format!(
        "LLM cue output failed schema after {MAX_LLM_ATTEMPTS} attempts: {}",
        last_error.unwrap_or_else(|| "unknown validation error".to_string())
    )))
}

fn parse_and_validate(
    raw: &str,
    words: &[TimelineWord],
    max_chars: usize,
    min_pause_ms: u64,
) -> Result<CueResult, NfError> {
    let parsed: LlmCueList = serde_json::from_str(raw.trim())
        .map_err(|err| validation(format!("LLM output is not strict JSON: {err}")))?;
    validate_llm_cues(parsed, words, max_chars, min_pause_ms)
}

fn validate_llm_cues(
    parsed: LlmCueList,
    words: &[TimelineWord],
    max_chars: usize,
    min_pause_ms: u64,
) -> Result<CueResult, NfError> {
    if parsed.cues.is_empty() {
        return Err(validation("LLM cue list must not be empty"));
    }
    let mut cues = Vec::with_capacity(parsed.cues.len());
    let mut warnings = Vec::new();
    let mut expected_i = 0usize;
    let mut previous_end_ms = None;

    for (cue_index, cue) in parsed.cues.into_iter().enumerate() {
        if cue.start_ms >= cue.end_ms {
            return Err(validation(format!(
                "cue {cue_index} start_ms must be < end_ms"
            )));
        }
        if cue.words.is_empty() {
            return Err(validation(format!(
                "cue {cue_index} words must not be empty"
            )));
        }
        let first_i = cue.words[0].i;
        if first_i != expected_i {
            return Err(validation(format!(
                "cue {cue_index} starts at word {first_i}, expected {expected_i}"
            )));
        }
        let source_words = validate_cue_words(cue_index, &cue.words, words, &mut expected_i)?;
        let source_text = source_words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<String>();
        if normalize_text(&cue.text) != normalize_text(&source_text) {
            return Err(validation(format!(
                "cue {cue_index} text does not match words"
            )));
        }
        if visible_chars(&source_text) > max_chars || visible_chars(&cue.text) > max_chars {
            return Err(validation(format!(
                "cue {cue_index} exceeds max_chars {max_chars}"
            )));
        }
        let start_ms = source_words[0].start_ms;
        let end_ms = source_words[source_words.len().saturating_sub(1)].end_ms;
        if cue.start_ms != start_ms || cue.end_ms != end_ms {
            return Err(validation(format!(
                "cue {cue_index} timing must match first/last word"
            )));
        }
        if let Some(previous) = previous_end_ms {
            if start_ms < previous {
                return Err(validation(format!("cue {cue_index} overlaps previous cue")));
            }
        }
        previous_end_ms = Some(end_ms);
        if expected_i < words.len() {
            let gap = words[expected_i].start_ms.saturating_sub(end_ms);
            if gap < min_pause_ms {
                warnings.push(format!(
                    "cue {cue_index} boundary pause {gap}ms is below min_pause_ms {min_pause_ms}"
                ));
            }
        }
        cues.push(Cue {
            text: cue.text.trim().to_string(),
            start_ms,
            end_ms,
            words: source_words.into_iter().map(CueWord::from).collect(),
        });
    }

    if expected_i != words.len() {
        return Err(validation(format!(
            "cue list covered {expected_i} words, expected {}",
            words.len()
        )));
    }
    Ok(CueResult { cues, warnings })
}

fn validate_cue_words<'a>(
    cue_index: usize,
    cue_words: &[LlmCueWord],
    words: &'a [TimelineWord],
    expected_i: &mut usize,
) -> Result<Vec<&'a TimelineWord>, NfError> {
    let mut source_words = Vec::with_capacity(cue_words.len());
    for cue_word in cue_words {
        if cue_word.i != *expected_i {
            return Err(validation(format!(
                "cue {cue_index} word index {} is not contiguous at {}",
                cue_word.i, *expected_i
            )));
        }
        let source = words
            .get(cue_word.i)
            .ok_or_else(|| validation(format!("cue {cue_index} word index out of range")))?;
        if cue_word.text != source.text
            || cue_word.start_ms != source.start_ms
            || cue_word.end_ms != source.end_ms
        {
            return Err(validation(format!(
                "cue {cue_index} word {} does not match source",
                cue_word.i
            )));
        }
        source_words.push(source);
        *expected_i = expected_i.saturating_add(1);
    }
    Ok(source_words)
}

fn read_timeline(path: &Path) -> Result<Timeline, NfError> {
    let bytes = fs::read(path)
        .map_err(|err| NfError::StorageFailed(format!("read failed: {}: {err}", path.display())))?;
    serde_json::from_slice(&bytes)
        .map_err(|err| validation(format!("cannot parse timeline {}: {err}", path.display())))
}

fn extract_words(timeline: &Timeline) -> Result<Vec<TimelineWord>, NfError> {
    let raw_words = timeline
        .segments
        .as_deref()
        .and_then(segment_words)
        .or_else(|| timeline.words.clone())
        .ok_or_else(|| validation("timeline must contain words or segments[].words"))?;
    let mut words = Vec::with_capacity(raw_words.len());
    let mut previous_start = None;
    for raw in &raw_words {
        let text = raw
            .text
            .as_deref()
            .or(raw.word.as_deref())
            .ok_or_else(|| validation("timeline word must contain text or word"))?
            .trim()
            .to_string();
        if text.is_empty() {
            return Err(validation("timeline word must not be empty"));
        }
        let start_ms = read_time_ms(raw.start_ms, raw.start, "start")?;
        let end_ms = read_time_ms(raw.end_ms, raw.end, "end")?;
        if start_ms >= end_ms {
            return Err(validation(format!(
                "timeline word '{}' end_ms must be greater than start_ms",
                text
            )));
        }
        if let Some(previous) = previous_start {
            if start_ms < previous {
                return Err(validation("timeline words must be sorted by start time"));
            }
        }
        previous_start = Some(start_ms);
        words.push(TimelineWord {
            i: words.len(),
            text,
            start_ms,
            end_ms,
        });
    }
    if words.is_empty() {
        return Err(validation("timeline must contain at least one word"));
    }
    Ok(words)
}

fn segment_words(segments: &[Segment]) -> Option<Vec<RawWord>> {
    let words = segments
        .iter()
        .flat_map(|segment| segment.words.iter().cloned())
        .collect::<Vec<_>>();
    if words.is_empty() { None } else { Some(words) }
}

fn read_time_ms(ms: Option<u64>, seconds: Option<f64>, name: &str) -> Result<u64, NfError> {
    match (ms, seconds) {
        (Some(value), _) => Ok(value),
        (None, Some(value)) if value.is_finite() && value >= 0.0 => {
            Ok((value * 1000.0).round() as u64)
        }
        _ => Err(validation(format!(
            "timeline word must contain {name}_ms or {name}"
        ))),
    }
}

fn normalize_text(text: &str) -> String {
    text.chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
}

fn visible_chars(text: &str) -> usize {
    normalize_text(text).chars().count()
}

fn provider_config_from_env() -> ProviderConfig {
    ProviderConfig {
        base_url: env_or(
            "NF_CUE_BASE_URL",
            &["SILICONFLOW_BASE_URL", "OPENAI_BASE_URL"],
            DEFAULT_BASE_URL,
        ),
        api_key_env: env_or("NF_CUE_API_KEY_ENV", &[], DEFAULT_API_KEY_ENV),
        model: env_or(
            "NF_CUE_MODEL",
            &["SILICONFLOW_MODEL", "OPENAI_MODEL"],
            DEFAULT_MODEL,
        ),
    }
}

fn env_or(primary: &str, fallbacks: &[&str], default: &str) -> String {
    std::env::var(primary)
        .ok()
        .or_else(|| fallbacks.iter().find_map(|name| std::env::var(name).ok()))
        .unwrap_or_else(|| default.to_string())
}

fn provider_timeout_from_env() -> Duration {
    std::env::var("NF_CUE_TIMEOUT_SEC")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(Duration::from_secs)
        .unwrap_or_else(|| Duration::from_secs(DEFAULT_TIMEOUT_SEC))
}

fn write_json(path: &Path, value: &Value) -> Result<(), NfError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)
        .map_err(|err| NfError::StorageFailed(format!("write failed: {}: {err}", path.display())))
}

fn validation(detail: impl Into<String>) -> NfError {
    NfError::ValidationFailed(detail.into())
}

fn llm_error(detail: impl Into<String>) -> NfError {
    NfError::Remote {
        error: "llm failed".to_string(),
        detail: detail.into(),
        hint: "set SILICONFLOW_API_KEY or override NF_CUE_BASE_URL/NF_CUE_MODEL/NF_CUE_API_KEY_ENV"
            .to_string(),
        exit_code: 2,
    }
}

#[derive(Debug, Deserialize)]
struct Timeline {
    duration_ms: Option<u64>,
    words: Option<Vec<RawWord>>,
    segments: Option<Vec<Segment>>,
}

#[derive(Debug, Clone, Deserialize)]
struct RawWord {
    text: Option<String>,
    word: Option<String>,
    start_ms: Option<u64>,
    end_ms: Option<u64>,
    start: Option<f64>,
    end: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct Segment {
    #[serde(default)]
    words: Vec<RawWord>,
}

#[derive(Debug, Clone)]
struct TimelineWord {
    i: usize,
    text: String,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Debug)]
struct CueResult {
    cues: Vec<Cue>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
struct Cue {
    text: String,
    start_ms: u64,
    end_ms: u64,
    words: Vec<CueWord>,
}

#[derive(Debug, Serialize)]
struct CueWord {
    text: String,
    start_ms: u64,
    end_ms: u64,
}

impl From<&TimelineWord> for CueWord {
    fn from(value: &TimelineWord) -> Self {
        Self {
            text: value.text.clone(),
            start_ms: value.start_ms,
            end_ms: value.end_ms,
        }
    }
}

#[derive(Debug, Deserialize)]
struct LlmCueList {
    cues: Vec<LlmCue>,
}

#[derive(Debug, Deserialize)]
struct LlmCue {
    text: String,
    start_ms: u64,
    end_ms: u64,
    words: Vec<LlmCueWord>,
}

#[derive(Debug, Deserialize)]
struct LlmCueWord {
    i: usize,
    text: String,
    start_ms: u64,
    end_ms: u64,
}

#[cfg(test)]
#[path = "cue_tests.rs"]
mod cue_tests;
