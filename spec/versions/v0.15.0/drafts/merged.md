# v0.15.0 Build Approach

## Decision

Fix the full-showreel export blocker by reducing subtitle render cost first.

The subtitle track must keep full `params.words` in JSON/source for editing, but render only a small active window of words per frame. This keeps preview/export visually readable and prevents the 24s showreel from laying out all 43 words on every frame.

## Work Split

1. Add BDD coverage for complete export, subtitle window rendering, and cleanup after export.
2. Window official subtitle render output around the active word.
3. Apply the same windowing rule to desktop composition preview subtitles.
4. Run full `showreel-24s` draft export and verify AAC audio, duration, extracted subtitle frame, and no residual processes.

## Constraints

- Do not change the saved JSON words contract.
- Do not introduce iframe or a frontend framework.
- Do not make high-resource export the default.
- Store generated verification media outside the repo in `../NextFrame.archive/`.
