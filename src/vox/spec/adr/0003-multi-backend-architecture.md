# 0003: Multi-Backend Architecture Uses A Shared Trait

- Status: Accepted
- Date: 2026-03-19

## Context

The CLI exposes backend selection in `src/cli/mod.rs`, `src/cli/synth.rs`, `src/cli/batch.rs`, `src/cli/play.rs`, and `src/cli/voices.rs`. Batch mode also needs backend-specific concurrency and per-job backend routing.

Embedding backend-specific logic directly into each command would duplicate:

- voice listing behavior
- synthesis parameter handling
- concurrency declarations
- output shaping into audio bytes, duration, and word boundaries

## Decision

Define a shared `Backend` trait in `src/backend/mod.rs` and route backend construction through `create_backend`.

The trait owns:

- `max_concurrency`
- `list_voices`
- `synthesize`

Shared transport types also live in `src/backend/mod.rs`:

- `Voice`
- `SynthParams`
- `SynthResult`
- `WordBoundary`

## Consequences

- `src/queue/scheduler.rs` can remain backend-agnostic while still enforcing backend-specific concurrency limits
- CLI commands can resolve a backend once and call a stable interface
- new backends can plug into the system without rewriting command handlers

## Current State

The architecture is broader than the currently implemented backend inventory:

- the interface supports multiple backends
- `src/backend/mod.rs::create_backend` currently constructs only `edge`

This is acceptable because the abstraction is already serving real needs in batch orchestration and output normalization.

## Rejected Alternative

Branch inside each CLI command on backend name and call backend-specific modules directly.

This was rejected because it spreads backend policy across the CLI surface and makes per-job backend batch routing harder to preserve.
