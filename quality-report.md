# Quality Report

Date: 2026-04-15 | Commit: 8c10c8a | Reviewer: GPT-5 Codex

## Score: 7.7 / 10 (Grade B)

| # | Dimension | Score | Grade | Evidence |
|---|-----------|-------|-------|----------|
| 1 | Build Health | 10 | A | `cargo check --workspace` and `cargo clippy --workspace -- -D warnings` both passed with 0 errors and 0 warnings. |
| 2 | File Granularity | 8 | B | Exact scorecard check found 1 prod file over 500 lines: `src/nf-runtime/web/js/scene-bundle.js` at 735 lines. |
| 3 | Naming | 10 | A | `ls src/` shows 10/10 top-level modules use the `nf-` prefix consistently. |
| 4 | Code Hygiene | 0 | F | JS scan found `var=74`, `console.log=0`, `TODO/FIXME=2` across `src/nf-runtime/web`, `src/nf-core`, and `src/nf-cli/src`; `lint-all.sh` fails this gate. |
| 5 | Safety | 8 | B | Raw grep found 5 `unsafe` hits without inline `SAFETY`, but 4 are test-only and the remaining prod hit is an attribute in `src/nf-publish/src/main.rs`; sampled prod unsafe blocks were documented. |
| 6 | Test Coverage | 8 | B | `cargo test --workspace` passed cleanly; 369 unit/integration/smoke tests plus doc-tests completed with 0 failures, but no formal coverage metric is present. |
| 7 | Module Cohesion | 6 | C | Per-crate code volume is mostly below 10k lines, but `nf-cli` is ~11,938 lines while the next largest crates stay under 9,635. |
| 8 | Dependency Direction | 10 | A | Workspace crate graph is acyclic: `nf-shell-mac -> nf-bridge -> nf-recorder`, and `nf-source` depends downward on `nf-align`/`nf-cut`/`nf-download`/`nf-transcribe`/`nf-cut-core`; `lint-all.sh` also passed scene cross-import checks. |
| 9 | Interface Contract | 6 | C | External `pub` surface is small in `nf-bridge` (7) and `nf-guide` (6), but broad in `nf-source` (73), `nf-recorder` (56), and `nf-tts` (51), so API windows are not uniformly minimal. |
| 10 | Understandability | 10 | A | 16 crate `CLAUDE.md` files were present and all were <=27 lines. |
| 11 | Operability | 10 | A | `node src/nf-cli/bin/nextframe.js --help` completed successfully and documents timeline, scene, pipeline, source, and app workflows with fix guidance. |
| 12 | Verifiability | 4 | D | `bash scripts/lint-all.sh` ran in 1.78s, but failed on prod file size and JS `var` usage, so automated verification exists and is fast but not green. |
| 13 | Debuggability | 8 | B | Error handling is strong in `nf-bridge`, `nf-cli`, and `nf-shell-mac` with 379 `Fix:` occurrences, but some paths still omit remediation, e.g. `src/nf-source/transcribe/src/audio.rs:31` and `src/nf-core/engine/render.js:59`. |
| 14 | Standards Coverage | 10 | A | `spec/standards/` contains 14 files, exceeding the 11-file A threshold. |
| 15 | Comment Quality | 8 | B | Sampled files such as `src/nf-guide/src/lib.rs`, `src/nf-core/engine/render.js`, and `src/nf-shell-mac/src/webview.rs` use clear English module headers and why-comments, though this was sample-based rather than exhaustive. |

## Findings

### P0 — Blocks Release
- `src/nf-runtime/web/js/scene-bundle.js:1` — 735-line production file under `src/` violates the 500-line cap and causes the prod-file-size lint gate to fail.
- `src/nf-core/engine/build-runtime.js:29` — representative of 74 remaining `var` declarations across audited JS paths, causing the JS hygiene lint gate to fail.

### P1 — Must Fix
- `src/nf-source/transcribe/src/audio.rs:31` — `bail!` error path lacks a `Fix:` hint, which breaks the otherwise strong error-remediation pattern.
- `src/nf-core/engine/render.js:59` — thrown runtime error omits remediation guidance, leaving a debug dead end compared with CLI and bridge surfaces.
- `nf-cli` exceeds the module-cohesion threshold at roughly 11.9k lines, increasing maintenance cost and audit surface area.

### P2 — Nice to Have
- `nf-source`, `nf-recorder`, and `nf-tts` expose wider public Rust APIs than the tighter `nf-bridge`/`nf-guide` pattern.
- The single oversized `scene-bundle.js` appears generated; moving or regenerating it outside tracked production source would reduce false pressure on file-size rules.

## Top 5 Recommendations
1. Remove or isolate the 74 `var` usages in audited JS paths, or explicitly exclude generated JS from the hygiene gate if that is the intended policy.
2. Move `src/nf-runtime/web/js/scene-bundle.js` out of production source or split/regenerate it so prod files stay under 500 lines.
3. Break `nf-cli` into smaller command or engine modules to bring crate size under the 10k cohesion target.
4. Normalize remaining error paths so all user-facing failures include a `Fix:` hint, starting with `nf-source` transcription helpers and `nf-core` runtime throws.
5. Review the public APIs of `nf-source`, `nf-recorder`, and `nf-tts` and convert nonessential exports to `pub(crate)` or narrower re-export windows.

## Trend
Previous: N/A | Delta: N/A
