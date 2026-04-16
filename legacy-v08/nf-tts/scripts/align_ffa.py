#!/usr/bin/env python3
"""
Forced alignment via whisperX.

Input:
    argv[1]  audio file path
    argv[2]  language code ("zh", "en", "ja", ...) or "" for auto
    stdin    original text (UTF-8)

Output (stdout, single JSON line):
    {"duration_ms": int, "language": "zh", "units": [{"text", "start_ms", "end_ms"}, ...]}

`units` are the atomic aligned tokens whisperX returns:
  - zh/ja/ko → per content character (from return_char_alignments=True)
  - en/others → per word

The Rust side owns final Timeline assembly: walking the original text,
interleaving punctuation, grouping into segments by sentence-terminating
punctuation, and handling missing units gracefully.

Stdout is reserved **exclusively** for the final JSON line. Every other byte
whisperX / transformers might emit is redirected to stderr so we never
corrupt JSON parsing. On failure the script exits non-zero with a readable
message on stderr and empty stdout.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

# Silence chatty libs but keep real stderr for errors we want to surface.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_ETAG_TIMEOUT", "5")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "300")

_real_stdout = sys.stdout
_real_stderr = sys.stderr

# Reserve stdout for the final JSON line only. Any chatty library that
# writes to stdout during import or inference would otherwise corrupt our
# output. We route everything to stderr (the real one) until we explicitly
# choose to emit the result.
sys.stdout = _real_stderr


def eprint(*args: Any) -> None:
    print("ffa:", *args, file=_real_stderr)


def detect_language(text: str) -> str:
    cjk = 0
    jp = 0
    kr = 0
    total = 0
    for ch in text:
        if not ch.isalpha():
            continue
        total += 1
        code = ord(ch)
        if 0x4E00 <= code <= 0x9FFF:
            cjk += 1
        elif 0x3040 <= code <= 0x30FF:
            jp += 1
        elif 0xAC00 <= code <= 0xD7AF or 0x1100 <= code <= 0x11FF:
            kr += 1
    if total == 0:
        return "en"
    if jp > 0:
        return "ja"
    if kr > 0:
        return "ko"
    if cjk * 100 // total > 30:
        return "zh"
    return "en"


CHAR_UNIT_LANGS = {"zh", "ja", "ko"}

# Canonical wav2vec2 CTC model id per language code. For languages that
# whisperX ships as "torch" (torchaudio.pipelines) defaults we pin an HF
# alternative instead so every language lives in ~/.cache/huggingface and
# the offline-detection path is uniform. `jonatasgrosman/*-english` is the
# community XLS-R English model, same family as the Chinese one above.
DEFAULT_ALIGN_MODELS = {
    "zh": "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn",
    "ja": "jonatasgrosman/wav2vec2-large-xlsr-53-japanese",
    "ko": "kresnik/wav2vec2-large-xlsr-korean",
    "en": "jonatasgrosman/wav2vec2-large-xlsr-53-english",
    "fr": "jonatasgrosman/wav2vec2-large-xlsr-53-french",
    "de": "jonatasgrosman/wav2vec2-large-xlsr-53-german",
    "es": "jonatasgrosman/wav2vec2-large-xlsr-53-spanish",
    "it": "jonatasgrosman/wav2vec2-large-xlsr-53-italian",
}

# Punctuation whisperX may emit as its own aligned token. We drop these on
# the Python side so the Rust Timeline builder sees a clean stream of one
# unit per CONTENT char (CJK) or per WORD (Latin). Punctuation is
# reconstructed from the original text on the Rust side.
PUNCT_CHARS = set(
    ".,!?;:\"'()[]{}<>-—_/\\|&@#$%^*+=~`"
    "，。！？；：、"
    "\u201c\u201d\u2018\u2019"  # curly quotes
    "（）【】《》…—～·"
)


def _is_punct_token(tok: str) -> bool:
    stripped = tok.strip()
    if not stripped:
        return True
    return all(c in PUNCT_CHARS for c in stripped)


def _cached_align_model_dir(language: str) -> str | None:
    """Return the local snapshot dir for a language's align model if it is
    fully cached, else None.

    We don't want to import huggingface_hub for this check (it pulls in
    transformers by transitive effect of whisperX). A structural check of
    `~/.cache/huggingface/hub/models--…/snapshots/<hash>/pytorch_model.bin`
    is sufficient and fast.
    """
    repo = DEFAULT_ALIGN_MODELS.get(language)
    if not repo:
        # English and other "torch" models (VOXPOPULI) don't live in the HF
        # cache — they're downloaded by torchaudio and cached elsewhere.
        # Skip the check; whisperX's own loader handles them.
        return None
    cache_root = os.environ.get("HF_HOME") or os.path.join(
        os.path.expanduser("~"), ".cache", "huggingface"
    )
    slug = "models--" + repo.replace("/", "--")
    snapshots_dir = os.path.join(cache_root, "hub", slug, "snapshots")
    if not os.path.isdir(snapshots_dir):
        return None
    for entry in os.listdir(snapshots_dir):
        snap = os.path.join(snapshots_dir, entry)
        if not os.path.isdir(snap):
            continue
        # Need config + weights at minimum.
        has_cfg = os.path.exists(os.path.join(snap, "config.json"))
        has_weights = any(
            os.path.exists(os.path.join(snap, f))
            for f in ("pytorch_model.bin", "model.safetensors")
        )
        if has_cfg and has_weights:
            return snap
    return None


def main() -> int:
    if len(sys.argv) < 2:
        eprint("usage: align_ffa.py <audio_path> [language]")
        return 2

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else ""

    try:
        text = sys.stdin.read()
    except Exception as e:
        eprint(f"failed to read text from stdin: {e}")
        return 2

    if not text.strip():
        eprint("original text is empty")
        return 2

    if not os.path.exists(audio_path):
        eprint(f"audio file not found: {audio_path}")
        return 2

    if not language:
        language = detect_language(text)

    # If the whisperX alignment model for this language is already fully
    # cached, force offline mode so transformers / huggingface_hub don't
    # block on HEAD requests over slow networks. First-time users have to
    # do the download online; after that every subsequent run is offline.
    cached_model_dir = _cached_align_model_dir(language)
    if cached_model_dir and "HF_HUB_OFFLINE" not in os.environ:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

    # Suppress import-time noise.
    sys.stderr = open(os.devnull, "w")
    try:
        import whisperx  # noqa: E402
        from whisperx.audio import load_audio, SAMPLE_RATE  # noqa: E402
    finally:
        sys.stderr = _real_stderr

    try:
        audio = load_audio(audio_path)
    except Exception as e:
        eprint(f"load_audio failed: {e}")
        return 1

    duration = float(len(audio)) / float(SAMPLE_RATE)
    if duration <= 0.0:
        eprint("audio duration is zero")
        return 1

    device = "cpu"  # Apple Silicon MPS support is unreliable for wav2vec2 CTC.

    # Suppress model-loading noise.
    model_name = DEFAULT_ALIGN_MODELS.get(language)

    sys.stderr = open(os.devnull, "w")
    try:
        model, metadata = whisperx.load_align_model(
            language_code=language,
            device=device,
            model_name=model_name,
        )
    except Exception as e:
        sys.stderr = _real_stderr
        eprint(f"load_align_model failed for '{language}': {e}")
        return 1
    finally:
        sys.stderr = _real_stderr

    # Single segment wrapping the entire original text.
    segments = [{"text": text, "start": 0.0, "end": duration}]

    sys.stderr = open(os.devnull, "w")
    try:
        aligned = whisperx.align(
            segments,
            model,
            metadata,
            audio,
            device=device,
            return_char_alignments=True,
            print_progress=False,
        )
    except Exception as e:
        sys.stderr = _real_stderr
        eprint(f"align failed: {e}")
        return 1
    finally:
        sys.stderr = _real_stderr

    units: list[dict[str, Any]] = []

    use_chars = language in CHAR_UNIT_LANGS

    for seg in aligned.get("segments", []):
        items = seg.get("chars") if use_chars else seg.get("words")
        if not items:
            continue
        for it in items:
            tok = it.get("char") if use_chars else it.get("word")
            if tok is None:
                continue
            tok = str(tok)
            if _is_punct_token(tok):
                continue
            s = it.get("start")
            e = it.get("end")
            if s is None or e is None:
                # whisperX skipped this token (silence or unalignable).
                continue
            try:
                s_ms = int(round(float(s) * 1000.0))
                e_ms = int(round(float(e) * 1000.0))
            except (TypeError, ValueError):
                continue
            if e_ms < s_ms:
                e_ms = s_ms
            units.append(
                {
                    "text": tok,
                    "start_ms": s_ms,
                    "end_ms": e_ms,
                }
            )

    if not units:
        eprint("whisperX returned zero aligned units")
        return 1

    out = {
        "duration_ms": int(round(duration * 1000.0)),
        "language": language,
        "units": units,
    }
    # Emit the JSON line on the real stdout we saved at import time.
    json.dump(out, _real_stdout, ensure_ascii=False)
    _real_stdout.write("\n")
    _real_stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
