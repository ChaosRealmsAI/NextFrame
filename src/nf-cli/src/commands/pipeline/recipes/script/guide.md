# Script Pipeline — 脚本写作状态机

把视频/演讲意图变成结构化脚本段落（写进 pipeline.json）。每段有 narration（旁白）+ visual（画面）+ role（角色）+ logic（逻辑）。

## 流程图

```
  ┌──────────┐
  │ outline  │  Agent 决定分几段 + 整体节奏
  └────┬─────┘
       ▼
  ┌──────────┐
  │  write   │  Agent 逐段写文案 → script-set 落盘
  │ (per seg)│  循环每段
  └────┬─────┘
       ▼
  ┌──────────┐
  │  review  │  通读全文 + 修订
  └──────────┘
```

## 每步命令

| 步骤 | 查提示词 | 谁做 | 实际 CLI |
|------|---------|------|---------|
| 0 | `nextframe state-prompt script outline` | **Agent** | （只是规划，无 CLI） |
| 1 | `nextframe state-prompt script write` | **Agent** | `nextframe script-set <project> <episode> --segment N --narration "..." --visual "..." --role "..." --logic "..."` |
| 2 | `nextframe state-prompt script review` | **Agent** | `nextframe script-get <project> <episode> [--segment N]` |

## 状态检测

```
~/NextFrame/projects/<project>/<episode>/pipeline.json
```

- `script.segments=[]` → 还没写
- `script.segments.length > 0` → 至少有一段
- `script.arc` / `script.principles` 字段非空 → outline 步骤过了

## 粒度

每个 `script-set` 写**一个 segment**。Agent 写完一段就调一次。

## Agent 怎么进场

1. `nextframe state-prompt script` — 看流程
2. `nextframe state-prompt script outline` — 拿到 outline 提示词
3. Agent 决定 N 段
4. 对每段 N: `nextframe state-prompt script write` → 写 → `nextframe script-set ... --segment N --narration ...`
5. `nextframe state-prompt script review` → 通读校验

**CLI 不调 LLM。Agent 自己写。**
