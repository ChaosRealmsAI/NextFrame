# Task — R45: Scene favorites

## Goal
Let user star favorite scenes in the library. Favorites show at top of the list. Persisted in store.state.favorites.

## Requirements

### Store (`runtime/web/src/store.js`)
- Add `state.favorites: []` (array of scene ids)
- Methods: `store.toggleFavorite(sceneId)`, `store.isFavorite(sceneId)`

### Library card (`runtime/web/src/panels/library/card.js`)
- Add a star icon button in the top-right corner of each card
- Filled ★ if favorite, outlined ☆ otherwise
- Click → `store.toggleFavorite(scene.id)` (no propagation to drag)
- Favorites section renders first in the Scenes tab (under a "Favorites" header)
- Rest of scenes render below under "All Scenes" header
- Empty favorites → skip the Favorites section entirely

### Library panel (`runtime/web/src/panels/library/index.js`)
- When mounting, partition scenes into favorites + rest
- Re-render when favorites change (subscribe)

## Technical Constraints
- Pure ES modules, no deps
- All existing tests pass

## Verification Commands
```bash
grep -qE 'favorites|toggleFavorite' runtime/web/src/store.js
grep -qE 'favorite|star' runtime/web/src/panels/library/card.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
