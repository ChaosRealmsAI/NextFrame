# nf-agent

`nf-agent` is a project-agnostic Rust agent loop engine. The engine reads its system prompt, provider settings, pricing, and skills from external files. It does not compile project-specific workflows into Rust code.

## Quickstart

Create a config file:

```toml
[provider]
base_url = "https://api.siliconflow.cn/v1"
api_key_env = "SILICONFLOW_API_KEY"
model = "Pro/MiniMaxAI/MiniMax-M2.5"

[system_prompt]
text = "You are a general agent. Use Bash, Read, and load_skill when useful."

[pricing]
"Pro/MiniMaxAI/MiniMax-M2.5" = [0.80, 2.40]
```

Create skills under `skills/<name>/SKILL.md`:

```markdown
# research · Research workflow

Read project files, gather facts, and summarize with references.
```

Run:

```sh
export SILICONFLOW_API_KEY=...
cargo run -p nf-agent -- "summarize this repo" --config crates/nf-agent/nf-agent.toml.example --skills-dir crates/nf-agent/skills
```

## CLI

```text
nf-agent <task> [--config PATH] [--skills-dir PATH] [--max-iters N] [--log PATH]
```

Exit codes:

- `0`: the agent produced a final assistant message without tool calls.
- `1`: `--max-iters` was reached.
- `2`: config, API, permissions, or runtime error.

## Builtin Tools

- `Bash`: runs `bash -c <command>`, captures stdout/stderr/exit code, and times out after `bash_timeout_sec` seconds (120 by default).
- `Read`: reads a text file with UTF-8 replacement and returns at most 10,000 characters by default.
- `load_skill`: loads an external `SKILL.md` by name. The allowed names are generated from the skills directory at startup.

The `clips` and `audio` skills included in this crate are examples only. They can be deleted or replaced without changing the engine.
