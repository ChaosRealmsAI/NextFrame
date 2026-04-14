# nf-download — Download a source video with yt-dlp and persist the normalized source artifacts.

## Build
`cargo check -p nf-download`

## Module Structure
- `lib.rs`: fetches metadata, downloads `source.mp4`, probes duration, and writes `meta.json`

## Key Constraints
- Output artifact names are fixed: `source.mp4` and `meta.json` inside the requested `out_dir`.
- Always remove stale outputs before downloading so reruns cannot leave mixed old/new artifacts behind.
- `format_height` must stay positive and the format selector must cap video height to the requested value.
- Title comes from `yt-dlp --dump-single-json`; duration comes from `ffprobe` on the downloaded file, not metadata guesses.
- Surface tool failures with context from `yt-dlp` or `ffprobe`; this crate is the boundary to external download tooling.
