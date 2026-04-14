//! backend edge websocket transport
use anyhow::{anyhow, Result};
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use super::drm;
use super::ssml;
use super::{BASE_URL, TRUSTED_CLIENT_TOKEN};
use crate::backend::{SynthParams, SynthResult, Voice, WordBoundary};

fn connect_id() -> String {
    Uuid::new_v4().to_string().replace('-', "")
}

fn js_date_string() -> String {
    chrono::Utc::now()
        .format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)")
        .to_string()
}

fn update_clock_skew_from_headers(headers: &reqwest::header::HeaderMap) {
    let Some(date) = headers.get(reqwest::header::DATE) else {
        return;
    };

    let Ok(date) = date.to_str() else {
        return;
    };

    let Ok(parsed) = chrono::DateTime::parse_from_rfc2822(date) else {
        return;
    };

    drm::adjust_clock_skew(parsed.timestamp_millis() as f64 / 1000.0);
}

fn update_clock_skew_from_ws_headers(headers: &tokio_tungstenite::tungstenite::http::HeaderMap) {
    let Some(date) = headers.get("date") else {
        return;
    };

    let Ok(date) = date.to_str() else {
        return;
    };

    let Ok(parsed) = chrono::DateTime::parse_from_rfc2822(date) else {
        return;
    };

    drm::adjust_clock_skew(parsed.timestamp_millis() as f64 / 1000.0);
}

/// Fetch the list of available voices via REST.
pub async fn fetch_voices_list() -> Result<Vec<Voice>> {
    let url = format!(
        "https://{}/voices/list?trustedclienttoken={}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}",
        BASE_URL,
        TRUSTED_CLIENT_TOKEN,
        drm::generate_sec_ms_gec(),
        drm::sec_ms_gec_version(),
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", user_agent())
        .header("Accept", "*/*")
        .header("Cookie", format!("muid={};", drm::generate_muid()))
        .send()
        .await?;

    update_clock_skew_from_headers(resp.headers());

    if !resp.status().is_success() {
        return Err(anyhow!("Voice list request failed: {}", resp.status()));
    }

    let data: Vec<serde_json::Value> = resp.json().await?;

    let voices = data
        .into_iter()
        .map(|v| Voice {
            name: v["Name"].as_str().unwrap_or("").to_string(),
            short_name: v["ShortName"].as_str().unwrap_or("").to_string(),
            locale: v["Locale"].as_str().unwrap_or("").to_string(),
            language: v["Locale"]
                .as_str()
                .unwrap_or("")
                .split('-')
                .next()
                .unwrap_or("")
                .to_string(),
            gender: v["Gender"].as_str().unwrap_or("").to_string(),
        })
        .collect();

    Ok(voices)
}

/// Synthesize text to audio via WebSocket.
pub async fn synthesize(text: &str, params: &SynthParams) -> Result<SynthResult> {
    let chunks = ssml::split_text(text, 4096);
    let mut all_audio = Vec::new();
    let mut all_boundaries = Vec::new();
    let mut accumulated_duration_ms: u64 = 0;

    for chunk in &chunks {
        let (audio, boundaries) = synthesize_chunk_with_retry(chunk, params).await?;

        // Adjust boundary offsets for subsequent chunks
        if accumulated_duration_ms > 0 {
            for mut b in boundaries {
                b.offset_ms += accumulated_duration_ms;
                all_boundaries.push(b);
            }
        } else {
            all_boundaries.extend(boundaries);
        }

        // Estimate duration from the last boundary of this chunk
        if let Some(last) = all_boundaries.last() {
            accumulated_duration_ms = last.offset_ms + last.duration_ms;
        }

        all_audio.extend(audio);
    }

    Ok(SynthResult {
        audio: all_audio,
        duration_ms: if accumulated_duration_ms > 0 {
            Some(accumulated_duration_ms)
        } else {
            None
        },
        boundaries: all_boundaries,
    })
}

/// Retry wrapper for synthesize_chunk with exponential backoff.
async fn synthesize_chunk_with_retry(
    escaped_text: &str,
    params: &SynthParams,
) -> Result<(Vec<u8>, Vec<WordBoundary>)> {
    let max_attempts = 3;
    let mut last_err = None;

    for attempt in 0..max_attempts {
        match synthesize_chunk(escaped_text, params).await {
            Ok(result) => return Ok(result),
            Err(e) => {
                let error_text = format!("{e:?}");
                let is_retryable = error_text.contains("connection")
                    || error_text.contains("Connection")
                    || error_text.contains("timeout")
                    || error_text.contains("Timeout")
                    || error_text.contains("Io(")
                    || error_text.contains("tungstenite");

                if !is_retryable || attempt == max_attempts - 1 {
                    return Err(e);
                }

                let wait_secs = (attempt + 1) as u64; // 1s, 2s
                tokio::time::sleep(std::time::Duration::from_secs(wait_secs)).await;
                last_err = Some(e);
            }
        }
    }

    Err(last_err.unwrap_or_else(|| anyhow!("All retry attempts failed")))
}

async fn synthesize_chunk(
    escaped_text: &str,
    params: &SynthParams,
) -> Result<(Vec<u8>, Vec<WordBoundary>)> {
    let conn_id = connect_id();
    let url = format!(
        "wss://{}//edge/v1?TrustedClientToken={}&ConnectionId={}&Sec-MS-GEC={}&Sec-MS-GEC-Version={}",
        BASE_URL,
        TRUSTED_CLIENT_TOKEN,
        conn_id,
        drm::generate_sec_ms_gec(),
        drm::sec_ms_gec_version(),
    );

    let mut request = url.into_client_request()?;
    let headers = request.headers_mut();
    headers.insert("User-Agent", HeaderValue::from_str(&user_agent())?);
    headers.insert(
        "Origin",
        HeaderValue::from_static("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"),
    );
    headers.insert("Pragma", HeaderValue::from_static("no-cache"));
    headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    headers.insert(
        "Cookie",
        HeaderValue::from_str(&format!("muid={};", drm::generate_muid()))?,
    );

    let (ws_stream, response) = connect_async(request).await?;
    update_clock_skew_from_ws_headers(response.headers());
    let (mut sink, mut stream) = ws_stream.split();

    // Send speech config.
    let config_msg = format!(
        "X-Timestamp:{}\r\n\
         Content-Type:application/json; charset=utf-8\r\n\
         Path:speech.config\r\n\r\n\
         {{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\
         \"sentenceBoundaryEnabled\":\"true\",\"wordBoundaryEnabled\":\"true\"\
         }},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}",
        js_date_string()
    );
    sink.send(Message::Text(config_msg.into())).await?;

    // Send SSML request.
    let ssml = ssml::build_ssml(escaped_text, params);
    let ssml_msg = format!(
        "X-RequestId:{}\r\n\
         Content-Type:application/ssml+xml\r\n\
         X-Timestamp:{}Z\r\n\
         Path:ssml\r\n\r\n\
         {}",
        connect_id(),
        js_date_string(),
        ssml
    );
    sink.send(Message::Text(ssml_msg.into())).await?;

    // Receive audio data.
    let mut audio_data = Vec::new();
    let mut boundaries = Vec::new();

    while let Some(msg) = stream.next().await {
        match msg? {
            Message::Text(ref text) => {
                let text_str = text.as_str();
                if text_str.contains("Path:turn.end") {
                    break;
                }
                if text_str.contains("Path:audio.metadata") {
                    // Extract JSON body after \r\n\r\n
                    if let Some(body_start) = text_str.find("\r\n\r\n") {
                        let json_body = &text_str[body_start + 4..];
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_body) {
                            if let Some(metadata) =
                                parsed.get("Metadata").and_then(|m| m.as_array())
                            {
                                for entry in metadata {
                                    if entry.get("Type").and_then(|t| t.as_str())
                                        == Some("WordBoundary")
                                    {
                                        if let Some(data) = entry.get("Data") {
                                            let offset_ticks = data
                                                .get("Offset")
                                                .and_then(|o| o.as_u64())
                                                .unwrap_or(0);
                                            let duration_ticks = data
                                                .get("Duration")
                                                .and_then(|d| d.as_u64())
                                                .unwrap_or(0);
                                            let word_text = data
                                                .get("text")
                                                .and_then(|t| t.get("Text"))
                                                .and_then(|t| t.as_str())
                                                .unwrap_or("")
                                                .to_string();

                                            boundaries.push(WordBoundary {
                                                text: word_text,
                                                offset_ms: offset_ticks / 10_000,
                                                duration_ms: duration_ticks / 10_000,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Message::Binary(data) => {
                if data.len() < 2 {
                    continue;
                }
                let header_len = u16::from_be_bytes([data[0], data[1]]) as usize;
                if header_len + 2 > data.len() {
                    continue;
                }
                let body = &data[header_len + 2..];
                if !body.is_empty() {
                    audio_data.extend_from_slice(body);
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let _ = sink.close().await;

    if audio_data.is_empty() {
        return Err(anyhow!("No audio received from Edge TTS"));
    }

    Ok((audio_data, boundaries))
}

fn user_agent() -> String {
    let major = super::CHROMIUM_FULL_VERSION
        .split('.')
        .next()
        .unwrap_or("130");
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0"
    )
}
