# v0.10.0 Build Plan · V2 Composition Editor Authoring

## Inputs

- BDD: `spec/bdd/v2-editor-authoring/feature.json`
- Spec: `spec/versions/v0.10.0/spec.json`
- POC: N/A, because v2 composition runtime/export already shipped in prior commits.

## Decision

Implement this version as one tight editor path, not as separate feature islands:

1. Timeline owns selection by real v2 `track_id`.
2. Inspector renders selected composition track from raw `compositionSource`, not the normalized legacy `NfClip` only.
3. Inspector edits patch the in-memory composition immediately and re-render preview.
4. Save uses one path-based composition patch API that can write `params.*`, `style.*`, and `time.*`.
5. Preview dragging writes through the same `style.x/style.y` semantics.
6. Export remains the existing composition export flow, but the UI must expose the output path and open button after completion.

## Implementation Notes

- Do not introduce iframe, React, Vue, Electron, or a schema-specific component editor.
- The first inspector can be generic: scalar fields as inputs, arrays/objects as JSON textarea.
- Use `data-field-path` and `data-track-id` everywhere so AI verification can drive the UI.
- Keep old episode editing behavior intact. Composition mode is guarded by `compositionSource != null`.
- Add minimal CLI/IPC for `nf composition show|patch` because BDD verification needs a stable data path without DOM scraping.

## Risks

- Raw composition JSON uses author-facing `time` strings before compilation, while `NfRuntimeSource` uses numeric `begin/end`.
- Some showreel components read x/y from `params`, while new spec wants `style.x/style.y`; support both during transition.
- Existing `nf devtools` flags are episode-only, so composition windows are addressed by using `episode = composition` unless a dedicated composition flag is added.
