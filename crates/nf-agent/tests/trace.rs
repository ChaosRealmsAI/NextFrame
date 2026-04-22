#![allow(clippy::expect_used, clippy::panic)]

use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Result;
use async_trait::async_trait;
use nf_agent::{
    Agent, BashPermissionConfig, ChatResponse, Config, CostGuardConfig, LlmProvider, Message,
    ProviderConfig, SkillRegistry, SystemPrompt, Tool, ToolCall, TraceConfig, Usage,
};
use serde_json::{Value, json};

struct TempWorkspace {
    path: PathBuf,
}

impl TempWorkspace {
    fn new(prefix: &str) -> Result<Self> {
        let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
        let path = std::env::temp_dir().join(format!("{prefix}-{}-{millis}", std::process::id()));
        fs::create_dir_all(&path)?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

struct ScriptedProvider {
    responses: Mutex<Vec<ChatResponse>>,
    fallback: ChatResponse,
}

impl ScriptedProvider {
    fn new(mut responses: Vec<ChatResponse>, fallback: ChatResponse) -> Self {
        responses.reverse();
        Self {
            responses: Mutex::new(responses),
            fallback,
        }
    }
}

#[async_trait]
impl LlmProvider for ScriptedProvider {
    async fn chat(
        &self,
        _model: &str,
        _messages: &[Message],
        _tools: &[Value],
    ) -> Result<ChatResponse> {
        let mut responses = self
            .responses
            .lock()
            .expect("scripted provider lock poisoned");
        Ok(responses.pop().unwrap_or_else(|| self.fallback.clone()))
    }

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        HashMap::new()
    }
}

struct EchoTool;

#[async_trait]
impl Tool for EchoTool {
    fn name(&self) -> &str {
        "echo"
    }

    fn description(&self) -> &str {
        "Return the supplied JSON payload."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "label": { "type": "string" }
            },
            "required": ["label"],
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        Ok(json!({
            "ok": true,
            "echo": args,
        }))
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn trace_writes_jsonl_events() -> Result<()> {
    let temp = TempWorkspace::new("nf-agent-trace-basic")?;
    let trace_path = temp.path().join("run.jsonl");
    let agent = trace_agent(Some(trace_path.clone()), 1);

    let result = agent.run("trace one tool", 5).await?;

    assert!(result.completed);
    let events = read_trace_events(&trace_path)?;
    assert!(events.iter().all(|event| event.get("t").is_some()));
    assert!(events.iter().any(|event| event["event"] == "tool_call"));
    assert!(events.iter().any(|event| event["event"] == "final"));

    let tool_event = events
        .iter()
        .find(|event| event["event"] == "tool_call")
        .expect("tool_call trace event should exist");
    assert_eq!(tool_event["name"], "echo");
    assert_eq!(tool_event["args"]["label"], "round-0");
    assert_eq!(tool_event["result"]["ok"], true);
    assert!(tool_event.get("duration_ms").is_some());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn trace_none_no_file() -> Result<()> {
    let temp = TempWorkspace::new("nf-agent-trace-none")?;
    let unused_trace_path = temp.path().join("should-not-exist.jsonl");
    let agent = trace_agent(None, 0);

    let result = agent.run("finish without trace", 3).await?;

    assert!(result.completed);
    assert!(!unused_trace_path.exists());
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn trace_append_across_iters() -> Result<()> {
    let temp = TempWorkspace::new("nf-agent-trace-append")?;
    let trace_path = temp.path().join("nested").join("run.jsonl");
    let tool_rounds = 3;
    let agent = trace_agent(Some(trace_path.clone()), tool_rounds);

    let result = agent.run("trace repeated tools", 10).await?;

    assert!(result.completed);
    assert_eq!(result.iters, tool_rounds + 1);
    let events = read_trace_events(&trace_path)?;
    let tool_events = events
        .iter()
        .filter(|event| event["event"] == "tool_call")
        .count();
    let final_events = events
        .iter()
        .filter(|event| event["event"] == "final")
        .count();
    assert_eq!(tool_events, tool_rounds);
    assert_eq!(final_events, 1);
    assert!(events.len() > result.iters);
    Ok(())
}

fn trace_agent(trace_path: Option<PathBuf>, tool_rounds: usize) -> Agent {
    let responses = (0..tool_rounds)
        .map(|index| {
            mock_chat(
                None,
                vec![ToolCall {
                    id: format!("call_{index}"),
                    name: "echo".to_owned(),
                    args: json!({ "label": format!("round-{index}") }),
                }],
            )
        })
        .chain(std::iter::once(mock_chat(
            Some("done".to_owned()),
            Vec::new(),
        )))
        .collect::<Vec<_>>();
    let fallback = mock_chat(Some("done".to_owned()), Vec::new());
    Agent::with_tools(
        make_config(trace_path),
        SkillRegistry::default(),
        Box::new(ScriptedProvider::new(responses, fallback)),
        vec![Box::new(EchoTool)],
    )
}

fn make_config(trace_path: Option<PathBuf>) -> Config {
    let mut pricing = BTreeMap::new();
    pricing.insert("mock-model".to_owned(), [1.0, 1.0]);

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
        pricing,
        cost_guard: CostGuardConfig::default(),
        trace: TraceConfig {
            path: trace_path.map(|path| path.display().to_string()),
        },
        providers: BTreeMap::new(),
    }
}

fn mock_chat(content: Option<String>, tool_calls: Vec<ToolCall>) -> ChatResponse {
    ChatResponse {
        content,
        tool_calls,
        usage: Usage {
            prompt_tokens: 10,
            completion_tokens: 5,
            context_bytes: 0,
            peak_cost_usd: 0.0,
        },
    }
}

fn read_trace_events(path: &Path) -> Result<Vec<Value>> {
    let content = fs::read_to_string(path)?;
    content
        .lines()
        .map(|line| Ok(serde_json::from_str(line)?))
        .collect()
}
