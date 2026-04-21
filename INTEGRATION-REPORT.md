# NextFrame v0.2 Integration Report

Date: 2026-04-21
Worktree: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration`
Branch: `v0.2-integration`

## Merge Summary

Commands run:

```sh
git merge v0.2-W2-ally --no-ff -m "merge W-2 CRUD handlers"
```

Output:

```text
Already up to date.
```

W-2 was already present as merge commit `eabccd61`.

```sh
git merge v0.2-W3-ally --no-ff -m "merge W-3 app shell"
```

Conflicts:

```text
Auto-merging crates/nf-shell/src/handlers/mod.rs
CONFLICT (add/add): Merge conflict in crates/nf-shell/src/handlers/mod.rs
Auto-merging crates/nf-shell/src/ipc_server.rs
Auto-merging crates/nf-shell/src/lib.rs
Auto-merging crates/nf-shell/src/main.rs
CONFLICT (content): Merge conflict in crates/nf-shell/src/main.rs
Automatic merge failed; fix conflicts and then commit the result.
```

Resolution:

- `crates/nf-shell/src/handlers/mod.rs`: kept W-2 CRUD compose implementation and added `pub mod app;`.
- `crates/nf-shell/src/main.rs`: kept W-3 Tao event loop/window manager structure and created one `ComposeOpHandler` for IPC.
- `crates/nf-shell/src/ipc_server.rs`: changed `spawn_server_thread(proxy, handler)` so CRUD ops are handled directly and app ops are sent through `EventLoopProxy<UserEvent>`.
- App handler IPC errors now emit JSON error records compatible with W-2 CLI remote error parsing.

W-3 merge commit: `d76e16ba`.

```sh
git merge v0.2-W4-ally --no-ff -m "merge W-4 Web Components"
```

Conflicts:

```text
Auto-merging Cargo.lock
CONFLICT (content): Merge conflict in Cargo.lock
Auto-merging Cargo.toml
CONFLICT (content): Merge conflict in Cargo.toml
Automatic merge failed; fix conflicts and then commit the result.
```

Resolution:

- Kept W-4 frontend files under `frontend/nf-components`.
- Kept v0.2 Rust workspace metadata and dependencies.
- Dropped out-of-scope Rust workspace additions from W-4's ancestry (`nf-tts`, `nf-source`, `nf-guide`, `videocut-*`, and `tests/fixtures`) because the v0.2 integration prompt requires no new Rust dependencies and no v0.3 scope.
- Kept W-3 stub webview HTML for this integration, matching the prompt note that W-4 UI loading can remain for later W-5 wiring.

W-4 merge commit: `c6f37901`.

## IPC Architecture

`nf-shell` now has two IPC paths:

- CRUD ops: `projects-*`, `episodes-*`, `clips-*`, `anchors-*`, `log-*` plus dot-form prefixes route directly to `ComposeOpHandler.handle(req)` in the Tokio IPC server thread.
- App ops: `open-window`, `close-window`, `state-query`, `click-sim`, `screenshot`, `devtools-query`, `quit` route through `EventLoopProxy<UserEvent>` and are handled on the Tao main event loop.

Unknown ops return `NfError::ValidationFailed("unknown op: ...")` as a structured IPC error.

## Validation

```sh
cargo fmt --all --check
```

Output: no output, exit 0.

```sh
cargo check --workspace
```

Output:

```text
    Checking nf-shell v0.2.0 (/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration/crates/nf-shell)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.32s
```

```sh
cargo clippy --workspace --all-targets -- -D warnings
```

Output:

```text
    Checking nf-shell v0.2.0 (/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration/crates/nf-shell)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.43s
```

```sh
cargo test --workspace --lib
```

Output summary:

```text
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

running 18 tests
...
test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.15s
```

Frontend:

```sh
npm ci
```

Output:

```text
added 9 packages in 785ms
```

```sh
npm run check && npm run build && npm run test
```

Output:

```text
> @nextframe/nf-components@0.1.1 check
> tsc --noEmit

> @nextframe/nf-components@0.1.1 build
> esbuild src/index.ts --bundle --format=esm --outfile=dist/index.js

  dist/index.js  43.7kb

Done in 3ms

> @nextframe/nf-components@0.1.1 test
> node test-w4.mjs

W4 playwright checks passed; pixel diff 0.511%
```

`frontend/nf-components/dist/index.js` was generated and is ignored by `frontend/nf-components/.gitignore`.

## E2E

Built binaries:

```sh
cargo build --bins
```

Output:

```text
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.40s
```

Started shell with isolated runtime storage:

```sh
mkdir -p tmp/e2e-home tmp
HOME="$PWD/tmp/e2e-home" ./target/debug/nf-shell
```

Ready output:

```json
{"event":"ready","bin":"nf-shell","version":"0.2.0","sock":"/tmp/nextframe-502.sock"}
```

CRUD path:

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf projects create --slug=demo --name='Demo'
```

Output:

```json
{"created":"2026-04-21T08:39:38Z","name":"Demo","path":"/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration/tmp/e2e-home/.nextframe/demo/project.json","slug":"demo"}
```

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf episodes create --project=demo --slug=ep-01 --name='一' --duration=10
```

Output:

```json
{"created":"2026-04-21T08:39:48Z","duration":10.0,"name":"一","path":"/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-integration/tmp/e2e-home/.nextframe/demo/episodes/ep-01.json","slug":"ep-01"}
```

App proxy path:

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf open --project=demo --episode=ep-01
```

Output:

```json
{"episode":"ep-01","pid":39374,"project":"demo","window_id":"w-1"}
```

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf ps --project=demo --episode=ep-01
```

Output:

```json
{"count":1,"windows":[{"episode":"ep-01","focused":true,"project":"demo","window_id":"w-1"}]}
```

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf screenshot --project=demo --episode=ep-01 --out=tmp/i.png
file tmp/i.png
```

Output:

```text
{"bytes":5185363,"format":"png","height":900,"out":"tmp/i.png","region":"full","width":1440,"window_id":"w-1",...}
tmp/i.png: PNG image data, 1440 x 900, 8-bit/color RGBA, non-interlaced
```

```sh
HOME="$PWD/tmp/e2e-home" ./target/debug/nf quit
```

Output:

```json
{"quit":true}
```

## Post-Merge Notes

No commits were made after the merge commits.

Uncommitted working-tree changes intentionally remain:

- `crates/nf-shell/src/handlers/app.rs`: test assertion updated for JSON IPC error records and clippy `expect_used`.
- `crates/nf-shell/src/window_manager.rs`: test updated to avoid clippy `expect_used`.
- `INTEGRATION-REPORT.md`: this report.

Ignored generated artifacts from validation/e2e:

- `target/`
- `frontend/nf-components/node_modules/`
- `frontend/nf-components/dist/`
- `tmp/` including `tmp/i.png`
