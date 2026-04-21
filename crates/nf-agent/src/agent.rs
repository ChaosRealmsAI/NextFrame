use std::sync::Arc;

use anyhow::{Result, anyhow};
use serde_json::{Value, json};

use crate::{
    config::Config,
    provider::{LlmProvider, Message, ToolCall, Usage},
    skill::SkillRegistry,
    tool::{BashTool, LoadSkillTool, ReadTool, Tool, openai_tool_schema},
};

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
    pub final_text: Option<String>,
}

impl Agent {
    pub fn new(config: Config, skills: SkillRegistry, provider: Box<dyn LlmProvider>) -> Self {
        let skills = Arc::new(skills);
        let tools: Vec<Box<dyn Tool>> = vec![
            Box::new(BashTool),
            Box::new(ReadTool),
            Box::new(LoadSkillTool::new(Arc::clone(&skills))),
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

        for iter in 0..max_iters {
            let resp = self
                .provider
                .chat(self.config.model(), &messages, &self.tool_schemas())
                .await?;
            stats.add(&resp.usage);

            if resp.tool_calls.is_empty() {
                log::info!("FINAL: {}", resp.content.as_deref().unwrap_or(""));
                return Ok(AgentResult {
                    completed: true,
                    iters: iter + 1,
                    stats,
                    final_text: resp.content,
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
                messages.push(Message::tool(tool_call.id.clone(), result));
            }
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
