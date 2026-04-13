#!/usr/bin/env python3
"""Reproduce the pre-42076c4 mlx-whisper alignment path standalone.

This is EXACTLY the script embedded in src/whisper.rs before we switched
to whisperX forced alignment — used here only for A/B comparison.
"""
import sys, os, json

os.environ["TOKENIZERS_PARALLELISM"] = "false"

_real_stderr = sys.stderr
sys.stderr = open(os.devnull, "w")
try:
    import mlx_whisper
finally:
    sys.stderr = _real_stderr

audio_path = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

try:
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
        word_timestamps=True,
        language=lang,
        hallucination_silence_threshold=1.0,
    )
except Exception as e:
    print(f"mlx-whisper error: {e}", file=sys.stderr)
    sys.exit(1)

# Shape output to look like the new Timeline JSON so the HTML comparison
# page can consume it uniformly. Each whisper segment becomes a
# TimelineSegment; whisper's per-word timestamps become TimelineWords.
out_segments = []
for seg in result.get("segments", []):
    words = [
        {
            "word": w["word"],
            "start_ms": int(round(w["start"] * 1000)),
            "end_ms": int(round(w["end"] * 1000)),
        }
        for w in seg.get("words", [])
    ]
    out_segments.append(
        {
            "text": seg["text"].strip(),
            "start_ms": int(round(seg["start"] * 1000)),
            "end_ms": int(round(seg["end"] * 1000)),
            "words": words,
        }
    )

print(json.dumps({"segments": out_segments}, ensure_ascii=False))
