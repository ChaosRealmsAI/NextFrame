# nf-guide — Rust CLI for pipeline flow guides.

## Trigger Conditions
- Read this file before editing `src/nf-guide/`.
- Read this file when changing flow discovery, CLI argument handling, or markdown output behavior.

## Build
cargo check -p nf-guide

## Test
cargo run -p nf-guide
cargo run -p nf-guide -- produce
cargo run -p nf-guide -- produce ratio

## Structure
- `src/lib.rs`: flow discovery, JSON loading, markdown lookup.
- `src/main.rs`: small CLI that prints guide or step markdown to stdout.
- `flows/`: filesystem flow assets loaded from `NF_GUIDE_FLOWS` or the repo default path. (Legacy env name `NF_GUIDE_RECIPES` still honored as fallback; directory was formerly `recipes/`.)

## Common Mistakes
- Adding dependencies beyond `serde` and `serde_json`.
- Baking in repo-specific absolute paths instead of using the configured flows dir.
- Returning formatted help text from the library instead of raw flow content.

## Maintenance Mandate (产品定位)

**nf-guide 是后续 AI 做事的唯一指南入口。维护好它 = 维护未来 AI 的能力。**

3 级渐进披露：
- L1: `cargo run -p nf-guide` — 列出所有流程 (flows)
- L2: `cargo run -p nf-guide -- {flow}` — flow overview
- L3: `cargo run -p nf-guide -- {flow} {step}` — step prompt

加新 flow / 改产品行为时：
- 新 flow → 放 `flows/{name}/` + 写 `flow.json` + `guide.md` + `NN-step.md`，L1 自动发现
- 改 CLI / 改契约 / 改流程 → 同步更新对应 step.md，**绝不允许提示词滞后于代码**
- 发现新坑 → 加到 flow 的 `pitfalls.md`
- 不要在仓库其他地方再造平行的状态机或提示词目录（已删除的 `src/nf-cli/src/commands/render/states/` 就是反例）

术语：v1.0 起"recipe"统一改名为"flow"。目录 `src/nf-guide/recipes/` → `src/nf-guide/flows/`；每个 flow 下的 `recipe.json` → `flow.json`；CLI 文字使用"flow / 流程"。binary 名保留 `nf-guide`（不改）。
