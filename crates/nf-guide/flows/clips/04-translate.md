# Step 4: 翻译字幕（Agent 自己干 · 没有 CLI · 每次一个 clip 一种语言）

## 谁做

**你（Agent / LLM）自己翻 + 自己算时间 + 自己写 JSON**。没有 `nf-cli source-translate` · 没有工具调你 · 你读文件 → 翻译 → 写文件。

## 你要做（4 步）

```bash
EP=tmp/<run>/projects/<project>/<episode>
SLUG=<slug>
N=1   # clip 编号 · 每 clip 每语言单独跑一遍

# 1. 从 cut_report.json 拿 clip N 的 from_id / to_id / start / end
jq --argjson n $N '.success[] | select(.clip_num == $n) | {from_id, to_id, start, end}' \
  $EP/clips/cut_report.json

# 2. 从 sentences.json 抽出 clip 对应的英文句子
jq --argjson f <from_id> --argjson t <to_id> \
  '.sentences[] | select(.id >= $f and .id <= $t) | {id, en: .text, start, end}' \
  $EP/sources/$SLUG/sentences.json

# 3. 按下面提示词 · 对每句英文产 1-N 条中文 cue（完整句 + 终结标点）
# 4. 自己按字数线性插值算 start/end（公式见下）· 写 JSON 到产物路径
```

## 输入（你自己读）

- `<episode>/clips/cut_report.json` · 定位 clip N
- `<episode>/sources/<slug>/sentences.json` · 英文字幕

## 产出（gate: translated）

`<episode>/clips/clip_01.translations.zh.json`
```json
{
  "clip_num": 1,
  "lang": "zh",
  "segments": [
    {
      "id": 1,
      "en": "How do you explain when things don't go as we assume?",
      "start": 16.8, "end": 19.9,
      "cn": [
        {"text": "事情没按预想发展时，你怎么解释？", "start": 16.8, "end": 19.9}
      ]
    },
    {
      "id": 2,
      "en": "Or better, how do you explain when others are able to achieve things that seem to defy all of the assumptions?",
      "start": 20.4, "end": 26.6,
      "cn": [
        {"text": "或者换个问法——", "start": 20.4, "end": 21.9},
        {"text": "当别人做到了看似不可能的事，你怎么解释？", "start": 21.9, "end": 26.6}
      ]
    }
  ]
}
```

（start/end 由 code 填，Agent 只写 cn 数组的 text）

---

## 给 Agent 的提示词

你是字幕翻译员，专业做中文演讲字幕。把英文翻译成自然流畅的中文，按**阅读节奏**切成完整 cue。**输出格式 + 硬规则见本文档下方** —— 先看示例 + 输出 schema · 再翻。

### 1 对 N 的判断法

| 英文特征 | cue 数 |
|---------|-------|
| 短句 < 15 词，单一观点 | **1** |
| 15-30 词，单 clause，无强转折 | **1** |
| 30+ 词 / 多 clause / 有 "and" "but" "or" "because" 连接多个完整想法 | **2-4** |
| 列举 3+ 项（A, B, and C） | **2-3**（根据自然节奏） |
| 有自我修正（"uh, I mean"）| **1**（保留修正的口语感） |

**核心直觉**：如果你把翻译念出来，什么时候自然会停顿换气，那就是 cue 边界。

### 切点选择

**✅ 好的切点**
- 中文句号 / 问号 / 感叹号处
- 中文顺接连词前：「所以...」「但是...」「那么...」
- 英文原文的 `. ; and but or` 对应位置
- 列举项之间：「A、B 和 C」切成「A、B」+「和 C」（如果整体长）

**❌ 不能切**
- 「是什么 | 让他们」❌
- 「他说 | 他饿了」❌（主谓关系）
- 「为什么 | 莱特兄弟能」❌
- 中文顿号之间「苹果、微软、谷歌」❌
- 定语和中心语之间「会飞的 | 机器」❌

### 语气要求

- **口语化**：这是演讲，不是书面文。不用「其」「之」「而」
- **保留节奏**：演讲者停顿、强调、反问的语气感
- **不翻译腔**：
  - ❌「这是关于 X 的一次重要讨论」
  - ✅「我们今天聊聊 X」
- **保留情感**：演讲者的感叹、疑问、兴奋要通过标点和词汇传达

### 示例（严格参考）

**输入**：
```
{"id": 14, "en": "And why is it that the Wright brothers were able to figure out controlled powered man flight when there were certainly other teams who were better qualified, better funded and they didn't achieve powered man flight, and the Wright brothers beat them to it?"}
```

**❌ 差的翻译**（机械切碎）：
```json
{"id": 14, "cn": ["为什么是", "莱特兄弟能够", "搞定受控动力飞行", "当时还有其他团队", "更有资格", "资金也更多", "却没能实现", "而莱特兄弟抢先做到了"]}
```
问题：切成残片，每条都不是完整句。

**❌ 差的翻译**（一整坨长句）：
```json
{"id": 14, "cn": ["为什么是莱特兄弟搞定受控动力飞行当时明明还有其他团队更有资格资金也更多却没能实现而莱特兄弟抢先做到了？"]}
```
问题：字幕显示一行放不下，没节奏感。

**✅ 好的翻译**：
```json
{"id": 14, "cn": [
  "还有一个问题——",
  "为什么搞定受控动力飞行的是莱特兄弟？",
  "当时明明还有其他团队，更专业、更有钱、更被看好，",
  "他们都没做到，偏偏是莱特兄弟。"
]}
```
- 4 个完整句，每句都能独立站住
- 保留了演讲者「抛问题 → 展开反差 → 落点」的节奏
- 口语感

### 输出格式（硬 schema · 违反 = `nf karaoke` 报 invalid type 拒收）

**`cn` 数组的元素必须是 `{text, start, end}` 对象 · 不是字符串**。time 你按字数线性插值算（见下）。

**最终写到 `<episode>/clips/clip_NN.translations.zh.json`**：

```json
{
  "clip_num": 1,
  "lang": "zh",
  "segments": [
    {
      "id": 1,
      "en": "How do you explain when things don't go as we assume?",
      "start": 16.8, "end": 19.9,
      "cn": [
        {"text": "事情没按预想发展时，", "start": 16.8, "end": 18.5},
        {"text": "你怎么解释？",         "start": 18.5, "end": 19.9}
      ]
    }
  ]
}
```

#### ✅ 对：object 数组（含 start/end 秒）

```json
"cn": [
  {"text": "完整句 1", "start": 16.8, "end": 18.5},
  {"text": "完整句 2", "start": 18.5, "end": 19.9}
]
```

#### ❌ 错：字符串数组（BUG-20260419 #7 真踩过）

```json
"cn": ["完整句 1", "完整句 2"]
```

→ `nf karaoke` 直接报 `invalid type: string, expected struct` · 整个 pipeline 死。

### start/end 怎么算

按每条 cue 的中文字数占 segment 总字数的比例 · 在 segment `[start, end]` 内线性插值 · 首 cue 对齐 segment.start · 末 cue 对齐 segment.end · 中间相邻 cue 首尾接上：

```python
# 伪码 · agent 心算 / Python 一行 / Bash + jq 都行
seg_dur = seg.end - seg.start
total_chars = sum(len(c) for c in cn_texts)
t = seg.start
for ct in cn_texts:
    cue_dur = seg_dur * len(ct) / total_chars
    cn.append({"text": ct, "start": round(t, 2), "end": round(t + cue_dur, 2)})
    t += cue_dur
# 末 cue.end 强制 = seg.end（防浮点漂移）
cn[-1]["end"] = seg.end
```

### 硬规则（违反任何一条都是错）

1. **每个 cue 必须是完整中文句子**——有主谓、能独立读懂、有终结标点（。？！…）。
2. **不机械切碎**——宁可一整句长一点，也不能切出残句。
3. **不切半句话**——「是什么」+「让他们」这种分法零分。
4. **保留专有名词原文**——Apple / Golden Circle / Why / How / What / Martin Luther King / Wright brothers / MP3 / TED 等**不翻**。
5. **一个 segment 输出的 cue 加起来 = 原意的完整翻译**，不能漏、不能加解释。
6. **`cn` 元素必须是 object**（`{text, start, end}`）· 不是字符串 · `start/end` 自己按字数插值算。

### 输入（由 CLI 附上）

你会看到一个 clip 的 segments 数组（通常 5-20 条）。**只看 en 字段，其他字段不管**。

### 常见翻错场景 Top 5

1. **"you know" / "I mean" 全翻出来** → 错。口头禅按中文习惯省略或合并。
2. **被动态保留** → 错。「It is believed that」→「大家都觉得」，不是「它被相信」。
3. **倒装保留** → 错。中文不需要和英文一样的语序。
4. **修饰堆叠** → 错。「a beautifully designed, user-friendly product」→「又好看又好用的产品」，不是「一个被精美设计的、用户友好的产品」。
5. **文化符号硬翻** → 错。Martin Luther King 不是「马丁・路德・国王」。
