# Review Instructions — R11

Strict reviewer.

## Review Steps
1. Run all verification commands.
2. Critical audit — this round makes the product VISUALLY alive:
   - `index.html` module script MUST:
     - import registerAllScenes + scenes/index.js
     - call registerAllScenes(engine) exactly once
     - fetch demo-timeline.json and put into store
     - set store.state.playing = true
   - preview loop MUST actually call engine.renderAt in its tick function
   - playhead advances monotonically when playing=true
3. Commands:
   - dispatch runs exec, builds inverse, pushes to undo stack
   - undo pops inverse, re-applies, pushes original to redo stack
   - canUndo/canRedo reflect stack state
4. Keyboard:
   - Space toggles playing
   - Arrow keys jog playhead
5. Non-regression:
   - R7 menu.js save/load still works (grep for its function names)
   - cargo build clean

## Scoring
- 10/10: preview actually renders scenes from demo timeline when window opens (judged by reading code path)
- <10: gaps

Write `review.json`. complete=true only at score=10.
