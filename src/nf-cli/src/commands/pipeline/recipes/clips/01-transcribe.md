# Step 1: 转写字幕

## CLI

```bash
nf-cli source-transcribe <project> <episode> --source <slug> --model base.en --lang en
```

## 输入

`<slug>/source.mp4`

## 产出（gate: transcript-ready）

```
<slug>/
├── sentences.json   # 句级：{id, start, end, text, words: [{text, start, end}]}
├── words.json       # 词级展平：{total_words, words: [{text, start, end}]}
├── sentences.srt
└── sentences.txt
```

## 谁做

Code（WhisperX Python）。

## 环境依赖

- Python 3.10+ with whisper_timestamped
- 设 `VIDEOCUT_WHISPER_SCRIPT` 指向 `src/nf-source/transcribe/scripts/whisper_transcribe.py`

## 耗时

`base.en` 跑 18min 视频 ≈ 50s（M 系列芯片）。
