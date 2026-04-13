# Architecture Manifesto

This document records technical constraints that should be treated as stable unless the code is deliberately reworked across the affected modules.

## Immutable Constraints

### 1. SSML text is escaped exactly once

The only supported escape point is `build_ssml` in `src/backend/edge/ssml.rs`.

- `split_text` measures escaped size but returns raw chunks.
- `src/backend/edge/ws.rs` passes those raw chunks into `build_ssml`.
- Double-escaping would corrupt XML entities and break spoken text.

If text sanitation changes, keep the contract: raw text in, escaped SSML out, one time.

### 2. Batch failures must propagate to process exit

Batch mode must not report success when any job failed.

- `src/queue/scheduler.rs` records failures in `ManifestFailure`.
- `src/cli/batch.rs` writes `manifest.json` and summary output first.
- `ensure_batch_success` then returns an error when `manifest.errors > 0`.

This behavior is required so automation can trust the exit code without parsing the manifest.

### 3. Per-job backend selection is authoritative in batch mode

The backend attached to each `Job` must override the batch default.

- `src/queue/job.rs` resolves backend with `Job::backend_name`.
- `src/cli/batch.rs` uses that helper during dry runs and backend instance creation.
- `src/queue/scheduler.rs` uses the same helper when dispatching the actual synthesis call and when recording the manifest entry or failure.

Do not collapse batch execution to a single backend unless the job schema changes explicitly.

### 4. Voice resolution is config-driven before fallback defaults

Voice resolution must remain predictable and centralized around `src/config.rs`.

- aliases are resolved by `VoxConfig::resolve_voice`
- configured defaults are exposed by `VoxConfig::configured_voice`
- synth/play use config before language auto-detection
- batch uses per-job voice, then CLI default voice, then configured voice, then `DEFAULT_VOICE`

Any change to this chain is user-visible and must be treated as a compatibility change.

### 5. Backend defaults come from config, not scattered literals

Backend selection flows through `VoxConfig::resolve_backend` in `src/config.rs`, then through `create_backend` in `src/backend/mod.rs`.

- config chooses the preferred backend name
- the factory decides whether that backend is implemented
- unsupported names fail early

This keeps backend selection consistent across `synth`, `batch`, `play`, and `voices`.

### 6. Cache identity includes text and prosody parameters

`src/cache/mod.rs` defines cache identity as:

- text
- voice
- rate
- pitch
- volume

This means audio with different prosody settings must not share a cache entry even when the text matches.

### 7. Batch output must remain inspectable after partial failure

`manifest.json` is written regardless of whether jobs failed. This is a deliberate contract:

- successful jobs still produce output files and manifest entries
- failed jobs still produce manifest failure records
- callers get both forensic data and a failing exit status

Changing this would reduce debuggability for automation.

### 8. Backend concurrency is declared by the backend implementation

The scheduler in `src/queue/scheduler.rs` enforces concurrency using `Backend::max_concurrency()`.

- orchestration code does not hardcode Edge limits
- each backend can opt into a different safe parallelism level

This must remain a backend-owned constraint, not a CLI heuristic.

## Practical Reading Of The Codebase

- The code is architected for multiple backends, but only `edge` is currently constructible in `src/backend/mod.rs`.
- `src/cli/preview.rs` is intentionally special-case and bypasses config/backend selection by constructing `EdgeBackend` directly.
- Boundary metadata is optional. SRT output is therefore conditional on both `--srt` and non-empty boundary data.

These constraints define the current shape of the system and should be referenced before changing backend, batch, or text-processing behavior.
