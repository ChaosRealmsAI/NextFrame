# nf-cut — Cut sentence-id-selected clips with ffmpeg and emit a machine-readable cut report.

## Build
`cargo check -p nf-cut`

## Module Structure
- `lib.rs`: loads `Sentences` and `Plan`, streams per-clip progress, runs ffmpeg cuts, and assembles `CutReport`

## Key Constraints
- Plans are sentence-id driven; do not add timestamp-based clip selection logic here.
- Progress output is a serialized `ProgressEvent` stream consumed by `nf-source`, so field names and meanings should stay stable.
- Clip bounds must be derived from sentence timings plus `margin_sec`, then clamped with `audio_duration_sec`.
- Keep post-cut duration verification: `ffprobe` output may differ slightly, but anything beyond `DURATION_TOLERANCE_SEC` is a failure.
- Report failures as `ClipFailure` entries with a useful `cause`; do not abort the whole batch on a single bad clip.
