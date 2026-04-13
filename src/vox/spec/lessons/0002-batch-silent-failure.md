# Lesson 0002: Batch Mode Must Not Fail Silently

## Problem

Batch mode can produce a mixed result set: some jobs succeed, some come from cache, and some fail. If the command exits zero anyway, automation gets a false success signal.

## Where It Matters

- Job execution and failure capture happen in [src/queue/scheduler.rs](/Users/Zhuanz/boom/vox/src/queue/scheduler.rs).
- Manifest writing and final process status happen in [src/cli/batch.rs](/Users/Zhuanz/boom/vox/src/cli/batch.rs).
- Batch output is persisted through [src/output/manifest.rs](/Users/Zhuanz/boom/vox/src/output/manifest.rs).

## Root Cause

Partial output can make a batch run look successful at a glance. Without a final error check after manifest generation, callers would need to parse JSON output or inspect files to detect failure.

## Current Rule

- Record each failed job as `ManifestFailure`.
- Always write `manifest.json` so successful and failed work remain inspectable.
- Return a non-zero command result when `manifest.errors > 0`.

This rule is documented in [spec/adr/0002-batch-failure-propagation.md](/Users/Zhuanz/boom/vox/spec/adr/0002-batch-failure-propagation.md) and covered by tests in [src/cli/batch.rs](/Users/Zhuanz/boom/vox/src/cli/batch.rs) and [src/queue/scheduler.rs](/Users/Zhuanz/boom/vox/src/queue/scheduler.rs).

## Preventive Practice

- Treat exit code as the contract for automation, not stdout shape alone.
- Keep manifest writing and failure propagation as separate responsibilities.
- Any future batch backend or queue rewrite must preserve the non-zero-on-any-error rule.
