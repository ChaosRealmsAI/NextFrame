use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::time::sleep;

use crate::config::{Config, ProviderConfig};

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat(
        &self,
        model: &str,
        messages: &[Message],
        tools: &[Value],
    ) -> Result<ChatResponse>;

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        HashMap::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum Message {
    #[serde(rename = "system")]
    System { content: String },
    #[serde(rename = "user")]
    User { content: String },
    #[serde(rename = "assistant")]
    Assistant {
        #[serde(skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty", default)]
        tool_calls: Vec<OpenAiToolCall>,
    },
    #[serde(rename = "tool")]
    Tool {
        tool_call_id: String,
        content: String,
    },
}

impl Message {
    pub fn system(content: impl Into<String>) -> Self {
        Self::System {
            content: content.into(),
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self::User {
            content: content.into(),
        }
    }

    pub fn assistant_with_tools(content: Option<String>, tool_calls: Vec<ToolCall>) -> Self {
        Self::Assistant {
            content,
            tool_calls: tool_calls
                .into_iter()
                .map(OpenAiToolCall::from_tool_call)
                .collect(),
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, result: Value, max_chars: usize) -> Self {
        let raw_content = serde_json::to_string(&result).unwrap_or_else(|err| {
            json!({
                "ok": false,
                "error": format!("failed to serialize tool result: {err}")
            })
            .to_string()
        });
        Self::Tool {
            tool_call_id: tool_call_id.into(),
            content: truncate_middle(&raw_content, max_chars),
        }
    }
}

pub fn truncate_middle(s: &str, max: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        return s.to_owned();
    }
    if max == 0 {
        return String::new();
    }

    let placeholder_budget = 40usize;
    let keep_chars = max.saturating_sub(placeholder_budget);
    let head_chars = keep_chars / 2;
    let tail_chars = keep_chars.saturating_sub(head_chars);
    let truncated_chars = char_count.saturating_sub(head_chars + tail_chars);
    let head = s.chars().take(head_chars).collect::<String>();
    let tail = s
        .chars()
        .rev()
        .take(tail_chars)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();

    format!("{head}\n... [truncated {truncated_chars} chars] ...\n{tail}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: OpenAiFunctionCall,
}

impl OpenAiToolCall {
    fn from_tool_call(tool_call: ToolCall) -> Self {
        Self {
            id: tool_call.id,
            kind: "function".to_owned(),
            function: OpenAiFunctionCall {
                name: tool_call.name,
                arguments: tool_call.args.to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAiFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone)]
pub struct ChatResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub usage: Usage,
}

#[derive(Debug, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Usage {
    #[serde(default)]
    pub prompt_tokens: u64,
    #[serde(default)]
    pub completion_tokens: u64,
    #[serde(default)]
    pub context_bytes: usize,
    #[serde(default)]
    pub peak_cost_usd: f64,
}

impl Usage {
    pub fn add(&mut self, other: &Self) {
        self.prompt_tokens = self.prompt_tokens.saturating_add(other.prompt_tokens);
        self.completion_tokens = self
            .completion_tokens
            .saturating_add(other.completion_tokens);
    }
}

pub struct OpenAiCompat {
    client: reqwest::Client,
    endpoint: Url,
    api_key: String,
    max_retries: usize,
    retry_base_ms: u64,
    retries_by_status: Arc<Mutex<HashMap<u16, u32>>>,
}

impl OpenAiCompat {
    pub fn from_config(config: &Config) -> Result<Self> {
        Self::from_provider_config_with_retries(
            &config.provider,
            config.provider_max_retries,
            config.provider_retry_base_ms,
        )
    }

    pub fn from_provider_config(config: &ProviderConfig) -> Result<Self> {
        Self::from_provider_config_with_retries(config, 5, 1_000)
    }

    pub fn from_provider_config_with_retries(
        config: &ProviderConfig,
        max_retries: usize,
        retry_base_ms: u64,
    ) -> Result<Self> {
        let _ = dotenvy::dotenv();
        let api_key = std::env::var(&config.api_key_env)
            .with_context(|| format!("missing API key env var {}", config.api_key_env))?;
        Self::from_parts(&config.base_url, api_key, max_retries, retry_base_ms)
    }

    pub fn from_parts(
        base_url: &str,
        api_key: impl Into<String>,
        max_retries: usize,
        retry_base_ms: u64,
    ) -> Result<Self> {
        let endpoint = chat_completions_endpoint(base_url)?;
        Ok(Self {
            client: reqwest::Client::new(),
            endpoint,
            api_key: api_key.into(),
            max_retries,
            retry_base_ms,
            retries_by_status: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    async fn chat_once(
        &self,
        model: &str,
        messages: &[Message],
        tools: &[Value],
    ) -> Result<ChatResponse> {
        let body = json!({
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
        });
        let response = self
            .client
            .post(self.endpoint.clone())
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await
            .context("provider request failed")?;
        let status = response.status();
        let text = response
            .text()
            .await
            .context("failed to read provider body")?;
        if !status.is_success() {
            return Err(anyhow!("provider returned {status}: {text}"));
        }
        let parsed: OpenAiChatResponse =
            serde_json::from_str(&text).context("failed to parse provider response")?;
        let choice = parsed
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("provider response did not contain choices"))?;
        let tool_calls = choice
            .message
            .tool_calls
            .into_iter()
            .map(|tool_call| {
                let args = if tool_call.function.arguments.trim().is_empty() {
                    Value::Object(serde_json::Map::new())
                } else {
                    serde_json::from_str(&tool_call.function.arguments).with_context(|| {
                        format!("failed to parse tool args for {}", tool_call.function.name)
                    })?
                };
                Ok(ToolCall {
                    id: tool_call.id,
                    name: tool_call.function.name,
                    args,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(ChatResponse {
            content: choice.message.content,
            tool_calls,
            usage: parsed.usage.unwrap_or_default(),
        })
    }

    fn record_retry(&self, status: u16) {
        match self.retries_by_status.lock() {
            Ok(mut retries) => {
                let count = retries.entry(status).or_insert(0);
                *count = count.saturating_add(1);
            }
            Err(err) => {
                log::warn!("failed to record provider retry stats: {err}");
            }
        }
    }
}

#[async_trait]
impl LlmProvider for OpenAiCompat {
    async fn chat(
        &self,
        model: &str,
        messages: &[Message],
        tools: &[Value],
    ) -> Result<ChatResponse> {
        let mut attempt = 0usize;
        loop {
            match self.chat_once(model, messages, tools).await {
                Ok(response) => return Ok(response),
                Err(err) => {
                    let status = extract_http_status(&err);
                    let retryable = matches!(status, Some(429) | Some(500..=599));
                    if retryable && attempt < self.max_retries {
                        attempt = attempt.saturating_add(1);
                        let status_code = status.unwrap_or(0);
                        self.record_retry(status_code);
                        let shift = attempt.saturating_sub(1).min(4);
                        let wait_ms = self.retry_base_ms.saturating_mul(1_u64 << shift);
                        log::warn!(
                            "provider {status:?} retry {attempt}/{} after {wait_ms}ms",
                            self.max_retries
                        );
                        sleep(Duration::from_millis(wait_ms)).await;
                        continue;
                    }
                    return Err(err);
                }
            }
        }
    }

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        match self.retries_by_status.lock() {
            Ok(retries) => retries.clone(),
            Err(err) => {
                log::warn!("failed to read provider retry stats: {err}");
                HashMap::new()
            }
        }
    }
}

fn chat_completions_endpoint(base_url: &str) -> Result<Url> {
    let mut parsed =
        Url::parse(base_url).with_context(|| format!("invalid provider base_url {base_url}"))?;
    let mut path = parsed.path().trim_end_matches('/').to_owned();
    path.push_str("/chat/completions");
    parsed.set_path(&path);
    Ok(parsed)
}

fn extract_http_status(error: &anyhow::Error) -> Option<u16> {
    let text = error.to_string();
    let marker = "provider returned ";
    let start = text.find(marker)?.saturating_add(marker.len());
    let digits = text[start..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    if digits.len() == 3 {
        digits.parse().ok()
    } else {
        None
    }
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessageResponse,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessageResponse {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<OpenAiToolCall>,
}
