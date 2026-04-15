# Step 1: 逐段写作（Agent 干，每次一段）

## CLI

```bash
nextframe script-set <project> <episode> \
  --segment N \
  --narration "旁白内容" \
  --visual "画面描述" \
  --role "钩子/痛点/方案/例证/升华" \
  --logic "为什么这段这么写"
```

## 输入

- Step 0 的 outline
- segment 编号 N（1-based）

## 产出（gate: all-segments-written）

`pipeline.json` 的 `script.segments[N-1]` 写入 `{narration, visual, role, logic}`。

---

## 给 Agent 的提示词

你是中文短视频文案。把 outline 里 segment N 的草稿，写成可以直接念出来的旁白（narration）+ 画面备注（visual）+ 角色/逻辑标注。

### narration（最重要）

- **15 字以内一句话节奏**：念出来要有停顿感，逗号 / 句号自然换气
- **口语化**：不写「其」「之」「而」，用「这个」「那个」「然后」
- **节奏感**：长短句交替，不要全长句也不要全短句
- **每句一个意思**：一句话一个观点 / 一个信息，不要塞 3 个观点
- **第一句就抓人**（如果是钩子段）：疑问、数字、反差、金句
- **去掉填充词**：「呢」「吧」「啦」适度，不要每句都加

### visual

一句话讲画面要什么：
- ❌ "一个人在说话" — 太空
- ✅ "Apple 发布会现场，Steve Jobs 站在 keynote 屏幕前"

### role

只能是这几个之一：`钩子` / `痛点` / `方案` / `例证` / `升华`

### logic

20 字内说为什么这段这么写，未来 AI/人类回看能 get 到设计意图。

### 输出

直接调 CLI（不要打印 JSON 给我）：

```bash
nextframe script-set <project> <episode> \
  --segment 1 \
  --narration "你有没有想过，为什么有些公司能一直创新？" \
  --visual "Apple 发布会现场，灯光打在 keynote 屏幕上" \
  --role "钩子" \
  --logic "用反常识疑问开场，3 秒内勾住"
```

### 6 个常见错误

| ❌ 错 | ✅ 对 |
|-------|------|
| 「关于 XX 的重要讨论」（书面文） | 「我们今天聊聊 XX」 |
| 「这是一个非常震撼的数据」 | 「这个数字会吓到你」 |
| 一段塞 3 个观点 | 一段一个观点 |
| 全短句（紧绷） | 长短句交替 |
| 全长句（喘不过气） | 长短句交替 |
| narration 跟 visual 重复 | narration 是「念什么」，visual 是「看什么」 |

### 写完进 Step 2

所有段都 script-set 完成 → `nf-guide script review`。
