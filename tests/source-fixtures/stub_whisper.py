#!/usr/bin/env python3
"""Deterministic test double for python/whisper_transcribe.py."""

from __future__ import annotations

import json
import sys


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: stub_whisper.py <audio> <model> <language>", file=sys.stderr)
        return 2

    payload = {
        "language": "en",
        "words": [
            {"text": "Hello", "start": 0.50, "end": 0.80},
            {"text": "world.", "start": 0.80, "end": 1.10},
            {"text": "This", "start": 2.00, "end": 2.20},
            {"text": "is", "start": 2.20, "end": 2.40},
            {"text": "splice.", "start": 2.40, "end": 2.80},
            {"text": "Cut", "start": 5.00, "end": 5.20},
            {"text": "clips", "start": 5.20, "end": 5.50},
            {"text": "carefully.", "start": 5.50, "end": 6.10},
            {"text": "Verify", "start": 8.00, "end": 8.30},
            {"text": "edges.", "start": 8.30, "end": 8.80},
        ],
    }
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
