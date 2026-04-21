# W2 Report · CRUD 5 Families T-05~T-09

## Scope Completed

- Added `nf-shell` CRUD handlers:
  - `ProjectsOpHandler` for list/show/create/rename/archive/delete plus `projects episodes` and `projects clips` aliases.
  - `EpisodesOpHandler` for list/show/create/rename/archive/delete.
  - `ClipsOpHandler` for list/show/create/update/delete.
  - `AnchorsOpHandler` for list/set/unset with reference rejection.
  - `LogOpHandler` for tail/show/create.
- Added `ComposeOpHandler` routing across the five handler families.
- Wired `nf-shell` main to serve IPC requests through `ComposeOpHandler`.
- Replaced W-1 CLI CRUD stubs with IPC-backed command dispatch for projects, episodes, clips, anchors, and log.
- Preserved v0.2 anchor expression behavior: clip `start` and `end` are stored as the original strings and are not evaluated.

## Handler LOC + Tests

| Handler | File | LOC | Unit tests |
| --- | --- | ---: | ---: |
| ProjectsOpHandler | `crates/nf-shell/src/handlers/projects.rs` | 293 | 2 |
| EpisodesOpHandler | `crates/nf-shell/src/handlers/episodes.rs` | 211 | 2 |
| ClipsOpHandler | `crates/nf-shell/src/handlers/clips.rs` | 313 | 2 |
| AnchorsOpHandler | `crates/nf-shell/src/handlers/anchors.rs` | 168 | 2 |
| LogOpHandler | `crates/nf-shell/src/handlers/log.rs` | 204 | 2 |
| Compose/shared helpers | `crates/nf-shell/src/handlers/mod.rs` | 291 | covered by handler tests |

## Verification

- `cargo fmt --all --check`
- `cargo check --workspace` · zero warnings
- `cargo clippy --workspace --all-targets -- -D warnings` · zero warnings
- `cargo test --workspace --lib` · 14 tests passed

## Notes / Pitfalls

- `Storage` only exposes registry/project/episode load/save. Archive/delete/list support is implemented in handlers with scoped filesystem operations around the existing JSON layout, while load/save still goes through the `Storage` trait.
- `nf-cli` now parses structured shell errors from IPC so shell exit codes 5/6/7/8 are preserved instead of being collapsed into socket failures.
- `clips update` only changes fields explicitly passed. Optional CLI values serialize as `null`, so the handler treats `effects: null` as absent.
- Anchor unset checks both `start` and `end` strings with substring matching and returns exit 8 with the required `nf clips update 先改 start/end` hint when referenced.
- Log timestamps are generated as UTC ISO strings with a small std-only formatter to avoid adding dependencies.
- No W-3 app/window/webview scope was implemented.
- No blocker exceeded 15 minutes.
- No git commit was created.
