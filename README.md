# NextFrame

NextFrame is an AI-native video editor and runtime. Structured JSON compositions render in a desktop editor, can be edited live, previewed with audio/subtitles, and exported to MP4.

The current product loop is:

```text
JSON composition -> desktop editor -> live edit -> saved source -> MP4 export
```

## Run

```bash
cargo build -p nf-shell -p nf-cli
target/debug/nf-shell
target/debug/nf open --project v2-showcase --composition showreel-24s
```

Example projects live in `examples/`. Runtime copies live under `~/.nextframe/`.

## Directory Map

```text
crates/      Rust product code: CLI, shell, project model, recorder, runtime helpers
frontend/    Zero-framework Web Components editor UI
examples/    Source examples that can be opened by the desktop app
scripts/     Checks, audits, and migration utilities
tests/       Cross-module fixtures and smoke inputs
spec/        Product decisions, BDD, version plans, quality standards, design system
.github/     CI
```

Local generated artifacts do not belong in the repository root. Historical snapshots and generated outputs from the v0.13.0 restructure were moved to:

```text
../NextFrame.archive/v0.13.0-20260424-structure/
```

## Useful Commands

```bash
./scripts/check-structure.sh
cargo check -p nf-cli -p nf-shell -p nf-project -p nf-recorder
cd frontend/nf-components && npm run check && npm run build
NEXTFRAME_HOME=examples target/debug/nf composition validate --project v2-showcase --composition showreel-24s
target/debug/nf export --project v2-showcase --composition showreel-24s --profile draft --diagnostics --out /tmp/showreel-24s.mp4
```

## Core Modules

- `nf-cli`: AI-facing command entry, JSON output, editor/export verification commands.
- `nf-shell`: macOS desktop shell, WebView, IPC, editor window lifecycle.
- `nf-project`: project storage, v2 composition compilation, and component registry validation.
- `nf-recorder`: HTML/runtime capture and MP4 export.
- `nf-shell-mac`: macOS WebKit/CoreAnimation capture layer.
- `frontend/nf-components`: editor UI, timeline, inspector, preview wiring.

## Documentation

- Product north star: `spec/charter.md`
- Architecture: `spec/architecture.md`
- Design system: `spec/design/DESIGN.md`
- Version records: `spec/versions/`
- Behavior specs: `spec/bdd/`
- Devlog: `spec/devlog/`

## Quality

NextFrame uses project-specific quality gates:

```bash
./scripts/audit.sh --gate-only
./scripts/audit.sh
```

The structure gate prevents reintroducing nested git repos, generated artifacts, and root-level clutter.

## License

MIT.
