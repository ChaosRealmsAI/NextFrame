# v0.1 Tech Decision

## Decision

Build `vox` as a Rust CLI with asynchronous networking and a shared backend abstraction.

Core choices from [Cargo.toml](/Users/Zhuanz/boom/vox/Cargo.toml):

- Rust `2021` edition for a single static binary and predictable CLI distribution.
- `tokio` for async runtime, task orchestration, and process spawning.
- `tokio-tungstenite` for the Edge websocket synthesis channel in [src/backend/edge/ws.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ws.rs).
- `reqwest` for HTTP interactions such as voice listing today and HTTP-style backend expansion later.
- `clap` for the command surface in [src/cli/mod.rs](/Users/Zhuanz/boom/vox/src/cli/mod.rs).
- `serde`, `serde_json`, and `toml` for jobs, events, manifest output, and config persistence.
- `blake3` for fast cache keys in [src/cache/mod.rs](/Users/Zhuanz/boom/vox/src/cache/mod.rs).
- `sha2`, `uuid`, and `chrono` for Edge request signing, connection identifiers, and timestamp handling.

## Why This Stack

### Rust

- The project is IO-heavy but still benefits from strict typing around CLI args, config, job schema, and backend contracts.
- A Rust binary fits the goal of an agent-friendly local CLI with minimal runtime dependencies.

### Tokio

- Batch scheduling in [src/queue/scheduler.rs](/Users/Zhuanz/boom/vox/src/queue/scheduler.rs) needs async tasks plus per-backend concurrency controls.
- `play` and `preview` use Tokio process management for local audio playback.

### tokio-tungstenite

- The Edge backend is websocket-based for synthesis, so native websocket support is required.
- Keeping websocket transport in one module isolates provider-specific framing from the rest of the CLI.

### reqwest

- Voice enumeration already uses HTTP in [src/backend/edge/ws.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ws.rs).
- `reqwest` is also the obvious fit for a future OpenAI-style HTTP backend, which keeps the multi-backend story coherent without changing the CLI surface.

### Serde + TOML + JSON

- Batch input, events, and manifests are naturally machine-readable.
- User config is easier to inspect and edit as TOML under the path from [src/config.rs](/Users/Zhuanz/boom/vox/src/config.rs).

## Architectural Consequences

- Backend expansion should add new modules under `src/backend/` and register them in [src/backend/mod.rs](/Users/Zhuanz/boom/vox/src/backend/mod.rs), not branch provider logic across CLI commands.
- The current implementation ships only `edge`, but the selected stack already supports a second backend without rewriting batch orchestration, cache semantics, or output handling.
- Network integration tests remain limited because the live TTS path depends on an external service; v0.1 relies on unit coverage plus manual smoke tests documented in [spec/forge/dev-tools.md](/Users/Zhuanz/boom/vox/spec/forge/dev-tools.md).
