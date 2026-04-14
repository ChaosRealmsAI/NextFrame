# Step 4: 翻译字幕（Agent 干，每次一个 clip 一个语言）

## CLI

```bash
nf-cli source-translate <project> <episode> --clip 1 --lang zh
```

CLI 做什么：
1. 读 `cut_report.json` 拿到 clip 1 的 from_id/to_id
2. 从 `sentences.json` 抽出这段的英文句子
3. 打印提示词 + 句子列表给 Agent
4. 等 Agent 写出 `clip_01.translations.zh.json`
5. 按中文字数占比在每个英文 segment 内插值分配 cue 的 start/end
6. 写回 `clip_01.translations.zh.json`（覆盖）

## 输入

- `sentences.json` 里的一段（按 cut_report 定位）
- `cut_report.json`

## 产出（gate: translated）

```
<episode>/clips/clip_01.translations.zh.json
```

格式：
```json
{
  "clip_num": 1,
  "lang": "zh",
  "segments": [
    {
      "id": 4,
      "en": "Why is Apple so innovative?",
      "start": 29.2, "end": 30.5,
      "cn": [
        {"text": "为什么苹果能一直创新？", "start": 29.2, "end": 30.5}
      ]
    },
    {
      "id": 14,
      "en": "And why is it that the Wright brothers were able to figure out controlled powered man flight when there were certainly other teams...",
      "start": 62.7, "end": 77.8,
      "cn": [
        {"text": "还有一个问题——", "start": 62.7, "end": 63.8},
        {"text": "当时明明还有其他团队更有钱、更有资源、更被看好，", "start": 63.8, "end": 70.2},
        {"text": "为什么偏偏是莱特兄弟搞定了受控动力飞行？", "start": 70.2, "end": 77.8}
      ]
    }
  ]
}
```

---

## 给 Agent 的提示词（粗略方向）

你是字幕翻译员。把英文翻译成自然中文，按阅读节奏切 cue。

### 核心规则

1. **完整句原则**：每个 cue 必须是完整句子（主谓完整、能独立读懂）
2. **不机械切碎**：宁可一整句长一点，也不能切出残句
3. **一对 N 按语义**：短英文 → 1 个 cue。长英文（多从句）→ 多个完整 cue
4. **口语感**：这是演讲不是书面文，要像人说话
5. **保留术语**：Apple、Golden Circle、Why/How/What、Martin Luther King、MP3 等专有名词不翻

### 输入

```json
[
  {"id": 4, "en": "Why is Apple so innovative?"},
  {"id": 14, "en": "And why is it that the Wright brothers..."}
]
```

### 输出

```json
[
  {"id": 4, "cn": ["完整句 1"]},
  {"id": 14, "cn": ["完整句 1", "完整句 2", "完整句 3"]}
]
```

**只管 cn 文本列表，不管时间。时间 code 帮你算。**

### 判断"要不要切 cue"的指南

| 英文长度 | 中文翻译 | cue 数 |
|---------|---------|-------|
| < 15 词 | 短句 | 1 |
| 15-30 词，单 clause | 中长句 | 1-2 |
| 30+ 词 / 有多从句 / 多个"and"/"but" | 能切多句 | 2-4 |

**切点选择**：
- 英文 "and" / ";" / "." 处
- 中文句号、问号、感叹号处
- 不能在半句话中间切（"是什么"+"让他们" ❌）
