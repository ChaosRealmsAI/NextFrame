# v0.16.0 Merged Build Plan

## Decision

Use the existing recorder `record.frame` event stream as the source of truth for diagnostics. The CLI captures those events in-process when `--diagnostics` is enabled, writes a sibling JSON report, and includes a compact diagnostics payload in the final summary. Desktop export already runs `nf export --events`, so shell can pass `--diagnostics`, store the final summary on the job, and return diagnostics through `export-status`.

## Why

- It avoids inventing a second timing path.
- It keeps preview/export source unchanged.
- It gives AI tools a stable JSON report and PM users a visible inspector map.

## Tasks

1. CLI/recorder: add event capture and diagnostics JSON report.
2. Shell/status: request diagnostics and expose summary/path to the frontend.
3. Inspector UI: render performance map, slow spans, and summary metrics.
4. Verification: direct CLI export, desktop export path, MP4/AAC/subtitle regression, process cleanup.
