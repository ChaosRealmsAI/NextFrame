# Step 4: 翻译字幕（Agent 干，每次一个 clip 一种语言）

## CLI

```bash
nf-cli source-translate <project> <episode> --clip <N> --lang zh
# 可选：--lang ja / ko / fr / es / de
# 可选：--dry-run  （只打印任务不写产物）
```

## CLI 会做的事

1. 读 `cut_report.json` 拿到 clip N 的 `from_id` / `to_id` / `start` / `end`
2. 从 `sentences.json` 抽出 clip N 对应的英文句子（按 id 过滤）
3. 把本 MD 的提示词 + 抽出的句子 → 打印到 stdout 或 `.translate.N.zh.task.md`
4. 等你（Agent）把 `cn` 数组写到 `<episode>/clips/clip_NN.translations.zh.json`
5. **Code 自动算时间**：按每条 cue 的中文字数占 segment 总字数的比例，在 segment [start, end] 内线性插值。首 cue 对齐 segment.start，末 cue 对齐 segment.end，中间相邻 cue 首尾接上。
6. 校验：每个 segment.cn 非空 + 每句都是完整中文（有终结标点）

## 输入

- `cut_report.json`（定位 clip）
- `sentences.json`（抽出 [from_id, to_id] 范围）

CLI 合成给 Agent 看的是：
```json
{
  "clip_num": 1,
  "clip_title": "开场三问",
  "segments": [
    {"id": 1, "en": "How do you explain when things don't go as we assume?"},
    {"id": 2, "en": "Or better, how do you explain when others are able to achieve things that seem to defy all of the assumptions?"}
  ]
}
```

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

你是字幕翻译员，专业做中文演讲字幕。把英文翻译成自然流畅的中文，按**阅读节奏**切成完整 cue。

### 硬规则（违反任何一条都是错）

1. **每个 cue 必须是完整中文句子**——有主谓、能独立读懂、有终结标点（。？！…）。
2. **不机械切碎**——宁可一整句长一点，也不能切出残句。
3. **不切半句话**——「是什么」+「让他们」这种分法零分。
4. **保留专有名词原文**——Apple / Golden Circle / Why / How / What / Martin Luther King / Wright brothers / MP3 / TED 等**不翻**。
5. **一个 segment 输出的 cue 加起来 = 原意的完整翻译**，不能漏、不能加解释。

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

### 输出格式

**严格输出这个 JSON，其他什么都不要说**：

```json
[
  {"id": 1, "cn": ["完整句 1"]},
  {"id": 2, "cn": ["完整句 1", "完整句 2"]}
]
```

- 数组顺序和输入顺序一致
- `id` 必须匹配输入的 segment id
- `cn` 数组元素必须是字符串，每个都是完整句（含终结标点）

### 输入（由 CLI 附上）

你会看到一个 clip 的 segments 数组（通常 5-20 条）。**只看 en 字段，其他字段不管**。

### 常见翻错场景 Top 5

1. **"you know" / "I mean" 全翻出来** → 错。口头禅按中文习惯省略或合并。
2. **被动态保留** → 错。「It is believed that」→「大家都觉得」，不是「它被相信」。
3. **倒装保留** → 错。中文不需要和英文一样的语序。
4. **修饰堆叠** → 错。「a beautifully designed, user-friendly product」→「又好看又好用的产品」，不是「一个被精美设计的、用户友好的产品」。
5. **文化符号硬翻** → 错。Martin Luther King 不是「马丁・路德・国王」。
