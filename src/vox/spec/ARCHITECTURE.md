# vox Architecture

## Purpose

`vox` is a Rust CLI for text-to-speech synthesis. The crate layout in `src/main.rs`, `src/lib.rs`, and `Cargo.toml` shows three core concerns:

- command dispatch and configuration with `clap`, `serde`, `toml`, and `dirs`
- backend I/O with `tokio`, `reqwest`, `tokio-tungstenite`, `uuid`, `chrono`, and `sha2`
- output management with `blake3`, JSON events, manifest generation, caching, and subtitle generation

The project is multi-backend by interface, but the current factory in `src/backend/mod.rs` only supports the `edge` backend. Unsupported backend names fail early in `create_backend`.

## Module Map

### Entry points

- `src/main.rs`: parses CLI arguments and delegates to `cli::run`.
- `src/lib.rs`: re-exports the top-level library modules for tests and downstream use.

### CLI layer

- `src/cli/mod.rs`: defines the `vox` CLI shape and dispatches subcommands.
- `src/cli/synth.rs`: single-job synthesis path, including stdin/file text loading, config lookup, cache check, backend call, audio write, and optional SRT output.
- `src/cli/batch.rs`: batch ingestion from JSON, default resolution, per-job normalization, backend pool construction, manifest writing, and failure escalation.
- `src/cli/voices.rs`: lists voices from the selected backend.
- `src/cli/play.rs`: synthesizes to a temp MP3 and invokes a local player.
- `src/cli/preview.rs`: Edge-only preview path with built-in sample text.
- `src/cli/concat.rs`: concatenates audio files by byte append.
- `src/cli/config_cmd.rs`: reads and writes user config keys and voice aliases.

### Backend layer

- `src/backend/mod.rs`: owns the `Backend` trait, `SynthParams`, `SynthResult`, `Voice`, `WordBoundary`, and backend factory.
- `src/backend/edge/mod.rs`: Edge backend implementation and backend-specific constants.
- `src/backend/edge/ws.rs`: REST voice discovery, WebSocket synthesis, retry logic, metadata parsing, and audio assembly.
- `src/backend/edge/ssml.rs`: text sanitization, chunk splitting by escaped byte length, and SSML generation.
- `src/backend/edge/drm.rs`: Edge token generation, MUID generation, and server clock-skew correction.

### Queue and job layer

- `src/queue/job.rs`: batch job schema plus helpers for resolved synth params and backend selection.
- `src/queue/scheduler.rs`: concurrent batch execution, cache short-circuiting, per-backend semaphore control, event emission, and manifest population.
- `src/queue/mod.rs`: queue namespace.

### Output layer

- `src/output/event.rs`: NDJSON progress events for agents and other tooling.
- `src/output/manifest.rs`: batch manifest model and `manifest.json` writer.
- `src/output/naming.rs`: deterministic file naming for single and batch modes.
- `src/output/srt.rs`: subtitle generation from word boundaries.
- `src/output/mod.rs`: output namespace.

### Supporting modules

- `src/config.rs`: persistent config file model and resolution helpers.
- `src/cache/mod.rs`: on-disk MP3 cache keyed by content and synthesis parameters.
- `src/lang.rs`: simple script detection for default voice choice.

## Backend System

### Trait design

The abstraction point is `src/backend/mod.rs`:

- `Backend::max_concurrency()` lets each backend declare safe parallelism for batch mode.
- `Backend::list_voices()` returns normalized `Voice` records for CLI listing.
- `Backend::synthesize()` returns raw audio bytes plus optional duration and word-boundary timing.

The scheduler and CLI code only depend on the trait and the shared `SynthParams` / `SynthResult` types. Adding a new backend requires:

1. implementing `Backend`
2. exporting the module under `src/backend/`
3. wiring it into `create_backend`

The design is therefore multi-backend-ready even though the current `create_backend` branch resolves only `"edge"`.

### Edge backend

`src/backend/edge/mod.rs` exposes `EdgeBackend`, with `max_concurrency()` fixed at `3`.

`src/backend/edge/ws.rs` splits the backend into two protocols:

- REST `GET /voices/list` for voice enumeration
- WebSocket `wss://.../edge/v1` for synthesis requests and metadata streaming

The WebSocket flow is:

1. generate connection and authentication headers with helpers from `src/backend/edge/drm.rs`
2. send `speech.config`
3. build SSML with `src/backend/edge/ssml.rs`
4. send the SSML frame
5. stream binary MP3 chunks and parse `Path:audio.metadata` text frames into `WordBoundary` values
6. stop on `Path:turn.end`

`src/backend/edge/ws.rs` also retries transient synthesis failures up to three attempts with linear backoff.

### SSML handling

`src/backend/edge/ssml.rs` owns the text-preparation contract:

- `clean_text()` replaces unsupported control characters with spaces.
- `split_text()` chunks raw text by the escaped XML byte cost, not by already-escaped strings.
- `build_ssml()` is the single function that converts raw text into escaped XML inside a `<speak><voice><prosody>` envelope.

This is a key invariant for the backend: callers pass plain text into the synthesis pipeline, and XML escaping happens only when SSML is built.

## Data Flow

### Single synthesis

The single-job flow in `src/cli/synth.rs` is:

1. parse CLI args in `src/cli/mod.rs`
2. load config from `src/config.rs`
3. read text from CLI arg, file, or stdin
4. resolve output directory
5. resolve voice and backend
6. compute deterministic filename and cache key
7. return cached audio if present
8. emit `started` event
9. create backend via `src/backend/mod.rs`
10. call `Backend::synthesize`
11. write MP3
12. optionally write SRT through `src/output/srt.rs`
13. cache the audio
14. emit `done` event

### Batch synthesis

The batch flow in `src/cli/batch.rs` and `src/queue/scheduler.rs` is:

1. parse JSON into `Vec<Job>`
2. normalize job IDs and resolve any aliased per-job voices
3. resolve batch defaults for output dir, default voice, and default backend
4. build one backend instance per distinct resolved backend name
5. construct one semaphore per backend using `Backend::max_concurrency()`
6. short-circuit cache hits immediately and add cached manifest entries
7. spawn async tasks for uncached jobs
8. for each job, resolve `SynthParams` and per-job backend selection from `Job`
9. write successful MP3 output, update cache, and record manifest entry
10. record failed jobs as `ManifestFailure`
11. write `manifest.json`
12. return an error if any job failed so the command exits non-zero

Per-job backend routing is preserved end to end: dry-run planning, backend pool creation, scheduler dispatch, and manifest recording all use `Job::backend_name`.

## Batch Processing Details

Batch mode is designed for multi-job synthesis, not just repeated single-job calls:

- Job input shape is defined in `src/queue/job.rs`.
- Batch-only defaults are resolved in `resolve_batch_options` in `src/cli/batch.rs`.
- Per-job IDs default to the array position when omitted.
- Per-job filenames default to `000.mp3`, `001.mp3`, and so on via `src/output/naming.rs`.
- Cache keys are based on text plus voice, rate, pitch, and volume, so different prosody settings produce distinct artifacts.
- Failures do not stop manifest creation; they are accumulated and surfaced after the manifest is written.

The scheduler is intentionally backend-aware. Different backends can set different concurrency ceilings without changing batch orchestration code.

## Configuration Resolution

### Config file

`src/config.rs` stores user preferences in:

- `dirs::config_dir()/vox/config.toml`

The file supports:

- `default_voice`
- `default_dir`
- `default_backend`
- `aliases`

### Voice resolution chain

The code paths are not identical across commands, so new work should preserve the current command-specific chains:

- `vox synth` and `vox play`:
  explicit `--voice` -> `VoxConfig::resolve_voice`
  otherwise `VoxConfig::configured_voice()`
  otherwise `lang::auto_detect_voice(text)`
  otherwise `DEFAULT_VOICE` through `auto_detect_voice`

- `vox batch`:
  per-job `job.voice` after alias resolution
  otherwise CLI `--voice` after alias resolution
  otherwise configured default voice
  otherwise `DEFAULT_VOICE`

### Backend resolution chain

`VoxConfig::resolve_backend` applies:

- explicit CLI/backend argument when present
- otherwise configured `default_backend`
- otherwise `DEFAULT_BACKEND` from `src/backend/mod.rs`

One exception matters: `src/cli/preview.rs` directly instantiates `EdgeBackend` and ignores backend config.

## File Locations and Artifacts

### Audio output

- single synthesis writes to `<dir>/<hash12>.mp3` unless `--output` overrides it
- batch synthesis writes to `<dir>/<job filename>` and defaults to sequential names
- play/preview write temp files under the OS temp directory and delete them after playback

### Cache

- cache directory: `<output dir>/.vox-cache/`
- cache filename: `<blake3 key>.mp3`
- cache key inputs: `text`, `voice`, `rate`, `pitch`, `volume`

### Manifest

- batch manifest path: `<output dir>/manifest.json`
- manifest includes totals plus successful entries and failures

### Subtitle output

- SRT path: same audio path with `.srt` extension
- SRT generation depends on boundary metadata being returned by the backend

## Operational Invariants

- Only `src/backend/edge/ssml.rs` escapes SSML text.
- Batch success is defined by `manifest.errors == 0`; otherwise `src/cli/batch.rs` returns an error after writing the manifest.
- Scheduler concurrency is constrained per backend, not globally.
- Cache reuse copies existing MP3 files into the requested output path instead of re-synthesizing.
- Manifest output is written even when some jobs fail.
- Preview uses Edge directly and therefore does not exercise the generic backend factory.
