#!/usr/bin/env python3
"""Stub ffprobe used by integration tests."""

from __future__ import annotations

import sys


def main() -> int:
    sys.stdout.write("12.34\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
