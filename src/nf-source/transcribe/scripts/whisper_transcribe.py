#!/usr/bin/env python3
"""Adapted from MediaAgentTeam/cutv2/src/whisper.rs, 2026-04-11.

Run `whisper_timestamped` over one local audio file and emit:
    {"language": "en", "words": [{"text", "start", "end"}, ...]}
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

os.environ.setdefault("TQDM_DISABLE", "1")
os.environ.setdefault("PYTHONUNBUFFERED", "1")


def eprint(*args: Any) -> None:
    print("whisper:", *args, file=sys.stderr)


def main() -> int:
    if len(sys.argv) != 4:
        eprint("usage: whisper_transcribe.py <audio> <model> <language>")
        return 2

    audio_path = sys.argv[1]
    model_name = sys.argv[2]
    language = sys.argv[3]

    if not os.path.exists(audio_path):
        eprint(f"audio file not found: {audio_path}")
        return 2

    try:
        import whisper_timestamped as wt  # noqa: E402
    except Exception as exc:  # pragma: no cover - runtime dependency
        eprint(f"failed to import whisper_timestamped: {exc}")
        return 1

    try:
        model = wt.load_model(model_name, device="cpu")
    except Exception as exc:  # pragma: no cover - runtime dependency
        eprint(f"failed to load model {model_name!r}: {exc}")
        return 1

    kwargs: dict[str, Any] = {
        "condition_on_previous_text": False,
        "compression_ratio_threshold": 2.4,
        "no_speech_threshold": 0.6,
        "verbose": None,
    }
    if language and language != "auto":
        kwargs["language"] = language

    try:
        result = wt.transcribe(model, audio_path, **kwargs)
    except Exception as exc:  # pragma: no cover - runtime dependency
        eprint(f"transcription failed: {exc}")
        return 1

    words: list[dict[str, Any]] = []
    for segment in result.get("segments", []):
        for word in segment.get("words", []):
            try:
                text = str(word.get("text", "")).strip()
                start = float(word["start"])
                end = float(word["end"])
            except Exception:
                continue
            if not text:
                continue
            words.append({"text": text, "start": start, "end": end})

    json.dump(
        {"language": result.get("language") or language or "auto", "words": words},
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
