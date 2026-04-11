# Task — R34: AI operation walkthrough + sample .nfproj

## Goal
Show the "AI can operate this product" story concretely: produce a sample `.nfproj` file users can open from File > Open on first launch, and document the exact bridge calls an AI agent would make to build it from scratch.

## Requirements

### Sample project file (`samples/welcome.nfproj`)
- A valid timeline JSON (schema matches validateTimeline) with:
  - 45 second duration
  - 3 video tracks + 2 audio tracks
  - 8-12 clips total using the 10 shipped scenes
  - Audio clips pointing at `../runtime/web/assets/demo-audio.wav`
  - Param choices that demonstrate each scene at its best
- Must load cleanly via File > Open → engine.validateTimeline returns ok

### AI walkthrough doc (`spec/ai-operation-walkthrough.md`)
- 1-page markdown explaining how an AI agent would:
  1. Discover available scenes: `bridge.call('scene.list', {})`
  2. Create an empty timeline
  3. Add a clip: `bridge.call('timeline.addClip', {trackId:'v1', clip:{scene:'auroraGradient', start:0, dur:6, params:{...}}})`
  4. Load a project: `bridge.call('timeline.load', {path:'...'})`
  5. Save: `bridge.call('timeline.save', {path:'...', timeline:{...}})`
  6. Export: `bridge.call('export.start', {...})`
- Include the full JSON request/response for each step
- Should read as "copy this sequence into your LLM prompt and watch it build videos"

### Shell script (`scripts/ai-demo.sh`)
- Bash script that imitates an AI agent by pre-building a sample timeline JSON in memory (via echo into a temp file) and demonstrates each bridge method schema
- Does NOT actually call the bridge (that requires the running shell); instead, validates the sample.nfproj by running a node script that imports engine's validateTimeline
- Exit 0 if all schemas validate

### Menu integration
- Already have File > Open from R7 — the sample just needs to be in `samples/` and the walkthrough doc tells users where to find it

## Technical Constraints
- No new deps
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` pass
- `bash scripts/ai-demo.sh` exits 0

## Verification Commands
```bash
test -f samples/welcome.nfproj
test -f spec/ai-operation-walkthrough.md
test -f scripts/ai-demo.sh
python3 -c "import json; d = json.load(open('samples/welcome.nfproj')); assert d['duration'] >= 30; assert len(d['tracks']) >= 5; print('nfproj ok')"
grep -q 'scene.list\|timeline.addClip\|timeline.load\|timeline.save' spec/ai-operation-walkthrough.md
bash scripts/ai-demo.sh
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
