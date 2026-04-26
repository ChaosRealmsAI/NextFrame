use super::*;

#[test]
fn extracts_segment_words_with_ms_fields() -> Result<(), NfError> {
    let timeline: Timeline = serde_json::from_value(json!({
        "duration_ms": 500,
        "words": [{"text": "错", "start_ms": 9, "end_ms": 10}],
        "segments": [{
            "words": [
                {"word": "你", "start_ms": 0, "end_ms": 120},
                {"word": "好", "start_ms": 120, "end_ms": 240}
            ]
        }]
    }))?;

    let words = extract_words(&timeline)?;

    assert_eq!(words.len(), 2);
    assert_eq!(words[0].text, "你");
    assert_eq!(words[1].end_ms, 240);
    Ok(())
}

#[test]
fn extracts_top_level_words_with_seconds_fields() -> Result<(), NfError> {
    let timeline: Timeline = serde_json::from_value(json!({
        "segments": [],
        "words": [
            {"text": "AI", "start": 0.25, "end": 0.75}
        ]
    }))?;

    let words = extract_words(&timeline)?;

    assert_eq!(words[0].start_ms, 250);
    assert_eq!(words[0].end_ms, 750);
    Ok(())
}

#[test]
fn rejects_invalid_word_timing() -> Result<(), NfError> {
    let timeline: Timeline = serde_json::from_value(json!({
        "words": [{"text": "坏", "start_ms": 200, "end_ms": 100}]
    }))?;

    let err = extract_words(&timeline)
        .err()
        .ok_or_else(|| validation("expected error"))?;

    assert_eq!(err.exit_code(), 2);
    Ok(())
}

#[test]
fn validates_complete_non_overlapping_cues() -> Result<(), NfError> {
    let words = sample_words();
    let parsed: LlmCueList = serde_json::from_value(json!({
        "cues": [
            {"text": "现在", "start_ms": 0, "end_ms": 200, "words": [
                {"i": 0, "text": "现", "start_ms": 0, "end_ms": 100},
                {"i": 1, "text": "在", "start_ms": 100, "end_ms": 200}
            ]},
            {"text": "AI 出", "start_ms": 520, "end_ms": 760, "words": [
                {"i": 2, "text": "AI", "start_ms": 520, "end_ms": 640},
                {"i": 3, "text": "出", "start_ms": 640, "end_ms": 760}
            ]}
        ]
    }))?;

    let result = validate_llm_cues(parsed, &words, 4, 250)?;

    assert_eq!(result.cues.len(), 2);
    assert!(result.warnings.is_empty());
    Ok(())
}

#[test]
fn rejects_cues_that_exceed_max_chars() -> Result<(), NfError> {
    let words = sample_words();
    let parsed: LlmCueList = serde_json::from_value(json!({
        "cues": [{
            "text": "现在 AI 出", "start_ms": 0, "end_ms": 760, "words": [
                {"i": 0, "text": "现", "start_ms": 0, "end_ms": 100},
                {"i": 1, "text": "在", "start_ms": 100, "end_ms": 200},
                {"i": 2, "text": "AI", "start_ms": 520, "end_ms": 640},
                {"i": 3, "text": "出", "start_ms": 640, "end_ms": 760}
            ]
        }]
    }))?;

    let err = validate_llm_cues(parsed, &words, 3, 250)
        .err()
        .ok_or_else(|| validation("expected error"))?;

    assert!(err.detail().contains("exceeds max_chars"));
    Ok(())
}

#[test]
fn rejects_missing_word_coverage() -> Result<(), NfError> {
    let words = sample_words();
    let parsed: LlmCueList = serde_json::from_value(json!({
        "cues": [{
            "text": "AI 出", "start_ms": 520, "end_ms": 760, "words": [
                {"i": 2, "text": "AI", "start_ms": 520, "end_ms": 640},
                {"i": 3, "text": "出", "start_ms": 640, "end_ms": 760}
            ]
        }]
    }))?;

    let err = validate_llm_cues(parsed, &words, 18, 250)
        .err()
        .ok_or_else(|| validation("expected error"))?;

    assert!(err.detail().contains("expected 0"));
    Ok(())
}

#[test]
fn retries_invalid_llm_json() -> Result<(), NfError> {
    let words = sample_words();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| validation(format!("runtime failed: {err}")))?;
    let mut calls = 0usize;

    let result = runtime.block_on(request_cues_with_chat(&words, 4, 250, |_messages| {
        calls = calls.saturating_add(1);
        let body = if calls == 1 {
            "not json".to_string()
        } else {
            json!({
                "cues": [
                    {"text": "现在", "start_ms": 0, "end_ms": 200, "words": [
                        {"i": 0, "text": "现", "start_ms": 0, "end_ms": 100},
                        {"i": 1, "text": "在", "start_ms": 100, "end_ms": 200}
                    ]},
                    {"text": "AI 出", "start_ms": 520, "end_ms": 760, "words": [
                        {"i": 2, "text": "AI", "start_ms": 520, "end_ms": 640},
                        {"i": 3, "text": "出", "start_ms": 640, "end_ms": 760}
                    ]}
                ]
            })
            .to_string()
        };
        async move { Ok(body) }
    }))?;

    assert_eq!(calls, 2);
    assert_eq!(result.cues.len(), 2);
    Ok(())
}

fn sample_words() -> Vec<TimelineWord> {
    vec![
        TimelineWord {
            i: 0,
            text: "现".to_string(),
            start_ms: 0,
            end_ms: 100,
        },
        TimelineWord {
            i: 1,
            text: "在".to_string(),
            start_ms: 100,
            end_ms: 200,
        },
        TimelineWord {
            i: 2,
            text: "AI".to_string(),
            start_ms: 520,
            end_ms: 640,
        },
        TimelineWord {
            i: 3,
            text: "出".to_string(),
            start_ms: 640,
            end_ms: 760,
        },
    ]
}
