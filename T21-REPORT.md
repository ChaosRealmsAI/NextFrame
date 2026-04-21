# T-21 Report · sonnet blind harness

Date: 2026-04-21

## Deliverables

- `scripts/blind-test-sonnet.sh`
- `scripts/prepare-blind-sandbox.sh`
- `scripts/cleanup-blind-sandbox.sh`
- `Makefile` target: `blind-test`

## What the harness does

- Creates a unique `tmp/sonnet-sandbox-<session>` directory per run.
- Copies `target/release/nf` and `target/release/nf-shell` into the sandbox.
- Starts `nf-shell` with `HOME=$SANDBOX/home`, so CLI storage lands under `$SANDBOX/home/.nextframe`.
- Waits for the shell ready JSON and socket before dispatching the AI.
- Runs `ally run --backend <backend> --model <model>` with a blind prompt.
- Judges success only when all are true:
  - log contains `SUMMARY: PASS`
  - `tmp/sonnet.png` exists and is a PNG
  - registry/project/episode JSON files exist under sandbox storage
- Cleans up the shell process, IPC socket, and sandbox on exit.

## Self-test

### Fake pass

Command:

```bash
./scripts/blind-test-sonnet.sh fake-pass gpt-5-mini t21-fake-pass
```

Log excerpt:

```text
[2026-04-21 16:51:30] judge summary=1 png=1 json=1
[2026-04-21 16:51:30] BLIND TEST PASS session=t21-fake-pass log=.../tmp/blind-t21-fake-pass.log
```

### Fake fail

Command:

```bash
./scripts/blind-test-sonnet.sh fake-fail gpt-5-mini t21-fake-fail-final
```

Log excerpt:

```text
stderr={"error":"not found","hint":"create the episode first"}
exit=1
SUMMARY: FAIL
[2026-04-21 16:54:10] judge summary=0 png=0 json=0
[2026-04-21 16:54:10] BLIND TEST FAIL session=t21-fake-fail-final log=.../tmp/blind-t21-fake-fail-final.log
```

### Makefile target

Command:

```bash
make blind-test BACKEND=fake-pass MODEL=gpt-5-mini
```

Result:

```text
Finished `release` profile [optimized] target(s) in 0.10s
[2026-04-21 16:54:05] judge summary=1 png=1 json=1
[2026-04-21 16:54:05] BLIND TEST PASS session=blind-gpt-5-mini-1776761645 ...
```

### Real backend smoke

Command:

```bash
./scripts/blind-test-sonnet.sh codex gpt-5-mini t21-real-codex-gpt-5-mini
```

Result: harness ran and failed correctly because the local `ally` backend rejected the model before the blind task could start.

```text
{"error":true,"code":"MODEL_NOT_IN_BACKEND","message":"Model 'gpt-5-mini' is not available in backend 'codex'","suggestion":"ally models  # to see available models per backend"}
[2026-04-21 16:53:36] ally exit=2
[2026-04-21 16:53:36] judge summary=0 png=0 json=0
[2026-04-21 16:53:36] BLIND TEST FAIL session=t21-real-codex-gpt-5-mini ...
```

Cleanup confirmed: no `tmp/sonnet-sandbox-*` directories remained and `/tmp/nextframe-502.sock` was removed after cleanup.

## Boundary handling

- Bash 3.2 compatible: no associative arrays, no `wait -n`, no bash 4-only features.
- Portable timeout: implemented with a watchdog process instead of relying on GNU `timeout`, which is not present by default on macOS.
- Socket safety: prepare refuses to start if `/tmp/nextframe-$UID.sock` is actively owned by another process.
- Stale socket cleanup: inactive socket files are removed before starting `nf-shell`.
- Failure cleanup: prepare and blind-test both clean partial sandboxes unless `KEEP_BLIND_SANDBOX=1`.
- Parameterized backend/model: `./scripts/blind-test-sonnet.sh <backend> <model> [session]`, and `make blind-test BACKEND=<backend> MODEL=<model>`.
- Fake modes: `fake-pass` and `fake-fail` exercise the same judge path without requiring a live AI backend.

## Notes

- Release build passed with `cargo build --release --workspace`.
- A prepare/cleanup smoke passed after normalizing relative sandbox paths to absolute paths.
- No git commit was made.
