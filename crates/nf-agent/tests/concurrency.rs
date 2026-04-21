#![allow(clippy::expect_used, clippy::panic)]

use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use async_trait::async_trait;
use nf_agent::{
    Agent, BashPermissionConfig, ChatResponse, Config, CostGuardConfig, LlmProvider, Message,
    ProviderConfig, SkillRegistry, SystemPrompt, Tool, ToolCall, Usage,
};
use serde_json::{Value, json};

#[derive(Default)]
struct ConcurrencyState {
    in_flight: AtomicUsize,
    max_in_flight: AtomicUsize,
}

impl ConcurrencyState {
    fn enter(&self) {
        let current = self.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
        let mut max_seen = self.max_in_flight.load(Ordering::SeqCst);
        while current > max_seen {
            match self.max_in_flight.compare_exchange(
                max_seen,
                current,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => break,
                Err(next) => max_seen = next,
            }
        }
    }

    fn exit(&self) {
        self.in_flight.fetch_sub(1, Ordering::SeqCst);
    }

    fn max_seen(&self) -> usize {
        self.max_in_flight.load(Ordering::SeqCst)
    }
}

struct SleepTool {
    name: String,
    delay: Duration,
    safe: bool,
    state: Arc<ConcurrencyState>,
}

impl SleepTool {
    fn new(
        name: impl Into<String>,
        delay: Duration,
        safe: bool,
        state: Arc<ConcurrencyState>,
    ) -> Self {
        Self {
            name: name.into(),
            delay,
            safe,
            state,
        }
    }
}

#[async_trait]
impl Tool for SleepTool {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        "Sleep for a fixed duration."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "label": { "type": "string" }
            },
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        self.state.enter();
        tokio::time::sleep(self.delay).await;
        self.state.exit();
        Ok(json!({
            "ok": true,
            "tool": self.name,
            "label": args.get("label").and_then(Value::as_str).unwrap_or("")
        }))
    }

    fn concurrency_safe(&self) -> bool {
        self.safe
    }
}

struct ScriptedProvider {
    tool_calls: Vec<ToolCall>,
    calls: AtomicUsize,
    last_messages: Mutex<Vec<Message>>,
}

impl ScriptedProvider {
    fn new(tool_calls: Vec<ToolCall>) -> Self {
        Self {
            tool_calls,
            calls: AtomicUsize::new(0),
            last_messages: Mutex::new(Vec::new()),
        }
    }

    fn last_tool_message_ids(&self) -> Vec<String> {
        self.last_messages
            .lock()
            .expect("provider messages lock poisoned")
            .iter()
            .filter_map(|message| match message {
                Message::Tool { tool_call_id, .. } => Some(tool_call_id.clone()),
                _ => None,
            })
            .collect()
    }
}

#[async_trait]
impl LlmProvider for ScriptedProvider {
    async fn chat(
        &self,
        _model: &str,
        messages: &[Message],
        _tools: &[Value],
    ) -> Result<ChatResponse> {
        *self
            .last_messages
            .lock()
            .expect("provider messages lock poisoned") = messages.to_vec();

        let call_index = self.calls.fetch_add(1, Ordering::SeqCst);
        let tool_calls = if call_index == 0 {
            self.tool_calls.clone()
        } else {
            Vec::new()
        };
        let content = if tool_calls.is_empty() {
            Some("done".to_owned())
        } else {
            None
        };
        Ok(ChatResponse {
            content,
            tool_calls,
            usage: Usage::default(),
        })
    }

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        HashMap::new()
    }
}

struct ProviderHandle {
    inner: Arc<ScriptedProvider>,
}

impl ProviderHandle {
    fn new(inner: Arc<ScriptedProvider>) -> Self {
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

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        self.inner.retries_by_status()
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn safe_tools_run_concurrently() -> Result<()> {
    let state = Arc::new(ConcurrencyState::default());
    let provider = Arc::new(ScriptedProvider::new(vec![
        tool_call("call_0", "safe", "a"),
        tool_call("call_1", "safe", "b"),
        tool_call("call_2", "safe", "c"),
    ]));
    let agent = Agent::with_tools(
        make_config(),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(SleepTool::new(
            "safe",
            Duration::from_millis(200),
            true,
            Arc::clone(&state),
        ))],
    );

    let started = Instant::now();
    let result = agent.run("run safe tools", 4).await?;
    let elapsed = started.elapsed();

    assert!(result.completed);
    assert!(
        elapsed < Duration::from_millis(500),
        "safe tools should complete in one sleep window, got {elapsed:?}"
    );
    assert!(
        state.max_seen() >= 2,
        "safe tools should overlap, max in-flight was {}",
        state.max_seen()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn unsafe_tools_run_serially() -> Result<()> {
    let state = Arc::new(ConcurrencyState::default());
    let provider = Arc::new(ScriptedProvider::new(vec![
        tool_call("call_0", "unsafe", "a"),
        tool_call("call_1", "unsafe", "b"),
        tool_call("call_2", "unsafe", "c"),
    ]));
    let agent = Agent::with_tools(
        make_config(),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(SleepTool::new(
            "unsafe",
            Duration::from_millis(100),
            false,
            Arc::clone(&state),
        ))],
    );

    let started = Instant::now();
    let result = agent.run("run unsafe tools", 4).await?;
    let elapsed = started.elapsed();

    assert!(result.completed);
    assert!(
        elapsed >= Duration::from_millis(280),
        "unsafe tools should run serially, got {elapsed:?}"
    );
    assert_eq!(state.max_seen(), 1);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn mixed_preserves_tool_message_order() -> Result<()> {
    let safe_state = Arc::new(ConcurrencyState::default());
    let unsafe_state = Arc::new(ConcurrencyState::default());
    let provider = Arc::new(ScriptedProvider::new(vec![
        tool_call("call_0", "safe", "a"),
        tool_call("call_1", "unsafe", "b"),
        tool_call("call_2", "safe", "c"),
        tool_call("call_3", "safe", "d"),
    ]));
    let agent = Agent::with_tools(
        make_config(),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![
            Box::new(SleepTool::new(
                "safe",
                Duration::from_millis(80),
                true,
                Arc::clone(&safe_state),
            )),
            Box::new(SleepTool::new(
                "unsafe",
                Duration::from_millis(20),
                false,
                Arc::clone(&unsafe_state),
            )),
        ],
    );

    let result = agent.run("run mixed tools", 4).await?;

    assert!(result.completed);
    assert_eq!(
        provider.last_tool_message_ids(),
        vec!["call_0", "call_1", "call_2", "call_3"]
    );
    Ok(())
}

fn tool_call(id: &str, name: &str, label: &str) -> ToolCall {
    ToolCall {
        id: id.to_owned(),
        name: name.to_owned(),
        args: json!({ "label": label }),
    }
}

fn make_config() -> Config {
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
        bash_permission: BashPermissionConfig::default(),
        provider_max_retries: 5,
        provider_retry_base_ms: 1_000,
        final_check_enabled: false,
        max_tool_result_chars: 4_000,
        max_history_chars: 200_000,
        pricing: BTreeMap::new(),
        cost_guard: CostGuardConfig::default(),
        providers: BTreeMap::new(),
    }
}
