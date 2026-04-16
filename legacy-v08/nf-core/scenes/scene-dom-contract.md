# v0.7 Scene DOM Contract

v0.7 scenes MUST export `function renderDom(params, state) -> HTMLElement`.

This walking skeleton locks the DOM-first scene contract before implementation.

- ADR-013: the v0.7 scene path uses DOM only.
- ADR-014: timeline time is carried by the CSS variable `--nf-time`.
- ADR-015: edit mode is export mode plus overlay, toggled via `body[data-mode]`.
- ADR-016 (revised): recorder uses wgpu offscreen while the DOM remains the single render truth.
