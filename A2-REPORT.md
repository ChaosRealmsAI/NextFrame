# A2 Report - log auto-hook

## Files Changed

- `crates/nf-shell/src/handlers/mod.rs`
  - Added a `JsonStorage` handle to `ComposeOpHandler`.
  - Calls `log::append_auto(&storage, req)` after a CRUD handler returns `Ok(Some(_))`.
  - Failed ops and unknown ops do not write logs.

- `crates/nf-shell/src/handlers/log.rs`
  - Added centralized auto-log middleware helpers.
  - Skips read operations: `*.list`, `*.show`, `projects.episodes`, `projects.clips`, and all `log.*`.
  - Writes auto entries with `actor`, `op`, `project`, `episode`, `slug`, `desc`, `cli`, `status`, `time`, and `at`.
  - Keeps `log-create`, `log-tail`, and `log-show` behavior unchanged.
  - Stores project-level writes in existing episode logs when episodes exist.
  - Defers project-level writes to `<project>/.pending-log.json` when no episode exists yet, then drains them into the first `episodes.create` target.
  - Added tests:
    - `auto_log_on_project_create`
    - `no_auto_log_on_read`

- `crates/nf-cli/src/commands/episodes.rs`
- `crates/nf-cli/src/commands/mod.rs`
  - Made `nf episodes create --name` optional for the requested e2e command shape.
  - If omitted, the CLI sends the episode slug as the name.

## Middleware Notes

- Hook location: `ComposeOpHandler::handle`, after a concrete handler successfully handles the request.
- Recursion guard: `log-*` and `log.*` are read/skipped by `is_read_op`, so auto-log never logs log operations.
- Read guard: list/show/tail and project-scoped read aliases do not append entries.
- Op names are normalized from IPC form (`projects-create`) to report form (`projects.create`) in the log entry.

## Verification

```text
cargo check --workspace
PASS, zero warnings

cargo clippy --workspace -- -D warnings
PASS, zero warnings

cargo test --workspace --lib
PASS, 20 passed

cargo build --release --bins
PASS
```

## E2E

Commands run with `HOME="$PWD/tmp/test"`:

```sh
./target/release/nf-shell &
./target/release/nf projects create --slug=t --name='T'
./target/release/nf episodes create --project=t --slug=e1 --duration=10
./target/release/nf clips create --project=t --episode=e1 --slug=c1 --label=L --track=scene --start=0 --end=5
./target/release/nf log tail --project=t --episode=e1 --limit=10
./target/release/nf quit
```

`log tail` output:

```json
[
  {
    "actor": "AI",
    "at": "2026-04-21T10:02:25Z",
    "cli": "nf clips create",
    "desc": "clips.create succeeded",
    "episode": "e1",
    "id": "lg-3",
    "op": "clips.create",
    "project": "t",
    "slug": "c1",
    "status": "ok",
    "time": "2026-04-21T10:02:25Z"
  },
  {
    "actor": "AI",
    "at": "2026-04-21T10:02:25Z",
    "cli": "nf episodes create",
    "desc": "episodes.create succeeded",
    "episode": "e1",
    "id": "lg-2",
    "op": "episodes.create",
    "project": "t",
    "slug": "e1",
    "status": "ok",
    "time": "2026-04-21T10:02:25Z"
  },
  {
    "actor": "AI",
    "at": "2026-04-21T10:02:25Z",
    "cli": "nf projects create",
    "desc": "projects.create succeeded",
    "episode": "e1",
    "id": "lg-1",
    "op": "projects.create",
    "project": "t",
    "slug": "t",
    "status": "ok",
    "time": "2026-04-21T10:02:25Z"
  }
]
```

AI log count: 3.

No git commit was made.
