# Review Instructions — R7

Strict reviewer. Any issue = reject.

## Review Steps
1. Run all verification commands.
2. Code audit:
   - `rfd` added correctly, no other new deps
   - `fs.dialogOpen`/`fs.dialogSave` actually open native dialogs (not stubs)
   - Path sandbox still enforced in bridge (try reading `../etc/passwd`)
   - `menu.js` and `store.js` exist, well-structured
3. HTML audit:
   - Top menu has File/Edit/View with listed items
   - Dropdowns close on outside click / Esc (read JS handlers)
   - Keyboard shortcuts (Cmd+S etc.) actually bound via `keydown` listener
4. Integration:
   - Reading a valid `.nfproj` file through the menu would: pass `validateTimeline`, populate store, re-render UI
   - Save path stores last-used file path
5. Non-regression:
   - R2-R6 features still work (cargo build clean, no touched main.rs window creation code)

## Scoring
- 10/10: dialogs real, save/load round-trip works conceptually, clean build, no new deps beyond rfd
- <10: any gap

Write `review.json`. complete=true only when score=10.
