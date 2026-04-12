# 08 · Contract-First Architecture

**Status:** v0.1.0 released. Contracts are enforced by runtime guards and tests, not by convention alone.

## What is contract-first in v0.1.0

Every public surface is machine-checked:
- scene registry import-time guards
- layer graph tests
- error-shape tests
- extension registry tests
- file size cap tests
- runtime guard checks

The architecture test suite currently has **6 tests and all 6 pass**.

## Current contract counts

| Surface | Current size |
|---|---|
| scene render functions | 33 registered |
| public scenes | 32 |
| CLI subcommands | 25 |
| AI tools | 12 |
| node tests | 74 |
| architecture tests | 6 |

## Runtime-enforced scene contract

The scene registry now enforces the contract at import time.

关键点：
- `src/scenes/_contract.js` 导出 `assertSceneContract`
- `src/scenes/index.js` 在构造每个 registry entry 时调用它
- `assertNoDuplicateIds` 在 registry 构建时检查 scene id 唯一性

所以 scene contract 不是“文档约定”，而是运行时硬约束：
- 缺 `META`
- 缺 `render`
- 缺 `describe`
- `META.params` 结构不对
- duplicate scene id

都会在导入 registry 时直接失败。

## Module contract table

| Module | Public API | Invariant |
|---|---|---|
| `src/engine/time.js` | `resolveTimeline`, `resolveExpression` | never throws to caller; 0.1s quantization; cycle / dangling-ref detection |
| `src/engine/validate.js` | `validateTimeline` | structured `{ok,error?,errors[],warnings[],hints[]}` |
| `src/engine/render.js` | `renderAt` | frame-pure render path; resolve-before-render; deterministic compositing |
| `src/engine/describe.js` | `describeAt` | active clip metadata must match render reality |
| `src/scenes/index.js` | `REGISTRY`, `SCENE_IDS`, `getScene`, `listScenes` | scene contract + no duplicate ids |
| `src/timeline/ops.js` | clip/marker mutation functions | pure timeline transforms; structured errors |
| `src/targets/napi-canvas.js` | `renderFramePNG` | still-frame PNG export |
| `src/targets/ffmpeg-mp4.js` | `exportMP4`, `muxMP4Audio` | ffmpeg-backed mp4 export |
| `src/cli/*.js` | `run(argv, ctx) -> exit code` | no throw on public path |
| `src/ai/tools.js` | `TOOLS` map | 12 structured tools; `apply_patch` validates |

## Architecture test suite

`test/architecture.test.js` currently enforces:

| Test | Meaning |
|---|---|
| `arch-1` | layer dependency graph |
| `arch-2` | scene contract |
| `arch-3` | error contract |
| `arch-4` | extension registry |
| `arch-5` | file size cap |
| `arch-6` | runtime guard behavior |

验证命令：

```bash
cd nextframe-cli
node --test test/architecture.test.js
```

## T1–T8 status

The lint-phase task list from the earlier document is now complete.

| Deliverable | Status |
|---|---|
| T1 `test/architecture.test.js` | ✅ |
| T2 scene contract runtime guard | ✅ |
| T3 error contract runtime assertions | ✅ |
| T4 JSDoc typedefs | ✅ |
| T5 scene extension example | ✅ |
| T6 remaining BDD modules | ✅ |
| T7 smoke test upgrade | ✅ |
| T8 `nextframe-cli/CONTRIBUTING.md` | ✅ |

## BDD / verify contract status

BDD assets under `spec/cockpit-app/bdd/` now exist for:
- `scene-contract`
- `safety-gates`
- `ai-tools`
- `cli-render`
- `cli-timeline-ops`
- `cli-assets`
- `cli-export`

Across those JSON assets, the number of objects marked `status=done` or `verify=pass` is **45**.

## Extension protocol that is actually live

### Add a scene

1. Add `src/scenes/<id>.js`
2. Import it in `src/scenes/index.js`
3. Add `META_TABLE[<id>]`
4. Add `RENDER_FNS[<id>]`
5. Let `assertSceneContract` and tests validate it

### Add a CLI verb

1. Add `src/cli/<verb>.js`
2. Register it in `bin/nextframe.js`
3. Update help text
4. Add tests / BDD entries

### Add an AI tool

1. Add entry in `src/ai/tools.js`
2. Provide `schema`
3. Keep return shape structured
4. Extend tests

## One important v0.1 correction

Earlier prose described scene count, CLI count, and AI tool count as much smaller than reality. The contract-first view must now use the real shipped counts:
- 33 registered scene render functions
- 32 public scenes
- 25 CLI subcommands
- 12 AI tools

## One sentence

In v0.1.0, “contract-first” is no longer a plan. It is the combination of `assertSceneContract`, `assertNoDuplicateIds`, `test/architecture.test.js`, and the 74-test suite that already gates the codebase.
