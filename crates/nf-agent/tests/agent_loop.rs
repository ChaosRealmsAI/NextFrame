//! Integration tests for the universal agent loop.
//!
//! These exercise the anti-fake-FINAL path end-to-end using a mock LLM
//! provider. They keep the nf-agent engine business-free: patterns come from
//! a skill's frontmatter, the engine only enforces the contract.

#![allow(clippy::expect_used, clippy::unwrap_used, clippy::panic)]

use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use nf_agent::{
    Agent, ChatResponse, Config, LlmProvider, Message, ProviderConfig, SkillRegistry, SystemPrompt,
    ToolCall, Usage, provider::OpenAiToolCall,
};
use serde_json::Value;

struct MockProvider {
    responses: Mutex<Vec<ChatResponse>>,
    call_count: AtomicUsize,
    last_messages: Mutex<Vec<Message>>,
    fallback: ChatResponse,
}

impl MockProvider {
    fn new(scripted: Vec<ChatResponse>, fallback: ChatResponse) -> Self {
        Self {
            responses: Mutex::new(scripted),
            call_count: AtomicUsize::new(0),
            last_messages: Mutex::new(Vec::new()),
            fallback,
        }
    }

    fn calls(&self) -> usize {
        self.call_count.load(Ordering::SeqCst)
    }

    fn last_user_messages(&self) -> Vec<String> {
        self.last_messages
            .lock()
            .expect("mock provider messages lock poisoned")
            .iter()
            .filter_map(|msg| match msg {
                Message::User { content } => Some(content.clone()),
                _ => None,
            })
            .collect()
    }
}

#[async_trait]
impl LlmProvider for MockProvider {
    async fn chat(
        &self,
        _model: &str,
        messages: &[Message],
        _tools: &[Value],
    ) -> Result<ChatResponse> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        let mut stored = self
            .last_messages
            .lock()
            .expect("mock provider messages lock poisoned");
        *stored = messages.to_vec();
        drop(stored);

        let mut queue = self
            .responses
            .lock()
            .expect("mock provider response lock poisoned");
        if let Some(next) = queue.pop() {
            Ok(next)
        } else {
            Ok(self.fallback.clone())
        }
    }
}

fn mock_tool_call(id: &str, name: &str, args: Value) -> ToolCall {
    ToolCall {
        id: id.to_owned(),
        name: name.to_owned(),
        args,
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
        },
    }
}

fn make_config(final_check_enabled: bool) -> Config {
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
        provider_max_retries: 5,
        provider_retry_base_ms: 1_000,
        final_check_enabled,
        max_tool_result_chars: 4_000,
        max_history_chars: 200_000,
        pricing: BTreeMap::new(),
        providers: BTreeMap::new(),
    }
}

fn unique_workspace(prefix: &str) -> Result<PathBuf> {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let pid = std::process::id();
    let workspace = std::env::temp_dir().join(format!("{prefix}-{pid}-{nanos}"));
    fs::create_dir_all(&workspace)?;
    Ok(workspace)
}

/// Creates a skills dir with a single SKILL.md whose expected_outputs glob
/// points inside `workspace`, so the engine's FINAL-check can find them
/// without depending on the process cwd.
fn write_probe_skill(skills_root: &Path, workspace: &Path) -> Result<String> {
    let skill_dir = skills_root.join("probe");
    fs::create_dir_all(&skill_dir)?;
    let abs_pattern = workspace.join("outputs/index.html");
    let pattern_str = abs_pattern
        .to_str()
        .ok_or_else(|| anyhow!("workspace path is not valid utf-8"))?;
    let md = format!(
        "---\nname: probe\ndescription: Probe skill for integration tests\nexpected_outputs:\n  - \"{pattern_str}\"\n---\n\n# probe · integration test skill\n\nBody visible to the agent.\n"
    );
    fs::write(skill_dir.join("SKILL.md"), md)?;
    Ok(pattern_str.to_owned())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fake_final_is_blocked_until_forced_stop() -> Result<()> {
    let workspace = unique_workspace("nf-agent-fake-final")?;
    let skills_root = workspace.join("skills");
    let pattern = write_probe_skill(&skills_root, &workspace)?;
    // Intentionally do NOT create the expected outputs file.

    let load_skill_call = mock_chat(
        None,
        vec![mock_tool_call(
            "call_load",
            "load_skill",
            serde_json::json!({ "name": "probe" }),
        )],
    );
    let final_attempt = mock_chat(Some("任务完成".to_owned()), Vec::new());
    // Responses are popped back-to-front; push newest last.
    let mut scripted = Vec::new();
    // Order of pop: final_attempt, final_attempt, final_attempt, final_attempt, load_skill_call (last).
    for _ in 0..4 {
        scripted.insert(0, final_attempt.clone());
    }
    scripted.insert(0, load_skill_call);
    // Reverse so first response is at the end (because we pop from the back).
    scripted.reverse();

    let provider = MockProvider::new(scripted, final_attempt);
    let calls_ref = std::sync::Arc::new(provider);

    let skills = SkillRegistry::load(&skills_root)?;
    assert_eq!(skills.names(), vec!["probe".to_owned()]);
    let agent = Agent::new(
        make_config(true),
        skills,
        Box::new(ProviderHandle::new(calls_ref.clone())),
    );

    let result = agent.run("run probe skill", 20).await?;
    assert!(!result.completed, "fake FINAL must not be accepted");
    assert_eq!(
        result.forced_stop_missing_outputs,
        vec![format!("probe: {pattern}")]
    );
    let user_messages = calls_ref.last_user_messages();
    assert!(
        user_messages
            .iter()
            .any(|msg| msg.contains("产物") || msg.contains("缺失")),
        "engine must inject a continue message when outputs are missing"
    );
    // 1 load_skill + 1 FINAL attempt + 3 forced retries = 5 provider calls.
    assert!(calls_ref.calls() >= 5);

    fs::remove_dir_all(&workspace).ok();
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn honest_final_passes_when_outputs_present() -> Result<()> {
    let workspace = unique_workspace("nf-agent-honest-final")?;
    let skills_root = workspace.join("skills");
    let _pattern = write_probe_skill(&skills_root, &workspace)?;
    // Pre-seed the expected output so the engine's FINAL check passes.
    fs::create_dir_all(workspace.join("outputs"))?;
    fs::write(workspace.join("outputs/index.html"), "<html>ok</html>")?;

    let load_skill_call = mock_chat(
        None,
        vec![mock_tool_call(
            "call_load",
            "load_skill",
            serde_json::json!({ "name": "probe" }),
        )],
    );
    let done = mock_chat(Some("done".to_owned()), Vec::new());
    let mut scripted = vec![load_skill_call, done.clone()];
    scripted.reverse();

    let provider = MockProvider::new(scripted, done);
    let calls_ref = std::sync::Arc::new(provider);

    let skills = SkillRegistry::load(&skills_root)?;
    let agent = Agent::new(
        make_config(true),
        skills,
        Box::new(ProviderHandle::new(calls_ref.clone())),
    );

    let result = agent.run("run probe skill", 10).await?;
    assert!(
        result.completed,
        "engine should accept FINAL when outputs are present"
    );
    assert!(result.forced_stop_missing_outputs.is_empty());

    fs::remove_dir_all(&workspace).ok();
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn final_check_disabled_short_circuits_missing_outputs() -> Result<()> {
    let workspace = unique_workspace("nf-agent-no-check")?;
    let skills_root = workspace.join("skills");
    let _pattern = write_probe_skill(&skills_root, &workspace)?;

    let load_skill_call = mock_chat(
        None,
        vec![mock_tool_call(
            "call_load",
            "load_skill",
            serde_json::json!({ "name": "probe" }),
        )],
    );
    let done = mock_chat(Some("all set".to_owned()), Vec::new());
    let mut scripted = vec![load_skill_call, done.clone()];
    scripted.reverse();

    let provider = MockProvider::new(scripted, done);
    let calls_ref = std::sync::Arc::new(provider);

    let skills = SkillRegistry::load(&skills_root)?;
    let agent = Agent::new(
        make_config(false),
        skills,
        Box::new(ProviderHandle::new(calls_ref.clone())),
    );

    let result = agent.run("probe", 5).await?;
    assert!(
        result.completed,
        "disabled FINAL check must accept any FINAL"
    );
    assert!(result.forced_stop_missing_outputs.is_empty());

    fs::remove_dir_all(&workspace).ok();
    Ok(())
}

// --- Infra: shared Arc<MockProvider> wrapper that implements LlmProvider ------

struct ProviderHandle {
    inner: std::sync::Arc<MockProvider>,
}

impl ProviderHandle {
    fn new(inner: std::sync::Arc<MockProvider>) -> Self {
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

// --- Silence unused-symbol warnings in test build ------------------------------

#[allow(dead_code)]
fn _compile_hint(_: HashMap<String, String>, _: OpenAiToolCall) {}
