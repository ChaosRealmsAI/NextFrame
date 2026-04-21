# W1 Report · Basic Layer T-01~T-04

## Scope Completed

- T-01 `nf-cli` clap dispatcher:
  - Replaced scaffold CLI with `nf` clap command tree.
  - Added command modules: `projects`, `episodes`, `clips`, `anchors`, `log`, `app`, `utility`.
  - Wired 38 leaf commands from `interfaces.json` including the project query aliases; CRUD leaves return structured W-2 `not implemented` errors.
  - Implemented W-1 utility commands: `version`, `help`, `doctor`.

- T-02 IPC NDJSON bidirectional foundation:
  - Added CLI IPC client with socket path `/tmp/nextframe-$UID.sock` on macOS and `${XDG_RUNTIME_DIR:-/tmp}/nextframe-$UID.sock` elsewhere.
  - Added request/response schema `{req_id, op, params}` and `{req_id, ok, data, error}`.
  - Added 10s client timeout, connect/write/read/parse flow, and req_id mismatch detection.
  - Added shell Tokio local-socket server bridge using `interprocess` + per-connection tasks + `EventLoopProxy<UserEvent>` + oneshot ack.
  - Added socket stale cleanup, `SocketGuard` drop cleanup, and ctrlc termination cleanup hook.

- T-03 storage foundation:
  - Added `~/.nextframe` JSON layout types for `registry.json`, `<project>/project.json`, and `<project>/episodes/<ep>.json`.
  - Added `Storage` trait with load/save pairs for registry, project, episode.
  - Added pretty JSON atomic write through temp file + rename + failed-write temp cleanup.
  - Added slug validation with regex `^[a-z][a-z0-9-]{0,63}$`.

- T-04 errors:
  - Added `NfError` in both CLI and shell with structured variants, hints, and exit-code mapping.
  - CLI stderr JSON format: `{error, detail, hint, exit_code}`.
  - Added conversions from `io::Error` and `serde_json::Error`.

## Files Changed

- Workspace/deps:
  - `Cargo.toml`
  - `Cargo.lock`
  - `crates/nf-cli/Cargo.toml`
  - `crates/nf-shell/Cargo.toml`

- `nf-cli` code:
  - `crates/nf-cli/src/main.rs` · 43 LOC
  - `crates/nf-cli/src/ipc_client.rs` · 119 LOC
  - `crates/nf-cli/src/errors.rs` · 161 LOC
  - `crates/nf-cli/src/commands/mod.rs` · 496 LOC
  - `crates/nf-cli/src/commands/app.rs` · 123 LOC
  - `crates/nf-cli/src/commands/projects.rs` · 15 LOC
  - `crates/nf-cli/src/commands/episodes.rs` · 13 LOC
  - `crates/nf-cli/src/commands/clips.rs` · 12 LOC
  - `crates/nf-cli/src/commands/anchors.rs` · 10 LOC
  - `crates/nf-cli/src/commands/log.rs` · 10 LOC
  - `crates/nf-cli/src/commands/utility.rs` · 227 LOC

- `nf-shell` code:
  - `crates/nf-shell/src/lib.rs` · 4 LOC
  - `crates/nf-shell/src/main.rs` · 6 LOC
  - `crates/nf-shell/src/errors.rs` · 106 LOC
  - `crates/nf-shell/src/events.rs` · 31 LOC
  - `crates/nf-shell/src/ipc_server.rs` · 324 LOC
  - `crates/nf-shell/src/storage.rs` · 254 LOC

- Total new/changed Rust source under `crates/nf-cli/src` and `crates/nf-shell/src`: 1954 LOC.

## Verification

- `cargo fmt`: passed.
- `cargo clippy --workspace -- -D warnings`: passed with zero warnings.
- `cargo check --workspace`: passed with zero warnings.
- `cargo test --workspace`: passed.
  - `nf-cli`: 1 test passed.
  - `nf-shell`: 4 tests passed.
  - Workspace total: 5 tests passed.

## Unit Tests Added

- `nf-cli/src/errors.rs`: serializes `NfError` to structured stderr JSON.
- `nf-shell/src/storage.rs`: registry roundtrip.
- `nf-shell/src/storage.rs`: project + episode roundtrip.
- `nf-shell/src/storage.rs`: slug validation.
- `nf-shell/src/ipc_server.rs`: socket cleanup trait removes stale file.

## W-2+ Boundaries Left Intentionally

- CRUD command behavior for projects, episodes, clips, anchors, and log is not implemented; those commands parse but return W-2 structured stubs.
- Window creation, WebView, DOM click/state/screenshot behavior, and real app lifecycle are not implemented; the IPC server only provides the W-1 bridge for W-3 event-loop handling.
- `nf-engine` and `nf-runtime` were not edited.

## Notes / Pitfalls

- Tokio needed `io-util` in addition to the prompt-listed features because the validated P-02 IPC pattern uses `AsyncBufReadExt` and `AsyncWriteExt` for NDJSON.
- Workspace package version was advanced from `0.1.1` to `0.2.0` so `nf version` and `nf doctor` match the v0.2 contract.
- No blocker exceeded 15 minutes.
- No git commit was created.
