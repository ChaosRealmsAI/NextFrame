# Alignment Comparison: mlx-whisper vs whisperX

Live A/B demo of the two subtitle-alignment pipelines that have shipped in
`vox`, run against two TTS backends (Edge + Doubao/Volcengine).

This is what `42076c4` fixes. See also the commit message and
`src/whisper.rs` for the code path.

## What's in this folder

```
docs/alignment-comparison/
├── README.md              ← you are here
├── index.html             ← side-by-side comparison page (open via local HTTP server)
├── text.txt               ← the exact input text used
├── old_mlx_whisper.py     ← standalone copy of the pre-42076c4 Python script
├── edge/
│   ├── edge.mp3                  ← Edge TTS (zh-CN-YunxiNeural) output
│   ├── edge.srt
│   ├── edge.timeline.json        ← NEW: whisperX forced alignment
│   └── edge-old.timeline.json    ← OLD: mlx-whisper transcription + fuzzy align
└── doubao/
    ├── doubao.mp3                ← Volcengine TTS output, same text
    ├── doubao.srt
    ├── doubao.timeline.json      ← NEW: whisperX
    └── doubao-old.timeline.json  ← OLD: mlx-whisper
```

All four timelines share the same top-level shape, so a single JS loop in
`index.html` can drive word-level highlighting for any of them.

## How to view

```bash
cd docs/alignment-comparison
python3 -m http.server 8787
open http://localhost:8787/index.html
```

Open a card, hit play, watch the current word highlight in real time. Each
card tells you:

- backend (Edge or 豆包)
- alignment path (mlx-whisper or whisperX)
- segment count, word count, first-start → last-end ms
- per-segment karaoke highlight driven by `audio.currentTime`

## The source text

```
今天天气真不错，我们一起去公园散步吧，傅里叶变换和大语言模型的幻觉问题。
```

Chosen specifically because `傅里叶` (Fourier) is a well-known Whisper
failure — the Chinese transliteration of a non-native name. It's the kind
of word where a TTS engine pronounces perfectly but an ASR model frequently
mishears.

## Results at a glance

```
edge-old    3 segs, 29 words
  "今天天气真不错"
  "我们一起去公园散步吧"
  "负理液变换和大语言模型的幻觉问题"        ← 傅里叶 → 负理液
  all punctuation dropped; first segment starts at 0 ms (audio really starts ~220 ms)

edge-new    3 segs, 33 words
  "今天天气真不错，"
  "我们一起去公园散步吧，"
  "傅里叶变换和大语言模型的幻觉问题。"    ← verbatim
  punctuation preserved; first segment starts at 221 ms (real acoustic onset)

doubao-old  2 segs, 29 words                ← also merges first two sentences
  "今天天气真不错,我们一起去公园散步吧!"   ← uses English "," and "!"
  "复理液变换和大语言模型的幻觉问题。"     ← 傅里叶 → 复理液 (different mis-hearing!)

doubao-new  3 segs, 33 words
  "今天天气真不错，"
  "我们一起去公园散步吧，"
  "傅里叶变换和大语言模型的幻觉问题。"    ← identical to edge-new text-wise
```

Key observations:

1. **Whisper mis-hears `傅里叶` in two different wrong ways** depending on
   which TTS voice spoke it — "负理液" for Edge's Yunxi, "复理液" for
   Doubao. This proves the errors are acoustic, not vocabulary — there is
   no reliable fix in post-processing.

2. **The new path emits identical text structure across both backends.**
   3 segments, 33 words, same punctuation, same splits. That's because
   whisperX is not doing ASR — it's aligning known text to audio. Swap
   the TTS backend and only the timestamps change; the text is guaranteed.

3. **Timing becomes more accurate too.** The old path reports the first
   segment starting at `0 ms` (a pure fiction — the TTS outputs have
   ~200 ms of leading silence). The new path puts it at the real acoustic
   onset (221 ms for Edge, 281 ms for Doubao).

## Reproducing

All four JSONs were generated from scratch with:

```bash
TEXT="$(cat text.txt)"

# 1. New path — runs automatically inside `vox synth`.
vox synth "$TEXT" -o edge.mp3   --voice zh-CN-YunxiNeural -d edge/
vox synth "$TEXT" -o doubao.mp3 -b volcengine            -d doubao/

# 2. Old path — replay the legacy Python script directly on the same mp3s.
python3 old_mlx_whisper.py edge/edge/edge.mp3     zh > edge/edge-old.timeline.json
python3 old_mlx_whisper.py doubao/doubao/doubao.mp3 zh > doubao/doubao-old.timeline.json
```

`old_mlx_whisper.py` is a byte-for-byte copy of the Python script that
lived embedded inside `src/whisper.rs` at commit `e85283d`, with a tiny
wrapper that rehapes its output into the same `{segments: [...]}` shape
that the new path produces, so both can be consumed by `index.html`
uniformly.

## Why `whisperX`

See commit `42076c4` for the full rationale. Short version:

- **Whisper ASR** works from audio alone → makes up text → has an error rate.
- **whisperX forced alignment** works from audio + known text → returns
  per-character CTC-aligned timestamps → zero text errors by construction.

For TTS output we always know the text (we just fed it to the engine),
so forced alignment is the right tool. Whisper's output, however
accurate, is structurally the wrong shape for this problem.
