#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::Result;
use async_trait::async_trait;
use nf_agent::{
    Agent, ChatResponse, Config, CostGuardConfig, LlmProvider, Message, ProviderConfig,
    SkillRegistry, SystemPrompt, Tool, ToolCall, Usage, truncate_middle,
};
use serde_json::{Value, json};

struct LoopProvider {
    tool_rounds: usize,
    call_count: AtomicUsize,
    last_messages: Mutex<Vec<Message>>,
}

impl LoopProvider {
    fn new(tool_rounds: usize) -> Self {
        Self {
            tool_rounds,
            call_count: AtomicUsize::new(0),
            last_messages: Mutex::new(Vec::new()),
        }
    }

    fn last_messages(&self) -> Vec<Message> {
        self.last_messages
            .lock()
            .expect("mock provider messages lock poisoned")
            .clone()
    }
}

#[async_trait]
impl LlmProvider for LoopProvider {
    async fn chat(
        &self,
        _model: &str,
        messages: &[Message],
        _tools: &[Value],
    ) -> Result<ChatResponse> {
        let call_index = self.call_count.fetch_add(1, Ordering::SeqCst);
        let mut stored = self
            .last_messages
            .lock()
            .expect("mock provider messages lock poisoned");
        *stored = messages.to_vec();
        drop(stored);

        if call_index < self.tool_rounds {
            return Ok(ChatResponse {
                content: None,
                tool_calls: vec![ToolCall {
                    id: format!("call_{call_index}"),
                    name: "large_payload".to_owned(),
                    args: json!({}),
                }],
                usage: test_usage(),
            });
        }

        Ok(ChatResponse {
            content: Some("done".to_owned()),
            tool_calls: Vec::new(),
            usage: test_usage(),
        })
    }
}

struct ProviderHandle {
    inner: Arc<LoopProvider>,
}

impl ProviderHandle {
    fn new(inner: Arc<LoopProvider>) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl LlmProvider for ProviderHandle {
    async fn chat(
        &self,
        model: &str,
        messages: &[Message],
        tools: &[Value],
    ) -> Result<ChatResponse> {
        self.inner.chat(model, messages, tools).await
    }
}

struct LargePayloadTool {
    payload_chars: usize,
}

#[async_trait]
impl Tool for LargePayloadTool {
    fn name(&self) -> &str {
        "large_payload"
    }

    fn description(&self) -> &str {
        "Return a large generic payload for context compaction tests."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn call(&self, _args: Value) -> Result<Value> {
        Ok(json!({
            "ok": true,
            "payload": "x".repeat(self.payload_chars),
        }))
    }
}

#[test]
fn truncate_middle_keeps_head_tail() {
    let input = format!("{}{}", "a".repeat(5_000), "z".repeat(5_000));
    let output = truncate_middle(&input, 1_000);

    assert!(output.starts_with("aaaaaaaa"));
    assert!(output.ends_with("zzzzzzzz"));
    assert!(output.contains("... [truncated "));
    assert!(output.contains(" chars] ..."));
    assert!(output.chars().count() <= 1_050);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tool_result_stored_truncated() -> Result<()> {
    let provider = Arc::new(LoopProvider::new(1));
    let agent = Agent::with_tools(
        make_config(1_000, 200_000),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(LargePayloadTool {
            payload_chars: 10_000,
        })],
    );

    let result = agent.run("run large payload once", 5).await?;
    assert!(result.completed);
    assert!(result.stats.context_bytes > 0);

    let tool_contents = tool_contents(&provider.last_messages());
    assert_eq!(tool_contents.len(), 1);
    assert!(tool_contents[0].contains("... [truncated "));
    assert!(tool_contents[0].chars().count() <= 1_050);

    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn history_soft_budget_kicks_in() -> Result<()> {
    let provider = Arc::new(LoopProvider::new(10));
    let agent = Agent::with_tools(
        make_config(40_000, 100_000),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(LargePayloadTool {
            payload_chars: 30_000,
        })],
    );

    let result = agent.run("run repeated large payloads", 20).await?;
    assert!(result.completed);
    assert!(result.stats.context_bytes <= 100_000);

    let tool_contents = tool_contents(&provider.last_messages());
    assert_eq!(tool_contents.len(), 10);

    for content in tool_contents.iter().take(7) {
        assert!(content.contains("... [truncated "));
        assert!(content.chars().count() <= 562);
    }
    for content in tool_contents.iter().skip(7) {
        assert!(!content.contains("... [truncated "));
        assert!(content.chars().count() > 30_000);
    }

    Ok(())
}

fn make_config(max_tool_result_chars: usize, max_history_chars: usize) -> Config {
    Config {
        provider: ProviderConfig {
            base_url: "http://mock.invalid/v1".to_owned(),
            api_key_env: "MOCK_KEY_THAT_WILL_NEVER_EXIST".to_owned(),
            model: "mock-model".to_owned(),
        },
        system_prompt: SystemPrompt {
            text: "mock agent".to_owned(),
        },
        bash_timeout_sec: 120,
        bash_permission: nf_agent::BashPermissionConfig::default(),
        provider_max_retries: 5,
        provider_retry_base_ms: 1_000,
        final_check_enabled: false,
        max_tool_result_chars,
        max_history_chars,
        pricing: BTreeMap::new(),
        cost_guard: CostGuardConfig::default(),
        trace: nf_agent::TraceConfig::default(),
        providers: BTreeMap::new(),
    }
}

fn test_usage() -> Usage {
    Usage {
        prompt_tokens: 1,
        completion_tokens: 1,
        context_bytes: 0,
        peak_cost_usd: 0.0,
    }
}

fn tool_contents(messages: &[Message]) -> Vec<String> {
    messages
        .iter()
        .filter_map(|message| match message {
            Message::Tool { content, .. } => Some(content.clone()),
            _ => None,
        })
        .collect()
}
