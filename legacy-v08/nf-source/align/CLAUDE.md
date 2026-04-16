# nf-align — Force-align SRT subtitle text to source audio and emit the canonical sentence bundle.

## Build
`cargo check -p nf-align`

## Module Structure
- `lib.rs`: orchestrates audio extraction, helper execution, output validation, and bundle writing
- `text.rs`: parses SRT text, restores punctuation around aligned tokens, and rebuilds sentence records
- `script.rs`: resolves `align_ffa.py` and runs the Python helper
- `tests.rs`: alignment-specific regression coverage

## Key Constraints
- This crate aligns subtitle text from SRT blocks; it does not trust SRT timestamps as timing data.
- Keep output bundle names stable: `audio.wav`, `sentences.json`, `sentences.srt`, `sentences.txt`, `meta.json`.
- Preserve `rebuild_words()` and `build_sentences()` semantics so punctuation and CJK sentence splitting stay correct.
- Python helper resolution lives in `script.rs`: `VIDEOCUT_ALIGN_SCRIPT`, then `src/nf-tts/scripts/align_ffa.py`, with `VIDEOCUT_PYTHON_BIN` overriding the interpreter.
- Always validate helper output before writing artifacts; empty units or inverted spans are hard errors.
