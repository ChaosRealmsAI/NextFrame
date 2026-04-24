# v0.10.0 Local Redteam

## Findings

1. Full 24s showreel export is a performance risk in debug builds.
   - Evidence: `target/debug/nf export --project v2-showcase --composition showreel-24s --out tmp/v0.10.0/showreel-live-edit.mp4` exceeded 4 minutes and was killed.
   - The generated source JSON did include 10 tracks and edited `final-title`, so persistence and compile source work.
   - Short 8s `launch-open` export completed: 1920x1080, 60fps, 480 frames.

2. `nf devtools/click` claimed `::shadow` support but did not implement it.
   - Fixed during this build by adding deep selector traversal and JSON callback normalization.

3. Existing repository-wide `cargo fmt --all --check` reports pre-existing formatting drift across crates unrelated to this version.
   - Gate audit still passed; do not run broad fmt in this version because it would churn unrelated files.

## New Scenarios

No new BDD scenario is required for editor authoring. The export performance issue should become a separate follow-up version focused on recorder throughput/progress, not mixed into authoring.
