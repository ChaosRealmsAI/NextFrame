# v0.11.0 Build Plan · Export Profiles + Progress + Parallel

## Decision

Keep the current screenshot-based export architecture. It is the right product model because preview and export can share the same runtime/source. Optimize the control plane first:

1. CLI profile/options.
2. Shell streaming progress state.
3. Frontend profile controls and numeric progress.
4. Parallel final-fast path.
5. Verification and benchmarks.

## Implementation Notes

- `nf export` should default to final-compatible behavior unless `--profile` is set.
- `draft` = 1280x720 / 30fps / parallel 1.
- `standard` = 1920x1080 / 30fps / parallel 1.
- `final` = 1920x1080 / 60fps / parallel 1.
- `final-fast` = 1920x1080 / 60fps / parallel 4 unless overridden.
- `--events` should leave recorder events visible and print final summary as a final JSON object. Default non-events mode should preserve machine-readable final JSON for existing callers.
- shell jobs must stream stdout line-by-line instead of `Command::output()`.
- progress state must be monotonic and tolerate recorder events, ffmpeg mux/concat phases, and failure stderr.

## Build Tasks

- T-01 CLI export options.
- T-02 shell export progress streaming.
- T-03 frontend export controls/progress.
- T-04 parallel final-fast verification.
- T-05 JSON consistency and open-output regression.
