# A1 Report · Mac Traffic Light + Real Data UI

## Summary

- Window creation now follows the reference macOS recipe: transparent hidden titlebar, full-size content view, native traffic light inset `(18, 18)`, resizable window, and minimum inner size `960x600`.
- Native shell mode marks `html[data-nextframe-native="true"]`, makes the app fill the window, uses a 48px topbar with 80px left gutter, and removes fake traffic-light dots from native rendering.
- UI bootstraps from the real `nf open --project --episode` session and then loads project/episode/clip data through existing IPC ops. Static `project-id="next-frame"`, `current-time="12.45"`, `selected-id="feat-2"`, and `clip-id="feat-2"` were removed from `index.html`.
- `demo-v0.5` was required by the acceptance command, so slug validation now permits dots while preserving lowercase start, lowercase/digit/dot/hyphen body, and max length.

## Changed Files

- `crates/nf-shell/src/webview.rs`
- `crates/nf-shell/src/storage.rs`
- `frontend/nf-components/index.html`
- `frontend/nf-components/shell.css`
- `frontend/nf-components/src/index.ts`
- `frontend/nf-components/src/components/topbar.ts`
- `frontend/nf-components/src/components/clips.ts`
- `frontend/nf-components/src/components/inspector.ts`
- `frontend/nf-components/src/components/timeline.ts`

## Step Evidence

### Step 1 · Traffic Light Native Alignment

`webview.rs` now uses:

- `with_title_hidden(true)`
- `with_titlebar_transparent(true)`
- `with_fullsize_content_view(true)`
- `with_has_shadow(true)`
- `with_traffic_light_inset(LogicalPosition::new(18.0, 18.0))`
- `with_resizable(true)`
- `with_min_inner_size(LogicalSize::new(960.0, 600.0))`

### Step 2 · HTML Topbar

Native shell mode:

- `nf-topbar` host height: `48px`
- `.topbar.native` padding-left: `80px`
- `.topbar.native` uses `-webkit-app-region: drag`
- buttons/dropdowns use `-webkit-app-region: no-drag`
- native mode renders no fake `.tb-dots`
- browser/mock mode remains compatible; W4 pixel test passed at `0.725%`

### Step 3 · Real Data

Session route is injected by Rust as `window.NEXTFRAME_SESSION = { project, episode }`, so custom protocol query loss does not break initialization.

E2E `nf screenshot` probe contained:

```html
<nf-topbar current-tab="edit" current-lang="zh" class="native" project-id="demo-v0.5" episode-id="ep-01"></nf-topbar>
```

The same probe contained:

- `nf-clips episode-id="ep-01" selected-id="intro"`
- `nf-timeline duration="60" current-time="0"`
- preview clip label `开场`
- no `project-id="next-frame"`

## Verification

Passed:

- `cargo check --workspace`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace --lib`
  - `nf-cli`: 6 passed
  - `nf-engine`: 0 passed
  - `nf-runtime`: 0 passed
  - `nf-shell`: 20 passed
- `frontend/nf-components && npm run check`
- `frontend/nf-components && npm run build`
- `frontend/nf-components && npm test`
  - W4 Playwright pixel diff: `0.725%`

Release build:

- `cargo build --release --bins`

## E2E Output

Commands executed with `HOME="$PWD/tmp/demo-home"`:

```sh
./target/release/nf-shell &
./target/release/nf projects create --slug=demo-v0.5 --name='v0.5 演示'
./target/release/nf episodes create --project=demo-v0.5 --slug=ep-01 --duration=60
./target/release/nf clips create --project=demo-v0.5 --episode=ep-01 --slug=intro --label='开场' --track=scene --start=0 --end=10
./target/release/nf open --project=demo-v0.5 --episode=ep-01
./target/release/nf screenshot --project=demo-v0.5 --episode=ep-01 --out=tmp/a1-final.png
./target/release/nf devtools --project=demo-v0.5 --episode=ep-01 --query='nf-topbar' --get=outerHTML
./target/release/nf quit
```

Key output:

- project created: `demo-v0.5`
- episode created: `ep-01`, duration `60.0`
- clip created: `intro`, label `开场`, duration `10.0`
- open returned: `window_id="w-1"`, `project="demo-v0.5"`, `episode="ep-01"`
- `tmp/a1-final.png`: `PNG image data, 1440 x 900, 8-bit/color RGBA, non-interlaced`
- `tmp/a1-final.png` SHA-256: `9f336bf283705cf826100e756c01d53dd19f813d85adad4dc3d8579240f1c523`
- `tmp/a1-screenshot.json` SHA-256: `d89dbb331a8b9134c956e231e29d3be0cb71eda72cb6bb22a9382e4dbe0b74f4`
- `tmp/a1-topbar.json` SHA-256: `2b7cde6ca98dc2932eef726dd97dc66c77c3abdc5928e9a7327a11e71630a854`

## Visual / Interaction Notes

- Native red/yellow/green buttons are provided by the macOS window, not HTML; native mode renders no fake dots.
- The topbar reserves the required 80px gutter and drag region; interactive controls are marked no-drag.
- The window is created with `with_resizable(true)` and min size `960x600`.
- I attempted a real `screencapture`, but the current capture context returned the lock-screen/wallpaper instead of the app window, so I am not claiming a manual visual resize/drag verification from that image. The automated DOM/window configuration and e2e probe passed.

## Commit

No commit was created.
