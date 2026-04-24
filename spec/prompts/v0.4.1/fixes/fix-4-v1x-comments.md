# Fix-4 · v1.x 历史注释批量清理

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 根因(D4 P1)

9 文件 doc comment 首句引用 v1.14/v1.15/v1.44/v1.55/v1.56/v1.67 历史版本. crate 实际是 v0.4.1 · 新读者看 "v1.14 T-09 / T-18 subcommand refactor" 会误判仍在 v1.x 线.

## 修法

**原则**: doc 首句改成**当前语义** · 历史引用降级成单独注释行(不占首句).

**文件清单**(行 1 附近的 doc):

| 文件 | 当前(首句) | 改后(首句) |
|---|---|---|
| `crates/nf-recorder/src/cli.rs` | `//! CLI parser for nf-recorder · v1.14 T-09 / T-18 subcommand refactor.` | `//! CLI parser for nf-recorder · clap subcommands for record / snapshot / verify.` |
| `crates/nf-recorder/src/export_api.rs` | `//! v1.44 · High-level export API · 从 source.json 直接产 MP4。` | `//! High-level export API · 从 source.json 直接产 MP4。` |
| `crates/nf-recorder/src/orchestrator.rs` | 类似 v1.x | 保语义去版本号 |
| `crates/nf-recorder/src/record_loop.rs` | 类似 | 同 |
| `crates/nf-recorder/src/frame_pool.rs` | 类似 | 同 |
| `crates/nf-recorder/src/events.rs` | 类似 | 同 |
| `crates/nf-recorder/src/pipeline/vt_wrap.rs` | 类似 | 同 |
| `crates/nf-recorder/tests/hevc_encode.rs` | `HEVC integration coverage for v1.67.1 Bug-B / Bug-C fixes.` | `HEVC integration coverage for rate-control + async flush.` |
| `crates/nf-recorder/tests/regression_bug_a.rs` | 类似 | 同 |

**历史引用保留**(降级形式):
- 在 doc 第 2-3 行加 `//! Historical: v1.14 T-09 / T-18 subcommand refactor.` · 单独一行 · 不占首句

**dead_code allow 顺带清**(D4 P1-2):
- `crates/nf-recorder/src/pipeline/mp4_writer.rs:64-67` `width/height` 若无人读就删字段 · 若 callback_refcon 为 FFI lifetime anchor 改 `#[expect(dead_code, reason = "VT callback refcon · FFI lifetime anchor")]`

**frame_pool 规格澄清**(跟 D3 P0-3 相关 · 本 fix 顺带):
- `frame_pool.rs` lib 顶加 `//! Capacity + submission counter · NOT an SPSC pool. True bounded in-flight control 留 v0.5 ADR.`

## 验

```bash
cd crates/nf-recorder
cargo clippy -p nf-recorder --all-targets 2>&1 | tail -5
grep -rn "v1\\.\(13\|14\|44\|55\|56\|67\)" src/ tests/ | grep -v "Historical:" | wc -l  # 应 ~= 0
```

## 禁

- ❌ 改代码逻辑(只改 doc comment 文本)
- ❌ 改 4K patch 实现(保留 · 只改它的描述文本)
