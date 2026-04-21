# Step 1: 转写字幕（必出**词级**对齐）

## CLI（bare whisperx · 不依赖 nf-cli）

```bash
# 必须用 whisperx · faster-whisper 只出句级 · karaoke 步会卡英文行空
whisperx <episode>/sources/<slug>/source.mp4 \
  --output_format json \
  --output_dir <episode>/sources/<slug>/ \
  --language en \
  --model base.en \
  --compute_type int8 \
  --batch_size 8

# 输出 <slug>/source.json · 含词级 alignment
```

**硬约束**：必须 whisperx · 不能用 faster-whisper / openai-whisper（默认句级 · 没 `words[]`）。装：`pip install whisperx`。

## 输入

`<episode>/sources/<slug>/source.mp4`

## 产出（gate: transcript-ready）

whisperx 原生产 `source.json`（schema：`{segments: [{start, end, text, words: [{word, start, end, score}]}], language}`）· 然后你转出两个**扁平**文件给后续步用：

```bash
# 1. words.json · 词级扁平 · karaoke 步必读 · text 字段（不是 word）
jq '{
  total_words: ([.segments[].words[]] | length),
  words: [.segments[].words[] | {text: .word, start: .start, end: .end}]
}' <slug>/source.json > <slug>/words.json

# 2. sentences.json · 句级扁平 · plan 步必读
jq '{
  total_sentences: (.segments | length),
  sentences: [.segments | to_entries[] | {id: (.key + 1), start: .value.start, end: .value.end, text: .value.text}]
}' <slug>/source.json > <slug>/sentences.json
```

产物结构：

```
<episode>/sources/<slug>/
├── source.json      # whisperx 原生（segments + 内嵌 words[]）
├── words.json       # 词级扁平 · {total_words, words: [{text, start, end}]} · karaoke 用
└── sentences.json   # 句级扁平 · {total_sentences, sentences: [{id, start, end, text}]} · plan 用
```

## 谁做

Code（whisperx CLI · jq 转换）。

## 环境依赖

- Python 3.10+ + `pip install whisperx`
- `jq` (`brew install jq`)
- ffmpeg

## 耗时

`base.en` 跑 4min 视频 ≈ 30-60s（M 系列芯片）· 第一次会下 model（200MB）。

## 验证（必跑 · 否则下游卡）

```bash
# words.json 必须非空 · 否则 karaoke 步英文行会空（BUG-20260419 #6 真踩过）
jq '.total_words' <episode>/sources/<slug>/words.json
# 期望：> 0 · 越大越好（4min 演讲 ≈ 500-800 words）

jq '.words[0]' <episode>/sources/<slug>/words.json
# 期望：{text: "字符串", start: 数, end: 数} · 三字段都在
```

`total_words = 0` 或 `words[]` 缺 `text` 字段 → 你用错 backend 了 · 装 whisperx 重跑。
