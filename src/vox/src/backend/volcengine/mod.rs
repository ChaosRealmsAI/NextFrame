//! 火山引擎（豆包）TTS backend — seed-tts-2.0
//!
//! 官方 WebSocket API v3，音质远超 Edge TTS，但按量计费（约 ¥2/万字）。
//! 需要环境变量 VOLC_TTS_APP_ID + VOLC_TTS_ACCESS_TOKEN，或使用内置默认值。

use anyhow::{bail, Result};
use async_trait::async_trait;
use futures::stream::SplitStream;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

use super::{Backend, SynthParams, SynthResult, Voice};

const WS_URL: &str = "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream";
const DEFAULT_APP_ID: &str = "1997023739";
const DEFAULT_ACCESS_TOKEN: &str = "RXQjJw1vScxdoZUH9eVK3wKvGXArk-j0";
const DEFAULT_RESOURCE_ID: &str = "seed-tts-2.0";
pub(crate) const DEFAULT_VOICE: &str = "zh_female_vv_uranus_bigtts";

const EVENT_SESSION_FINISHED: u32 = 152;
const EVENT_TTS_RESPONSE: u32 = 352;

/// 可用的豆包音色（与火山引擎控制台实际开通的声音同步）
const VOICES: &[(&str, &str, &str)] = &[
    // 通用场景
    ("zh_female_vv_uranus_bigtts", "zh-CN", "Female"),           // vivi 2.0
    ("zh_female_xiaohe_uranus_bigtts", "zh-CN", "Female"),       // 小何
    ("zh_male_m191_uranus_bigtts", "zh-CN", "Male"),             // 云舟
    ("zh_male_taocheng_uranus_bigtts", "zh-CN", "Male"),         // 小天
    ("en_male_tim_uranus_bigtts", "en-US", "Male"),              // Tim
    // 角色扮演
    ("saturn_zh_female_cancan_tob", "zh-CN", "Female"),          // 知性灿灿
    ("saturn_zh_female_keainvsheng_tob", "zh-CN", "Female"),     // 可爱女生
    ("saturn_zh_female_tiaopigongzhu_tob", "zh-CN", "Female"),   // 调皮公主
    ("saturn_zh_male_shuanglangshaonian_tob", "zh-CN", "Male"),  // 爽朗少年
    ("saturn_zh_male_tiancaitongzhuo_tob", "zh-CN", "Male"),     // 天才同桌
];

pub struct VolcengineBackend {
    app_id: String,
    access_token: String,
    resource_id: String,
}

impl VolcengineBackend {
    pub fn new() -> Self {
        Self {
            app_id: std::env::var("VOLC_TTS_APP_ID")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_APP_ID.to_string()),
            access_token: std::env::var("VOLC_TTS_ACCESS_TOKEN")
                .ok()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_ACCESS_TOKEN.to_string()),
            resource_id: DEFAULT_RESOURCE_ID.to_string(),
        }
    }
}

#[async_trait]
impl Backend for VolcengineBackend {
    fn max_concurrency(&self) -> usize {
        // 付费 API，保守一点
        2
    }

    async fn list_voices(&self, lang: Option<&str>) -> Result<Vec<Voice>> {
        let voices: Vec<Voice> = VOICES
            .iter()
            .map(|(name, locale, gender)| Voice {
                name: name.to_string(),
                short_name: name.to_string(),
                locale: locale.to_string(),
                language: locale.split('-').next().unwrap_or("zh").to_string(),
                gender: gender.to_string(),
            })
            .collect();

        match lang {
            Some(l) => {
                let l = l.to_lowercase();
                Ok(voices
                    .into_iter()
                    .filter(|v| {
                        v.locale.to_lowercase().starts_with(&l)
                            || v.language.to_lowercase() == l
                    })
                    .collect())
            }
            None => Ok(voices),
        }
    }

    async fn synthesize(&self, text: &str, params: &SynthParams) -> Result<SynthResult> {
        if text.trim().is_empty() {
            bail!("输入文本为空");
        }

        // 长文本需要更多时间，按字数动态调整超时
        let char_count = text.chars().count();
        let timeout_secs = (60 + char_count as u64 / 10).min(180);
        let audio = timeout(Duration::from_secs(timeout_secs), self.synthesize_inner(text, params))
            .await
            .map_err(|_| anyhow::anyhow!("火山引擎请求超时（>{timeout_secs}s）"))??;

        if audio.is_empty() {
            bail!("未收到音频数据");
        }

        // 按中文标点分句
        let sentences = split_sentences(text);

        // 用 ffmpeg silencedetect 找句子边界，生成字幕
        let boundaries = if sentences.len() > 1 {
            detect_sentence_boundaries(&audio, &sentences).unwrap_or_default()
        } else {
            vec![]
        };

        let duration_ms = Some(get_audio_duration_ms(&audio));

        Ok(SynthResult {
            audio,
            duration_ms,
            boundaries,
        })
    }
}

impl VolcengineBackend {
    async fn synthesize_inner(&self, text: &str, params: &SynthParams) -> Result<Vec<u8>> {
        let mut request = WS_URL.into_client_request()?;

        let headers = request.headers_mut();
        headers.insert("X-Api-App-Key", self.app_id.parse()?);
        headers.insert("X-Api-Access-Key", self.access_token.parse()?);
        headers.insert("X-Api-Resource-Id", self.resource_id.parse()?);
        headers.insert("X-Api-Connect-Id", Uuid::new_v4().to_string().parse()?);
        headers.insert("User-Agent", "vox/0.1.0".parse()?);

        let (ws, _) = connect_async(request).await?;
        let (mut sink, mut stream) = ws.split();

        // 发送文本帧
        let frame = build_send_frame(text, params);
        sink.send(Message::Binary(frame.into())).await?;

        // 收集音频
        let audio = collect_audio(&mut stream).await?;

        // 发送结束帧
        let finish = build_finish_frame();
        let _ = sink.send(Message::Binary(finish.into())).await;
        let _ = sink.close().await;

        Ok(audio)
    }
}

async fn collect_audio(
    stream: &mut SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>,
) -> Result<Vec<u8>> {
    let mut audio = Vec::new();

    loop {
        let msg = match stream.next().await {
            Some(Ok(msg)) => msg,
            Some(Err(e)) => bail!("WebSocket 收包失败: {e}"),
            None => bail!("WebSocket 连接中断"),
        };

        if let Message::Binary(data) = msg {
            match parse_response_frame(&data) {
                FrameResult::Audio(chunk) => audio.extend_from_slice(&chunk),
                FrameResult::SessionFinished => return Ok(audio),
                FrameResult::Error { code, message } => {
                    bail!("火山引擎错误 {code}: {message}");
                }
                FrameResult::Other => {}
            }
        } else if let Message::Close(_) = msg {
            bail!("连接在完成前关闭");
        }
    }
}

// ── v3 二进制帧协议 ──

fn build_send_frame(text: &str, params: &super::SynthParams) -> Vec<u8> {
    let mut audio_params = json!({
        "format": "mp3",
        "sample_rate": 24000
    });
    if let Some(ref emotion) = params.emotion {
        audio_params["emotion"] = json!(emotion);
    }
    if let Some(scale) = params.emotion_scale {
        audio_params["emotion_scale"] = json!(scale);
    }
    if let Some(rate) = params.speech_rate {
        audio_params["speech_rate"] = json!(rate);
    }
    if let Some(vol) = params.loudness_rate {
        audio_params["loudness_rate"] = json!(vol);
    }

    // additions: dialect, pitch, context_texts
    let mut additions = serde_json::Map::new();
    if let Some(ref dialect) = params.dialect {
        additions.insert("explicit_dialect".into(), json!(dialect));
    }
    if let Some(pitch) = params.volc_pitch {
        additions.insert("post_process".into(), json!({"pitch": pitch}));
    }
    if let Some(ref ctx) = params.context_text {
        additions.insert("context_texts".into(), json!([ctx]));
    }

    let mut req_params = json!({
        "text": text,
        "speaker": params.voice,
        "audio_params": audio_params
    });
    if !additions.is_empty() {
        req_params["additions"] = json!(serde_json::to_string(&serde_json::Value::Object(additions)).expect("json"));
    }

    let payload = serde_json::to_vec(&json!({
        "user": {"uid": &Uuid::new_v4().to_string()[..8]},
        "req_params": req_params
    }))
    .expect("json serialize");

    let mut frame = Vec::with_capacity(8 + payload.len());
    // byte0: version=1 | header_size=1
    // byte1: msg_type=1(full) | flags=0
    // byte2: ser=1(json) | comp=0
    // byte3: reserved
    frame.extend_from_slice(&[0x11, 0x10, 0x10, 0x00]);
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(&payload);
    frame
}

fn build_finish_frame() -> Vec<u8> {
    let payload = b"{}";
    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.extend_from_slice(&[0x11, 0x14, 0x10, 0x00]);
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}

enum FrameResult {
    Audio(Vec<u8>),
    SessionFinished,
    Error { code: u32, message: String },
    Other,
}

fn parse_response_frame(data: &[u8]) -> FrameResult {
    if data.len() < 4 {
        return FrameResult::Other;
    }

    let msg_type = (data[1] >> 4) & 0x0F;
    let flags = data[1] & 0x0F;

    // 错误帧: msg_type = 0x0F
    if msg_type == 0x0F {
        let code = if data.len() >= 8 {
            u32::from_be_bytes([data[4], data[5], data[6], data[7]])
        } else {
            0
        };
        let raw = if data.len() > 8 {
            String::from_utf8_lossy(&data[8..]).to_string()
        } else {
            String::new()
        };
        let message = extract_json_error(&raw).unwrap_or(raw);
        return FrameResult::Error { code, message };
    }

    // 需要有 event number (flags bit2 = 1)
    if flags & 0x04 == 0 {
        return FrameResult::Other;
    }

    let mut offset = 4usize;
    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
    let event_code =
        u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
    offset += 4;

    // session_id: length + skip
    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
    let sid_len =
        u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
            as usize;
    offset += 4 + sid_len;

    // payload: length + data
    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
    let payload_len =
        u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
            as usize;
    offset += 4;

    let end = (offset + payload_len).min(data.len());

    if event_code == EVENT_TTS_RESPONSE && msg_type == 0x0B {
        return FrameResult::Audio(data[offset..end].to_vec());
    }

    if event_code == EVENT_SESSION_FINISHED {
        return FrameResult::SessionFinished;
    }

    FrameResult::Other
}

// ── 字幕生成：分句 + 静音检测 ──

/// 分句策略：有换行按换行分（用户手动控制），否则按标点分
fn split_sentences(text: &str) -> Vec<String> {
    // 优先按换行分（用户主动控制分句）
    let lines: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() > 1 {
        return lines;
    }

    // 按标点分
    let mut sentences = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '。' | '！' | '？' | '；' | '.' | '!' | '?' | ';') {
            let trimmed = current.trim().to_string();
            if !trimmed.is_empty() {
                sentences.push(trimmed);
            }
            current.clear();
        }
    }
    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        sentences.push(trimmed);
    }
    sentences
}

/// 用 ffmpeg 获取精确的 MP3 时长（毫秒）
fn get_audio_duration_ms(audio: &[u8]) -> u64 {
    use std::io::Write;
    use std::process::Command;

    let tmp = std::env::temp_dir().join(format!("vox-dur-{}.mp3", std::process::id()));
    if let Ok(mut f) = std::fs::File::create(&tmp) {
        let _ = f.write_all(audio);
    }

    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            &tmp.to_string_lossy(),
        ])
        .output();

    let _ = std::fs::remove_file(&tmp);

    output
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|secs| (secs * 1000.0) as u64)
        .unwrap_or_else(|| {
            // fallback: 估算
            (audio.len() as u64) * 1000 / 16000
        })
}

/// 用 ffmpeg silencedetect 找静音点，与分句对齐
fn detect_sentence_boundaries(
    audio: &[u8],
    sentences: &[String],
) -> anyhow::Result<Vec<super::WordBoundary>> {
    use std::io::Write;
    use std::process::Command;

    let tmp = std::env::temp_dir().join(format!("vox-sil-{}.mp3", std::process::id()));
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(audio)?;
    }

    // silencedetect: 静音 >= 0.2s, -30dB
    let output = Command::new("ffmpeg")
        .args([
            "-i", &tmp.to_string_lossy(),
            "-af", "silencedetect=noise=-30dB:d=0.2",
            "-f", "null", "-",
        ])
        .output();

    let _ = std::fs::remove_file(&tmp);

    let output = output?;
    let stderr = String::from_utf8_lossy(&output.stderr);

    // 解析所有静音段 (silence_start, silence_end)
    let mut starts: Vec<f64> = Vec::new();
    let mut ends: Vec<f64> = Vec::new();
    for line in stderr.lines() {
        if let Some(pos) = line.find("silence_start: ") {
            if let Ok(v) = line[pos + "silence_start: ".len()..].trim().parse::<f64>() {
                starts.push(v);
            }
        }
        if let Some(pos) = line.find("silence_end: ") {
            if let Some(v_str) = line[pos + "silence_end: ".len()..].split_whitespace().next() {
                if let Ok(v) = v_str.parse::<f64>() {
                    ends.push(v);
                }
            }
        }
    }

    // 配对，过滤开头静音（< 0.3s 位置的）
    let all_silences: Vec<(u64, u64)> = starts
        .iter()
        .zip(ends.iter())
        .filter_map(|(&s, &e)| {
            let s_ms = (s * 1000.0) as u64;
            let e_ms = (e * 1000.0) as u64;
            if s_ms > 200 { Some((s_ms, e_ms)) } else { None }
        })
        .collect();

    let total_ms = get_audio_duration_ms(audio);
    let needed = sentences.len().saturating_sub(1);

    // 按字数比例估算每句的结束时间点，然后匹配最近的静音段
    let total_chars: usize = sentences.iter().map(|s| s.chars().count()).sum();
    let mut expected_ends: Vec<u64> = Vec::new();
    let mut cumulative = 0usize;
    for (i, s) in sentences.iter().enumerate() {
        cumulative += s.chars().count();
        if i < sentences.len() - 1 {
            let ratio = cumulative as f64 / total_chars as f64;
            expected_ends.push((ratio * total_ms as f64) as u64);
        }
    }

    // 为每个预期结束点找最近的静音段
    let mut used: Vec<bool> = vec![false; all_silences.len()];
    let mut matched: Vec<(u64, u64)> = Vec::new();

    for expected in &expected_ends {
        let mut best_idx = None;
        let mut best_dist = u64::MAX;
        for (j, &(s_ms, _)) in all_silences.iter().enumerate() {
            if used[j] { continue; }
            let dist = if s_ms > *expected { s_ms - expected } else { expected - s_ms };
            if dist < best_dist {
                best_dist = dist;
                best_idx = Some(j);
            }
        }
        if let Some(idx) = best_idx {
            used[idx] = true;
            matched.push(all_silences[idx]);
        }
    }

    // matched 按时间排序
    matched.sort_by_key(|p| p.0);

    // 确保恰好 needed 个分隔点
    matched.truncate(needed);

    // 生成 boundaries
    let mut boundaries = Vec::new();
    let mut cursor_ms: u64 = 0;

    for (i, sentence) in sentences.iter().enumerate() {
        let end_ms = if i < matched.len() {
            matched[i].0
        } else {
            total_ms
        };
        let duration_ms = end_ms.saturating_sub(cursor_ms);

        boundaries.push(super::WordBoundary {
            text: sentence.clone(),
            offset_ms: cursor_ms,
            duration_ms,
        });

        if i < matched.len() {
            cursor_ms = matched[i].1;
        }
    }

    Ok(boundaries)
}

fn extract_json_error(raw: &str) -> Option<String> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')? + 1;
    let json_str = &raw[start..end];
    let v: serde_json::Value = serde_json::from_str(json_str).ok()?;
    v.get("error")
        .and_then(|e| e.as_str())
        .map(|s| s.to_string())
        .or_else(|| Some(json_str.to_string()))
}
