# T20 Report · nf doctor

## Implemented

- Added `crates/nf-cli/src/commands/doctor.rs` with 9 required checks:
  `rust_toolchain`, `cargo`, `node`, `npm`, `nf_shell`, `socket`,
  `home_nextframe`, `macos`, `display`.
- Default output is pretty JSON; `--human` prints a compact readable report.
- Exit behavior:
  - `0` when no checks fail.
  - `9` when any required check fails.
  - warnings are represented in summary/overall logic and do not block.
- Added focused doctor unit coverage:
  - `check_rust_toolchain_parse`
  - `summary_counts`
  - `overall_priority`
- Added `crates/nf-cli/src/lib.rs` so `cargo test --workspace --lib` runs nf-cli unit tests.
- Registered `commands::doctor::run` from `nf` main and updated help text for `nf doctor [--human]`.
- Added `nf-shell --version` / `-V` early return so doctor can safely probe release shell binaries.

## Validation

- `cargo fmt --all -- --check` passed.
- `cargo check --workspace` passed with zero warnings.
- `cargo clippy --workspace --all-targets -- -D warnings` passed.
- `cargo test --workspace --lib` passed: 22 tests total, including 3 doctor tests.
- `cargo test --workspace` passed: 22 tests total.
- `cargo build -p nf-cli` passed.
- `./target/debug/nf doctor --help` passed and shows `--human`.
- `./target/debug/nf doctor` produced JSON and exited `9` in this worktree because `./target/release/nf-shell` is not present.
- `./target/debug/nf doctor --human` produced human output and exited `9` for the same `nf_shell` failure.
- `HOME=/dev/null ./target/debug/nf doctor --human` exited `9` and reported `home_nextframe` failure.

## Notes

- No new dependencies were added.
- Doctor checks avoid config/file writes. Directory writability is checked from metadata/permissions.
- External command probes are bounded by a short timeout to avoid hanging on unexpected binaries.
- No commit was created.
