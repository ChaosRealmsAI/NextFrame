# Step 5: 写传播文案（Agent 自己干 · 没有 CLI · 每次一个 clip）

## 谁做

**你（Agent / LLM）自己写 + 自己落 md 文件**。没有 `nf-cli source-polish` · 没有工具调你 · 你读文件 → 写文案 → 落 md。

## 你要做（3 步）

```bash
EP=tmp/<run>/projects/<project>/<episode>
N=1   # clip 编号

# 1. 读 cut_report.json 拿 clip N 的 title / duration / text_preview
jq --argjson n $N '.success[] | select(.clip_num == $n)' $EP/clips/cut_report.json

# 2. 读 translations.zh.json 拿完整中文内容
NN=$(printf "%02d" $N)
jq '.segments[] | .cn[] | .text' $EP/clips/clip_$NN.translations.zh.json

# 3. 按下面提示词写多平台文案 · 直接落 md 到：
#    $EP/clips/clip_$NN.caption.zh.md
```

## 输入（你自己读）

- `<episode>/clips/cut_report.json` · clip 基本信息（title / duration / text_preview）
- `<episode>/clips/clip_NN.translations.zh.json` · 完整中文字幕内容

## 产出（gate: polished）

`<episode>/clips/clip_01.caption.zh.md`（严格 markdown 格式，见下面示例）

---

## 给 Agent 的提示词

你是中文短视频运营。给这个 clip 写多平台发布文案。

### 平台差异

| 平台 | 标题 | 描述 | 标签 | 封面文字 | 节奏 |
|------|------|------|------|----------|------|
| **抖音** | 15 字内，强钩子 | 30 字内 | 3-5 个 | 6 字内大字 | 前 3s 抓人 |
| **小红书** | 20 字内，允许 emoji | 100 字内，可以列点 | 5-10 个 | 首图可用文字卡 | 图文感 |
| **B站** | 20 字内，可多一层信息 | 50 字内 | 3 个 | 可复用抖音版 | 容忍长前奏 |
| **视频号** | 15 字内，朋友圈感 | 不超过 30 字 | 2-3 个 | 抖音版通用 | 中年友好 |
| **YouTube（海外版）** | 60 字内英文标题 | 200 字内英文 | 5 个英文 tag | 英文大字 | SEO 导向 |

### 标题 5 个技巧

1. **疑问钩子**：「为什么 X 能 Y？」「X 到底在想啥？」
2. **反差制造**：「XX 说了一句话，在座的人都惊了」
3. **数字冲击**：「3 分钟讲透 Golden Circle」
4. **结论预告**（别剧透）：「这段话让我想辞职」
5. **人名锚定**：「Simon Sinek：XX」

### 描述写法

- **承接标题但不剧透结论**
- 可以列出 2-3 个关键词或数字
- 最后一句引发互动：「你怎么看？」/「评论区见」

### 标签原则

- 前 3 个是核心主题标签（#TED #领导力 #黄金圈）
- 小红书可加 2-3 个长尾（#职场思考 #演讲分享）
- **不要堆砌**：5+ 低相关标签比 3 个高相关更差
- **不要冷门**：「#XX哲学思考」没人搜

### 封面大字

- 6 字内
- 一般就是标题里最抓人的那 1 个词或问句
- **和标题不要重复**（封面「为什么？」+ 标题「为什么苹果能赢」= 互补不重复）

### 剪辑建议

- **15-30s 短版**：标哪个时间段是最能独立传播的几句
- **60s 完整版**：如果整个 clip 就是 60s 内，直接用全片
- **建议删的片段**：有冗余时指明「x-y 秒这段可以砍」

### 输出格式（严格按这个 markdown）

```markdown
# clip_01 · 开场三问

## 抖音
**标题**：苹果凭什么？
**描述**：Simon Sinek 3 分钟撕开一个秘密。看完你会想到马丁・路德・金、莱特兄弟……
**标签**：#TED #领导力 #黄金圈
**封面大字**：为什么？

## 小红书
**标题**：为什么有些公司能一直赢？TED 给了我一个答案 💡
**描述**：刷到这段 TED 的时候，我一整个被 Simon Sinek 问住了。
他说——为什么苹果年年都能创新？
为什么是马丁・路德・金领导民权运动？
为什么是莱特兄弟造出第一架飞机？
答案居然是同一个规律。
**标签**：#TED演讲 #黄金圈 #思维方式 #职场思考 #Simon Sinek
**封面大字**：苹果凭什么？

## B站
**标题**：Simon Sinek 最经典的 3 分钟——为什么苹果能赢？
**描述**：TED 顶流演讲 Golden Circle 的开场段。三个例子铺垫核心观点。
**标签**：#TED #领导力 #思维

## 视频号
**标题**：为什么苹果能一直赢？
**描述**：Simon Sinek 用三个例子撕开了一个规律。
**标签**：#TED演讲 #思维方式

## YouTube (EN)
**Title**: Why Apple Wins: Simon Sinek's Famous Opening
**Description**: The iconic opening of Simon Sinek's Golden Circle TED talk. Three case studies — Apple, Martin Luther King, the Wright brothers — that lead to one of the most-quoted business ideas of the decade.
**Tags**: #TED #Leadership #GoldenCircle #SimonSinek #Marketing

## 剪辑建议

- **15s 版**：00:00-00:15（三问抛出就收）
- **30s 版**：00:00-00:30（加上「There's something else at play here」金句）
- **60s 版**：全片
- **删减候选**：无（整个 clip 都精华）
```

### 禁忌

- ❌ 「震惊！」「必看！」「速看」
- ❌ 标题泄底（已给答案就没人点了）
- ❌ emoji 堆砌（小红书最多 2-3 个）
- ❌ 超 5 个低相关标签
- ❌ 机翻英文描述（YouTube 必须原创英文，不是中译英）

### 输入（你自己读）

- clip 基本信息（title、duration、text_preview）· 从 `cut_report.json` 读
- 这个 clip 的中文字幕完整内容（segments[].cn[].text 拼起来）· 从 `translations.zh.json` 读

**禁止抄中文字幕当描述**。描述是运营文案，不是字幕。

## 验证

```bash
# md 文件存在 + 含所有 5 平台（抖音 / 小红书 / B站 / 视频号 / YouTube）
test -f $EP/clips/clip_$NN.caption.zh.md
grep -c "^## " $EP/clips/clip_$NN.caption.zh.md
# 期望：≥ 6（5 平台 + 剪辑建议）
```
