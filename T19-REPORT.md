# T19 Report - nf help self-contained

Date: 2026-04-21

## Scope

- Read `/Users/Zhuanz/bigbang/NextFrame/spec/versions/v0.2/prompts/t19-help-template.md` in full.
- Cross-checked `/Users/Zhuanz/bigbang/NextFrame/spec/contracts/interfaces.json`.
- The prompt title says 27 commands, but the current CLI exposes 38 leaf commands plus 6 parent/top-level help surfaces. I covered the full exposed tree rather than stopping at 27.

## Help Audit

Baseline problem: existing clap help mostly had only usage and bare option names. It was missing self-contained descriptions, parameter semantics, examples, JSON output snippets, and common error hints.

Final smoke audit checked these entries for `Usage:`, `EXAMPLES:`, and `COMMON ERRORS:`:

- `nf`
- app ops: `open`, `ps`, `screenshot`, `click`, `select`, `tab`, `state`, `devtools`, `close`, `quit`, `version`
- project parent and leaves: `projects`, `projects list`, `projects episodes`, `projects clips`, `projects show`, `projects create`, `projects rename`, `projects archive`, `projects delete`
- episode parent and leaves: `episodes`, `episodes list`, `episodes show`, `episodes create`, `episodes rename`, `episodes archive`, `episodes delete`
- clip parent and leaves: `clips`, `clips list`, `clips show`, `clips create`, `clips update`, `clips delete`
- anchor parent and leaves: `anchors`, `anchors list`, `anchors set`, `anchors unset`
- log parent and leaves: `log`, `log tail`, `log show`, `log create`
- helpers: `help`, `doctor`

Result: all checked entries passed.

## Changes

- `crates/nf-cli/src/commands/mod.rs`
  - Added clap `about` / `long_about` text for top-level commands, parent command groups, and every subcommand.
  - Added per-argument `help` and `value_name` annotations.
  - Each command now includes a real usage line, examples, expected JSON snippet, and common errors with hints.

- `crates/nf-cli/src/commands/utility.rs`
  - Changed `nf help <topic>` to reuse the generated clap `--help` for the same command, so `nf help projects create` and `nf projects create --help` stay aligned.
  - Expanded JSON help coverage for exposed command topics.

- `crates/nf-cli/src/errors.rs`
  - Added inline hints to user-facing error details for unknown resources, duplicate slugs, invalid slugs, validation failures, selector/click failures, confirmation failures, and referenced resources.
  - Improved CLI socket failure hint for dev use: start `nf-shell` with `cargo run --bin nf-shell` or check the socket path.

- `crates/nf-shell/src/errors.rs`
  - Mirrored structured error detail improvements for shell-side errors.

- `crates/nf-shell/src/handlers/app.rs`
  - Updated the unit test assertion for the new validation failure detail format.

## Sonnet Blind Self-check

Simulated flow using only:

1. `nf --help`
2. `nf projects --help`
3. `nf projects create --help`

The help text is enough to infer the create command:

```bash
nf projects create --slug=t19-help-self-check --name='T19 Help Self Check'
```

Runtime result in this worktree:

```json
{"error":"socket failed","detail":"IPC socket failed: No such file or directory (os error 2)","hint":"start nf-shell (`cargo run --bin nf-shell` in dev) or check the socket path","exit_code":1}
```

Conclusion: command usage is discoverable from help alone. Actual creation requires a running `nf-shell` IPC server in the current implementation.

## Verification

```bash
cargo check --workspace
```

Result: pass, zero warnings observed.

```bash
cargo test --workspace --lib
```

Result: pass, 18 tests passed.

```bash
cargo build --release --bin nf
```

Result: pass.

Final help audit:

```text
44/44 checked help entries contained Usage, EXAMPLES, and COMMON ERRORS.
```

## Notes

- No dependencies added.
- No git commit made.
- Existing untracked `spec` symlink was present and left untouched.
