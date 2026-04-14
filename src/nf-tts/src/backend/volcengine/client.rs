<<<<<<< HEAD
use anyhow::{bail, Result};
=======
use anyhow::{bail, Context, Result};
>>>>>>> wt-fix-tts-bb31c753
use futures::stream::SplitStream;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

use crate::backend::SynthParams;

use super::VolcengineBackend;

const WS_URL: &str = "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream";
const EVENT_SESSION_FINISHED: u32 = 152;
const EVENT_TTS_RESPONSE: u32 = 352;

impl VolcengineBackend {
    pub(super) async fn synthesize_inner(
        &self,
        text: &str,
        params: &SynthParams,
    ) -> Result<Vec<u8>> {
        let mut request = WS_URL.into_client_request()?;
<<<<<<< HEAD
=======

>>>>>>> wt-fix-tts-bb31c753
        let headers = request.headers_mut();
        headers.insert("X-Api-App-Key", self.app_id.parse()?);
        headers.insert("X-Api-Access-Key", self.access_token.parse()?);
        headers.insert("X-Api-Resource-Id", self.resource_id.parse()?);
        headers.insert("X-Api-Connect-Id", Uuid::new_v4().to_string().parse()?);
        headers.insert("User-Agent", "vox/0.1.0".parse()?);

        let (ws, _) = connect_async(request).await?;
        let (mut sink, mut stream) = ws.split();

<<<<<<< HEAD
        sink.send(Message::Binary(build_send_frame(text, params).into()))
=======
        sink.send(Message::Binary(build_send_frame(text, params)?.into()))
>>>>>>> wt-fix-tts-bb31c753
            .await?;

        let audio = collect_audio(&mut stream).await?;

        let _ = sink
            .send(Message::Binary(build_finish_frame().into()))
            .await;
        let _ = sink.close().await;

        Ok(audio)
    }
}

async fn collect_audio(
    stream: &mut SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>,
) -> Result<Vec<u8>> {
    let mut audio = Vec::new();

    loop {
<<<<<<< HEAD
        let msg = match stream.next().await {
            Some(Ok(msg)) => msg,
            Some(Err(e)) => bail!("WebSocket 收包失败: {e}"),
            None => bail!("WebSocket 连接中断"),
        };

        if let Message::Binary(data) = msg {
            match parse_response_frame(&data) {
=======
        let message = match stream.next().await {
            Some(Ok(message)) => message,
            Some(Err(error)) => bail!("WebSocket 收包失败: {error}"),
            None => bail!("WebSocket 连接中断"),
        };

        match message {
            Message::Binary(data) => match parse_response_frame(&data) {
>>>>>>> wt-fix-tts-bb31c753
                FrameResult::Audio(chunk) => audio.extend_from_slice(&chunk),
                FrameResult::SessionFinished => return Ok(audio),
                FrameResult::Error { code, message } => {
                    bail!("火山引擎错误 {code}: {message}");
                }
                FrameResult::Other => {}
<<<<<<< HEAD
            }
        } else if let Message::Close(_) = msg {
            bail!("连接在完成前关闭");
=======
            },
            Message::Close(_) => bail!("连接在完成前关闭"),
            _ => {}
>>>>>>> wt-fix-tts-bb31c753
        }
    }
}

<<<<<<< HEAD
fn build_send_frame(text: &str, params: &SynthParams) -> Vec<u8> {
    let mut audio_params = json!({"format": "mp3", "sample_rate": 24000});
    if let Some(ref emotion) = params.emotion {
=======
fn build_send_frame(text: &str, params: &SynthParams) -> Result<Vec<u8>> {
    let mut audio_params = json!({
        "format": "mp3",
        "sample_rate": 24000
    });
    if let Some(emotion) = &params.emotion {
>>>>>>> wt-fix-tts-bb31c753
        audio_params["emotion"] = json!(emotion);
    }
    if let Some(scale) = params.emotion_scale {
        audio_params["emotion_scale"] = json!(scale);
    }
    if let Some(rate) = params.speech_rate {
        audio_params["speech_rate"] = json!(rate);
    }
<<<<<<< HEAD
    if let Some(vol) = params.loudness_rate {
        audio_params["loudness_rate"] = json!(vol);
    }

    let mut additions = serde_json::Map::new();
    if let Some(ref dialect) = params.dialect {
        additions.insert("explicit_dialect".into(), json!(dialect));
    }
    if let Some(pitch) = params.volc_pitch {
        additions.insert("post_process".into(), json!({"pitch": pitch}));
    }
    if let Some(ref ctx) = params.context_text {
        additions.insert("context_texts".into(), json!([ctx]));
=======
    if let Some(volume) = params.loudness_rate {
        audio_params["loudness_rate"] = json!(volume);
    }

    let mut additions = serde_json::Map::new();
    if let Some(dialect) = &params.dialect {
        additions.insert("explicit_dialect".into(), json!(dialect));
    }
    if let Some(pitch) = params.volc_pitch {
        additions.insert("post_process".into(), json!({ "pitch": pitch }));
    }
    if let Some(context_text) = &params.context_text {
        additions.insert("context_texts".into(), json!([context_text]));
>>>>>>> wt-fix-tts-bb31c753
    }

    let mut req_params = json!({
        "text": text,
        "speaker": params.voice,
        "audio_params": audio_params
    });
    if !additions.is_empty() {
<<<<<<< HEAD
        req_params["additions"] =
            json!(serde_json::to_string(&serde_json::Value::Object(additions)).expect("json"));
    }

    let payload = serde_json::to_vec(&json!({
        "user": {"uid": &Uuid::new_v4().to_string()[..8]},
        "req_params": req_params
    }))
    .expect("json serialize");
=======
        let additions = serde_json::to_string(&serde_json::Value::Object(additions))
            .context("failed to serialize volcengine additions")?;
        req_params["additions"] = json!(additions);
    }

    let uid = Uuid::new_v4().to_string();
    let payload = serde_json::to_vec(&json!({
        "user": {"uid": &uid[..8]},
        "req_params": req_params
    }))
    .context("failed to serialize volcengine request payload")?;
>>>>>>> wt-fix-tts-bb31c753

    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.extend_from_slice(&[0x11, 0x10, 0x10, 0x00]);
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(&payload);
<<<<<<< HEAD
    frame
=======
    Ok(frame)
>>>>>>> wt-fix-tts-bb31c753
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
<<<<<<< HEAD
=======

>>>>>>> wt-fix-tts-bb31c753
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

    if flags & 0x04 == 0 {
        return FrameResult::Other;
    }

    let mut offset = 4usize;
    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
<<<<<<< HEAD
=======

>>>>>>> wt-fix-tts-bb31c753
    let event_code = u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]);
    offset += 4;

    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
<<<<<<< HEAD
    let sid_len = u32::from_be_bytes([
=======
    let session_id_len = u32::from_be_bytes([
>>>>>>> wt-fix-tts-bb31c753
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]) as usize;
<<<<<<< HEAD
    offset += 4 + sid_len;
=======
    offset += 4 + session_id_len;
>>>>>>> wt-fix-tts-bb31c753

    if data.len() < offset + 4 {
        return FrameResult::Other;
    }
    let payload_len = u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]) as usize;
    offset += 4;

    let end = (offset + payload_len).min(data.len());
<<<<<<< HEAD
=======

>>>>>>> wt-fix-tts-bb31c753
    if event_code == EVENT_TTS_RESPONSE && msg_type == 0x0B {
        return FrameResult::Audio(data[offset..end].to_vec());
    }
    if event_code == EVENT_SESSION_FINISHED {
        return FrameResult::SessionFinished;
    }

    FrameResult::Other
}

fn extract_json_error(raw: &str) -> Option<String> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')? + 1;
    let json_str = &raw[start..end];
    let value: serde_json::Value = serde_json::from_str(json_str).ok()?;
    value
        .get("error")
<<<<<<< HEAD
        .and_then(|error| error.as_str())
        .map(|error| error.to_string())
=======
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
>>>>>>> wt-fix-tts-bb31c753
        .or_else(|| Some(json_str.to_string()))
}
