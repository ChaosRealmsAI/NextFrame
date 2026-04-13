# 0002: Batch Failure Must Propagate

- Status: Accepted
- Date: 2026-03-19

## Context

Batch execution in `src/cli/batch.rs` and `src/queue/scheduler.rs` is designed for automation. A batch may produce a mix of:

- cached successes
- synthesized successes
- recorded failures

The code already writes a `manifest.json` file through `src/output/manifest.rs`, so consumers can inspect partial results after execution.

Without an explicit failing exit status, callers would need to parse the manifest or stdout summary to know whether the batch succeeded.

## Decision

Treat any recorded batch job failure as command failure.

Implementation points:

- `src/queue/scheduler.rs` adds `ManifestFailure` entries for failed jobs
- `src/cli/batch.rs` prints the manifest summary and then calls `ensure_batch_success`
- `ensure_batch_success` returns an error when `manifest.errors > 0`

## Consequences

- CI and agent workflows can trust the exit code
- users still retain partial outputs and a manifest for debugging
- success remains defined as zero failed jobs, not "some files were written"

## Rejected Alternative

Return `Ok(())` whenever at least one job completed and leave failure detection to manifest consumers.

This was rejected because it weakens the CLI contract and makes automation fragile.
