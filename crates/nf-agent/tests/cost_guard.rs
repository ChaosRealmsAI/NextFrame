#![allow(clippy::expect_used, clippy::panic)]

use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::Result;
use async_trait::async_trait;
use log::{LevelFilter, Metadata, Record};
use nf_agent::{
    Agent, BashPermissionConfig, ChatResponse, Config, CostGuardConfig, LlmProvider, Message,
    ProviderConfig, SkillRegistry, SystemPrompt, Tool, ToolCall, Usage,
};
use serde_json::{Value, json};

static TEST_LOGGER: TestLogger = TestLogger {
    records: Mutex::new(Vec::new()),
};
static COST_GUARD_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LOGGER_INIT: std::sync::Once = std::sync::Once::new();

struct TestLogger {
    records: Mutex<Vec<String>>,
}

impl TestLogger {
    fn init() {
        LOGGER_INIT.call_once(|| {
            log::set_logger(&TEST_LOGGER).expect("test logger should install");
            log::set_max_level(LevelFilter::Info);
        });
    }

    fn clear(&self) {
        self.records
            .lock()
            .expect("test logger lock poisoned")
            .clear();
    }

    fn count_containing(&self, needle: &str) -> usize {
        self.records
            .lock()
            .expect("test logger lock poisoned")
            .iter()
            .filter(|record| record.contains(needle))
            .count()
    }
}

impl log::Log for TestLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Info
    }

    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            self.records
                .lock()
                .expect("test logger lock poisoned")
                .push(format!("{}: {}", record.level(), record.args()));
        }
    }

    fn flush(&self) {}
}

struct CostProvider {
    tool_rounds: usize,
    usage: Usage,
    call_count: AtomicUsize,
}

impl CostProvider {
    fn new(tool_rounds: usize, usage: Usage) -> Self {
        Self {
            tool_rounds,
            usage,
            call_count: AtomicUsize::new(0),
        }
    }

    fn calls(&self) -> usize {
        self.call_count.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl LlmProvider for CostProvider {
    async fn chat(
        &self,
        _model: &str,
        _messages: &[Message],
        _tools: &[Value],
    ) -> Result<ChatResponse> {
        let call_index = self.call_count.fetch_add(1, Ordering::SeqCst);
        let tool_calls = if call_index < self.tool_rounds {
            vec![ToolCall {
                id: format!("call_{call_index}"),
                name: "spin".to_owned(),
                args: json!({}),
            }]
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
            usage: self.usage,
        })
    }

    fn retries_by_status(&self) -> HashMap<u16, u32> {
        HashMap::new()
    }
}

struct ProviderHandle {
    inner: Arc<CostProvider>,
}

impl ProviderHandle {
    fn new(inner: Arc<CostProvider>) -> Self {
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

struct SpinTool;

#[async_trait]
impl Tool for SpinTool {
    fn name(&self) -> &str {
        "spin"
    }

    fn description(&self) -> &str {
        "Advance one cost guard test loop."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        })
    }

    async fn call(&self, _args: Value) -> Result<Value> {
        Ok(json!({ "ok": true }))
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn warn_threshold_logged_once() -> Result<()> {
    let _guard = COST_GUARD_TEST_LOCK.lock().await;
    TestLogger::init();
    TEST_LOGGER.clear();

    let provider = Arc::new(CostProvider::new(3, burn_usage()));
    let agent = Agent::with_tools(
        make_config(10.0, 0.10, 100.0),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(SpinTool)],
    );

    let result = agent.run("burn a few iterations", 10).await?;

    assert!(result.completed);
    assert_eq!(provider.calls(), 4);
    assert_eq!(TEST_LOGGER.count_containing("cost warning:"), 1);
    assert!((result.stats.peak_cost_usd - 0.8).abs() < f64::EPSILON);
    assert!(!result.exceeded_budget);
    assert_eq!(result.budget_hit_usd, None);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hard_stop_kicks_in() -> Result<()> {
    let _guard = COST_GUARD_TEST_LOCK.lock().await;
    TestLogger::init();
    TEST_LOGGER.clear();

    let provider = Arc::new(CostProvider::new(0, burn_usage()));
    let agent = Agent::with_tools(
        make_config(100.0, 0.10, 0.50),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(SpinTool)],
    );

    let result = agent.run("stop on budget", 10).await?;

    assert!(!result.completed);
    assert_eq!(result.iters, 1);
    assert_eq!(provider.calls(), 1);
    assert!(result.exceeded_budget);
    assert_eq!(result.budget_hit_usd, Some(2.0));
    assert!((result.stats.peak_cost_usd - 2.0).abs() < f64::EPSILON);
    assert_eq!(result.final_text, None);
    assert_eq!(TEST_LOGGER.count_containing("cost hard stop:"), 1);
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn no_guard_when_thresholds_high() -> Result<()> {
    let _guard = COST_GUARD_TEST_LOCK.lock().await;
    TestLogger::init();
    TEST_LOGGER.clear();

    let provider = Arc::new(CostProvider::new(0, burn_usage()));
    let agent = Agent::with_tools(
        make_config(10.0, 100.0, 100.0),
        SkillRegistry::default(),
        Box::new(ProviderHandle::new(Arc::clone(&provider))),
        vec![Box::new(SpinTool)],
    );

    let result = agent.run("finish normally", 10).await?;

    assert!(result.completed);
    assert_eq!(result.final_text.as_deref(), Some("done"));
    assert!(!result.exceeded_budget);
    assert_eq!(result.budget_hit_usd, None);
    assert!((result.stats.peak_cost_usd - 0.2).abs() < f64::EPSILON);
    assert_eq!(TEST_LOGGER.count_containing("cost warning:"), 0);
    assert_eq!(TEST_LOGGER.count_containing("cost hard stop:"), 0);
    Ok(())
}

fn make_config(rate_per_million: f64, warn_usd: f64, hard_stop_usd: f64) -> Config {
    let mut pricing = BTreeMap::new();
    pricing.insert(
        "mock-model".to_owned(),
        [rate_per_million, rate_per_million],
    );

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
        cost_guard: CostGuardConfig {
            warn_usd,
            hard_stop_usd,
        },
        providers: BTreeMap::new(),
    }
}

fn burn_usage() -> Usage {
    Usage {
        prompt_tokens: 10_000,
        completion_tokens: 10_000,
        context_bytes: 0,
        peak_cost_usd: 0.0,
    }
}
