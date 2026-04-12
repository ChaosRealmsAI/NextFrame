# POC F Report

## 1. Is double-buffer overhead acceptable?

Yes for this scale of prototype. A second 1920x1080 2D canvas means another full-screen draw pass and another ~8 MB RGBA surface, but the hidden pass here is cheap because it only fills solid rects and `getImageData(1x1)` runs only on pointer events, not every frame. The main practical limit is memory bandwidth on more complex scenes: if `renderIds()` starts mirroring lots of expensive vector work, the cost stops feeling negligible.

## 2. Ergonomics of writing `renderIds` alongside `render`

It is workable, but it creates duplication pressure. The clean case is when the scene already has explicit layout primitives, because `render()` and `renderIds()` can share the same geometry helpers and stay in sync. The awkward case is text, bezier-heavy art, or anything where the visible draw path and the hit target differ; then `renderIds()` becomes extra maintenance surface and is easy to drift from the visible render unless layout is factored carefully.
