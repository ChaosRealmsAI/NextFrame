# Step 5: 写传播文案（Agent 干，每次一个 clip）

## CLI

```bash
nf-cli source-polish <project> <episode> --clip 1 --lang zh
```

CLI 做什么：
1. 读 `cut_report.json` 拿 clip 标题、文字预览
2. 读 `clip_01.translations.zh.json` 拿中文翻译
3. 打印提示词给 Agent
4. Agent 写 `clip_01.caption.zh.md`

## 输入

- `cut_report.json` 里的 clip N
- `clip_NN.translations.zh.json`（可选，给 Agent 完整中文内容）

## 产出（gate: polished）

```
<episode>/clips/clip_01.caption.zh.md
```

格式：
```markdown
# clip_01 · 开场三问

## 标题（10-15 字，钩子型）
世界顶级 TED：伟大领导者为什么能感召别人？

## 描述（50 字内）
苹果、马丁·路德·金、莱特兄弟——Simon Sinek 用三个例子撕开一个规律。

## 标签
#TED #领导力 #黄金圈

## 封面大字（6 字内）
为什么？

## 剪辑建议
15-30s 短版：00:00-00:20（3 个例子提问就收）
60s 完整版：全片
```

---

## 给 Agent 的提示词（粗略方向）

你是中文短视频运营。为这个 clip 写发布文案。

### 平台

中文社交（抖音、B站、小红书、视频号）。

### 语气

- 好奇心驱动，不说教
- 简洁，留白，不堆形容词
- 标题是钩子，不是剧透

### 必须产出

| 字段 | 要求 |
|------|------|
| 标题 | 10-15 字，带钩子（疑问 / 反差 / 悬念） |
| 描述 | 50 字内，展开标题不剧透结论 |
| 标签 | 3 个，带 # |
| 封面大字 | 6 字内，全屏最醒目那句 |
| 剪辑建议 | 15-30s 短版 + 60s 完整版的时间点 |

### 禁忌

- ❌ 「震惊！」「必看！」这种低质党
- ❌ 标题泄底（已经知道答案就没人看了）
- ❌ 标签堆砌超过 3 个

### 参考

这个 clip 来自 Simon Sinek 的 TED，talking points 在 clip_NN.translations.zh.json。
