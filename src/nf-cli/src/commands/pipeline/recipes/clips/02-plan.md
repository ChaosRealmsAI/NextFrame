# Step 2: 挑 3-5 个 highlight（Agent 干）

## CLI

```bash
nf-cli source-plan <project> <episode>
```

CLI 做什么：打印提示词 + sentences.json 给你（Agent）读，然后等你写回 `plan.json`。

## 输入

`<slug>/sentences.json`

## 产出（gate: plan-written）

```
<episode>/plan.json
```

格式：
```json
{
  "episode": "e01",
  "source": "Simon Sinek — How Great Leaders Inspire Action",
  "clips": [
    {"id": 1, "from": 1, "to": 15, "title": "开场三问", "why": "用三个反差例子铺垫 Golden Circle，高能钩子"}
  ]
}
```

---

## 给 Agent 的提示词（粗略方向）

你是短视频剪辑师。读这段演讲的 sentences.json，挑 3-5 个最能独立传播的片段。

### 每段要求

- **30-90 秒**：能讲完一个完整观点，不拖
- **开头是钩子**：疑问、金句、反常识
- **结尾是落点**：有句号感，不挂半空中
- **内容独立**：不依赖前后文，单独看也懂
- **避开垃圾**：跳过过场句、重复、「ahh」「okay so」

### 怎么选

1. 通读全文，把每句当一行
2. 找「开场金句」→ 句号范围写进来
3. 找「核心概念首次出现」
4. 找「最 quotable 的一句话」
5. 如果有明显落点（如 CTA、总结），也加

### 输出格式

```json
{
  "episode": "<episode id>",
  "clips": [
    {"id": 1, "from": <起始句号>, "to": <结束句号>, "title": "10 字内", "why": "20 字内说为什么"}
  ]
}
```

### 原则

- 宁可少挑 3 个精华，不要硬凑 5 个凑数
- title 和 why 是写给未来 AI 看的，要言简意赅
