use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::config::ProviderConfig;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat(
        &self,
        model: &str,
        messages: &[Message],
        tools: &[Value],
    ) -> Result<ChatResponse>;
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
}

impl OpenAiCompat {
    pub fn from_config(config: &ProviderConfig) -> Result<Self> {
        let _ = dotenvy::dotenv();
        let api_key = std::env::var(&config.api_key_env)
            .with_context(|| format!("missing API key env var {}", config.api_key_env))?;
        let mut base_url = Url::parse(&config.base_url)
            .with_context(|| format!("invalid provider base_url {}", config.base_url))?;
        let mut path = base_url.path().trim_end_matches('/').to_owned();
        path.push_str("/chat/completions");
        base_url.set_path(&path);
        Ok(Self {
            client: reqwest::Client::new(),
            endpoint: base_url,
            api_key,
        })
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
