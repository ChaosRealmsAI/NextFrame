use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};

use anyhow::{Context, Result, anyhow};
use serde_json::{Value, json};

use crate::{
    config::Config,
    provider::{LlmProvider, Message, ToolCall, Usage, truncate_middle},
    skill::SkillRegistry,
    tool::{BashTool, LoadSkillTool, ReadTool, Tool, VerifyOutputsTool, openai_tool_schema},
};

const FINAL_CHECK_MAX_RETRIES: usize = 3;
const COMPACTED_TOOL_RESULT_CHARS: usize = 512;

pub struct Agent {
    provider: Box<dyn LlmProvider>,
    tools: Vec<Box<dyn Tool>>,
    skills: Arc<SkillRegistry>,
    config: Config,
}

#[derive(Debug, Clone)]
pub struct AgentResult {
    pub completed: bool,
    pub iters: usize,
    pub stats: Usage,
    pub retries_by_status: HashMap<u16, u32>,
    pub final_text: Option<String>,
    pub forced_stop_missing_outputs: Vec<String>,
}

impl Agent {
    pub fn new(config: Config, skills: SkillRegistry, provider: Box<dyn LlmProvider>) -> Self {
        let skills = Arc::new(skills);
        let workspace = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let tools: Vec<Box<dyn Tool>> = vec![
            Box::new(BashTool::new(config.bash_timeout_sec)),
            Box::new(ReadTool),
            Box::new(LoadSkillTool::new(Arc::clone(&skills))),
            Box::new(VerifyOutputsTool::new(Arc::clone(&skills), workspace)),
        ];
        Self {
            provider,
            tools,
            skills,
            config,
        }
    }

    pub fn with_tools(
        config: Config,
        skills: SkillRegistry,
        provider: Box<dyn LlmProvider>,
        tools: Vec<Box<dyn Tool>>,
    ) -> Self {
        Self {
            provider,
            tools,
            skills: Arc::new(skills),
            config,
        }
    }

    pub fn skill_count(&self) -> usize {
        self.skills.names().len()
    }

    pub async fn run(&self, task: &str, max_iters: usize) -> Result<AgentResult> {
        let mut messages = vec![
            Message::system(self.config.system_prompt().to_owned()),
            Message::user(task.to_owned()),
        ];
        let mut stats = Usage::default();
        let mut active_skills = HashSet::new();
        let mut final_check_retries = 0;

        for iter in 0..max_iters {
            let resp = self
                .provider
                .chat(self.config.model(), &messages, &self.tool_schemas())
                .await?;
            stats.add(&resp.usage);

            if resp.tool_calls.is_empty() {
                if self.config.final_check_enabled {
                    let missing = self.check_active_skills_outputs(&active_skills)?;
                    if !missing.is_empty() {
                        if final_check_retries < FINAL_CHECK_MAX_RETRIES {
                            final_check_retries += 1;
                            log::warn!(
                                "FAKE FINAL blocked ({final_check_retries}/{FINAL_CHECK_MAX_RETRIES}) · missing: {:?}",
                                missing
                            );
                            messages.push(Message::Assistant {
                                content: resp.content.clone(),
                                tool_calls: Vec::new(),
                            });
                            messages.push(Message::user(format!(
                                "你声明完成但产物缺失: {:?} · 继续调 tool 完成 · 不要 FINAL",
                                missing
                            )));
                            stats.context_bytes = compact_history_if_needed(
                                &mut messages,
                                self.config.max_history_chars,
                                COMPACTED_TOOL_RESULT_CHARS,
                            );
                            continue;
                        }

                        log::warn!(
                            "forced stop after {FINAL_CHECK_MAX_RETRIES} FINAL checks · missing: {:?}",
                            missing
                        );
                        stats.context_bytes = estimate_history_bytes(&messages);
                        return Ok(AgentResult {
                            completed: false,
                            iters: iter + 1,
                            stats,
                            retries_by_status: self.provider.retries_by_status(),
                            final_text: resp.content,
                            forced_stop_missing_outputs: missing,
                        });
                    }
                }
                log::info!("FINAL: {}", resp.content.as_deref().unwrap_or(""));
                stats.context_bytes = estimate_history_bytes(&messages);
                return Ok(AgentResult {
                    completed: true,
                    iters: iter + 1,
                    stats,
                    retries_by_status: self.provider.retries_by_status(),
                    final_text: resp.content,
                    forced_stop_missing_outputs: Vec::new(),
                });
            }

            messages.push(Message::assistant_with_tools(
                resp.content.clone(),
                resp.tool_calls.clone(),
            ));

            for tool_call in &resp.tool_calls {
                log::info!("-> tool: {}({})", tool_call.name, tool_call.args);
                let result = self.dispatch(tool_call).await;
                log::info!(
                    "<- result: {}",
                    truncate(&serde_json::to_string(&result).unwrap_or_else(|err| {
                        json!({"ok": false, "error": err.to_string()}).to_string()
                    }))
                );
                if tool_call.name == "load_skill" {
                    if let Some(skill_name) = extract_successful_loaded_skill_name(&result) {
                        active_skills.insert(skill_name);
                    }
                }
                messages.push(Message::tool(
                    tool_call.id.clone(),
                    result,
                    self.config.max_tool_result_chars,
                ));
            }

            stats.context_bytes = compact_history_if_needed(
                &mut messages,
                self.config.max_history_chars,
                COMPACTED_TOOL_RESULT_CHARS,
            );
        }

        Err(anyhow!("max iters reached"))
    }

    pub fn tool_schemas(&self) -> Vec<Value> {
        self.tools
            .iter()
            .map(|tool| openai_tool_schema(tool.as_ref()))
            .collect()
    }

    async fn dispatch(&self, tool_call: &ToolCall) -> Value {
        let Some(tool) = self.tools.iter().find(|tool| tool.name() == tool_call.name) else {
            return json!({
                "ok": false,
                "error": format!("unknown tool: {}", tool_call.name)
            });
        };

        match tool.call(tool_call.args.clone()).await {
            Ok(value) => value,
            Err(err) => json!({
                "ok": false,
                "error": err.to_string()
            }),
        }
    }

    fn check_active_skills_outputs(&self, active_skills: &HashSet<String>) -> Result<Vec<String>> {
        let workspace = std::env::current_dir().context("failed to resolve current workspace")?;
        let mut missing = Vec::new();

        for skill_name in active_skills {
            let Some(skill) = self.skills.get(skill_name) else {
                continue;
            };
            for pattern in &skill.expected_outputs {
                let abs_pattern = workspace.join(pattern);
                let Some(pattern_text) = abs_pattern.to_str() else {
                    missing.push(format!("{skill_name}: {pattern}"));
                    continue;
                };
                let has_match = glob::glob(pattern_text)
                    .with_context(|| {
                        format!("invalid glob pattern for skill {skill_name}: {pattern}")
                    })?
                    .any(|path| path.is_ok());
                if !has_match {
                    missing.push(format!("{skill_name}: {pattern}"));
                }
            }
        }

        missing.sort();
        Ok(missing)
    }
}

fn extract_successful_loaded_skill_name(value: &Value) -> Option<String> {
    if value.get("ok").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    value
        .get("skill")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn compact_history_if_needed(
    messages: &mut [Message],
    max_history_chars: usize,
    compacted_tool_result_chars: usize,
) -> usize {
    let total = estimate_history_bytes(messages);
    if total <= max_history_chars {
        return total;
    }

    compact_old_tool_results(messages, compacted_tool_result_chars);
    let compacted = estimate_history_bytes(messages);
    log::info!("context compacted · bytes now = {compacted}");
    compacted
}

fn estimate_history_bytes(messages: &[Message]) -> usize {
    serde_json::to_vec(messages)
        .map(|bytes| bytes.len())
        .unwrap_or_else(|_| {
            messages
                .iter()
                .map(|message| match message {
                    Message::System { content }
                    | Message::User { content }
                    | Message::Tool { content, .. } => content.len(),
                    Message::Assistant {
                        content,
                        tool_calls,
                    } => {
                        content.as_deref().map_or(0, str::len)
                            + tool_calls
                                .iter()
                                .map(|tool_call| {
                                    tool_call.id.len()
                                        + tool_call.function.name.len()
                                        + tool_call.function.arguments.len()
                                })
                                .sum::<usize>()
                    }
                })
                .sum()
        })
}

fn compact_old_tool_results(messages: &mut [Message], max_chars: usize) {
    let mut remaining_to_skip = messages
        .iter()
        .filter(|message| matches!(message, Message::Tool { .. }))
        .count()
        .saturating_sub(3);

    for message in messages.iter_mut() {
        if remaining_to_skip == 0 {
            break;
        }

        if let Message::Tool { content, .. } = message {
            *content = truncate_middle(content, max_chars);
            remaining_to_skip = remaining_to_skip.saturating_sub(1);
        }
    }
}

fn truncate(value: &str) -> String {
    const MAX: usize = 200;
    let mut iter = value.chars();
    let truncated = iter.by_ref().take(MAX).collect::<String>();
    if iter.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}
