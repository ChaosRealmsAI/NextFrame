# nf-bridge — JSON IPC backend for shell, project storage, and export flows.

## Build
cargo check -p nf-bridge
cargo test -p nf-bridge

## Structure
- `src/lib.rs`: request/response types and IPC dispatch table.
- `src/domain/`: project, episode, segment, scene, and timeline handlers.
- `src/storage/`: filesystem, autosave, and recent-item persistence.
- `src/export/` + `src/codec/`: recorder orchestration and ffmpeg helpers.
- `src/util/`: validation, dialogs, preview, logging, and shared helpers.

## Rules
- Add public IPC methods in `dispatch_inner` and keep `domain.camelCase` names.
- Validate params with `util::validation` and resolve paths through `storage::fs`.
- Keep filesystem, project, and timeline flows covered by `tests/integration/`.
