# W Workspace Merge Report

Date: 2026-04-21

## Scope

- Base: current `main` worktree at `.worktrees/v0.6.0-299177e4`.
- Overlay source: `.worktrees/v0.5.1-299177e4`.
- Workspace crates: 14 Cargo crates.
- Replaced from v0.5.1: `crates/nf-cli`, `crates/nf-shell`, `crates/nf-engine`, `crates/nf-runtime`, and `frontend/`.
- Preserved from main: `crates/nf-cli/src/commands/karaoke.rs` and `karaoke_template.html`, integrated into the v0.5.1 CLI.

## Cargo / Workspace

- Root `Cargo.toml` remains at workspace package `version = 0.4.0`, `edition = 2024`, `rust-version = 1.86`.
- Added the v0.5.1 workspace dependency set required by the overlaid `nf-cli` and `nf-shell` crates.
- Normalized crate package metadata to inherit workspace `version`, `edition`, and `rust-version`.
- Regenerated `Cargo.lock`.
- Restored `crates/nf-runtime/dist/runtime-iife.js` from main because `nf-recorder` includes it at compile time.

## Karaoke Integration

- Added `pub mod karaoke` in `crates/nf-cli/src/commands/mod.rs`.
- Added `Command::Karaoke(KaraokeArgs)` to the v0.5.1 clap tree.
- Added `KaraokeArgs { episode_dir: PathBuf }`.
- Added main dispatch:
  - `Command::Karaoke(args) => commands::karaoke::run(&args.episode_dir)`
- Adapted the preserved karaoke implementation from main to v0.5.1 `NfError` and `commands::print_json`.
- No feature flag fallback was added.

## Compatibility Fixes

- Fixed Rust 2024 FFI requirement in `nf-recorder` with `unsafe extern "C"`.
- Fixed Clippy `-D warnings` issues across overlaid/main crates:
  - `map_or` simplifications
  - `format!("{e}")` to `e.to_string()`
  - Rust 1.86 MSRV replacement for `is_multiple_of`
  - minor type complexity and collapsible-if issues
  - deprecated AppKit activation warning suppression at the single call site
- Added a small keepalive Tao window in `nf-shell` startup so the app loop has a window before user windows are opened.

## Verification

- `cargo check --workspace`
  - Result: pass, zero warnings.
- `cargo clippy --workspace --all-targets -- -D warnings`
  - Result: pass, zero warnings.
- `cargo test --workspace --lib`
  - Result: pass.
  - Total: 93 passed, 0 failed.
- `cargo build --release --bins`
  - Result: pass.

## E2E

### `nf capture`

Command path used current release binaries:

```sh
./target/release/nf-shell
./target/release/nf projects create --slug=v6-current --name='v0.6 current'
./target/release/nf episodes create --project=v6-current --slug=ep-01 --duration=10
./target/release/nf open --project=v6-current --episode=ep-01
./target/release/nf capture --project=v6-current --episode=ep-01 --out="$PWD/tmp/v6-cap.png"
```

Result:

```text
{"bytes":906633,"height":2024,"out":"/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.6.0-299177e4/tmp/v6-cap.png","width":3104,"window_id":"w-1","window_number":5142}
tmp/v6-cap.png: PNG image data, 3104 x 2024, 8-bit/color RGBA, non-interlaced
```

Artifact:

- `tmp/v6-cap.png`

### `nf karaoke --help`

Result:

```text
Usage: nf karaoke <EPISODE_DIR>

Arguments:
  <EPISODE_DIR>
          Episode directory path containing clips/ and sources/
```

## Notes / v0.6.1 Candidates

- Harden `nf-shell` empty-app lifecycle on macOS. In this environment, running the shell and the first CLI request in one shell pipeline was reliable; cross-command idle launch could leave a stale socket after the app exited.
- Add an explicit CLI/server e2e harness that owns socket cleanup and avoids collisions with older debug `nf-shell` processes.
- Consider unifying `nf-cli` karaoke error envelopes with the older main `CliError` shape if strict backward-compatible JSON error codes are needed.

