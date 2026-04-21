# T-18 Report · UI ↔ JSON Link

## Changes

- Replaced the old stub webview load with the real `frontend/nf-components/index.html` bundle, served through a local `nextframe://frontend/index.html?project=<p>&episode=<e>` wry custom protocol so WebKit can load assets and keep `ipc_handler` active.
- Added a wry `postMessage` bridge:
  - frontend sends `{ req_id, op: "projects.show" | "episodes.show", params }`
  - Rust normalizes dot ops to existing CRUD handler ops
  - Rust calls `ComposeOpHandler`
  - Rust returns through `window.__NEXTFRAME_IPC_RESOLVE__(response)`
- Added frontend real-data loader and normalization for `project.json` + `episodes/<ep>.json`.
- Kept browser/mock mode for W-4 visual regression; shell IPC mode uses true JSON for project, episode, duration, clips, anchors, and log.
- Added fallback UI notices for missing project, missing episode, and IPC failure.
- Switched `dist/index.js` to an IIFE classic script because `file://` module scripts are blocked by browser/WebKit CORS rules.

## Verification

- `cargo check --workspace`
  - passed, zero warnings
- `cd frontend/nf-components && npm run check`
  - passed
- `cd frontend/nf-components && npm run build`
  - passed, `dist/index.js 56.1kb`
- `cd frontend/nf-components && npm test`
  - passed, pixel diff `0.638%`

## E2E

Commands run with `HOME="$PWD/tmp/home"`:

- started `./target/debug/nf-shell`
- created project `demo`
- created episode `demo/ep-01` with duration `10`
- opened `nf open --project=demo --episode=ep-01`
- captured `tmp/ui.png`
- verified devtools state
- quit shell

Key output:

```text
tmp/ui.png: PNG image data, 1440 x 900, 8-bit/color RGBA, non-interlaced
nf-topbar: <nf-topbar project-id="demo" episode-id="ep-01" current-tab="edit" current-lang="zh"></nf-topbar>
nf-timeline: <nf-timeline duration="10" current-time="12.45" zoom="1"></nf-timeline>
NFIPC {"req_id":"ui-1776762084624-1","op":"projects.show","params":{"project":"demo"}}
NFIPC {"req_id":"ui-1776762084664-2","op":"episodes.show","params":{"project":"demo","episode":"ep-01"}}
```

Screenshot artifact:

- `tmp/ui.png`
- SHA-256: `9f336bf283705cf826100e756c01d53dd19f813d85adad4dc3d8579240f1c523`

No commit made.
