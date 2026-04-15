# nf-guide — Rust CLI for pipeline recipe guides.

## Trigger Conditions
- Read this file before editing `src/nf-guide/`.
- Read this file when changing recipe discovery, CLI argument handling, or markdown output behavior.

## Build
cargo check -p nf-guide

## Test
cargo run -p nf-guide
cargo run -p nf-guide -- produce
cargo run -p nf-guide -- produce ratio

## Structure
- `src/lib.rs`: recipe discovery, JSON loading, markdown lookup.
- `src/main.rs`: small CLI that prints guide or step markdown to stdout.
- `recipes/`: filesystem recipe assets loaded from `NF_GUIDE_RECIPES` or the repo default path.

## Common Mistakes
- Adding dependencies beyond `serde` and `serde_json`.
- Baking in repo-specific absolute paths instead of using the configured recipes dir.
- Returning formatted help text from the library instead of raw recipe content.

## Maintenance Mandate (产品定位)

**nf-guide 是后续 AI 做事的唯一指南入口。维护好它 = 维护未来 AI 的能力。**

3 级渐进披露：
- L1: `cargo run -p nf-guide` — list recipes
- L2: `cargo run -p nf-guide -- {recipe}` — recipe overview
- L3: `cargo run -p nf-guide -- {recipe} {step}` — step prompt

加新 recipe / 改产品行为时：
- 新 recipe → 放 `recipes/{name}/` + 写 `recipe.json` + `guide.md` + `NN-step.md`，L1 自动发现
- 改 CLI / 改契约 / 改流程 → 同步更新对应 step.md，**绝不允许提示词滞后于代码**
- 发现新坑 → 加到 recipe 的 `pitfalls.md`
- 不要在仓库其他地方再造平行的状态机或提示词目录（已删除的 `src/nf-cli/src/commands/render/states/` 就是反例）
