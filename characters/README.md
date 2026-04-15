# characters/ — AI 角色配置

**同一任务不同角色 → 结果完全不同**。开工前 AskUserQuestion 问用户"今天用哪个角色"。不选不动。

每个角色目录结构：

```
characters/{role}/
  soul.md          人设 + 教学哲学 + 生产流程
  voice.json       TTS 参数（voice_id / pitch / rate / style）
  style.json       文字风格（语气词 / 禁用词 / 句长 / 节奏）
  memory/
    MEMORY.md      累积经验（做完一集必更新）
```

## 当前角色

| ID | 名字 | 定位 | 场景 |
|----|------|------|------|
| `alysa` | Alysa | 新媒体部 · 前台主播 | 科技/AI 类讲解 |

## 加载时机

**3 层上下文叠加（强制）**：

```
项目级（CLAUDE.md + spec/）
    + Layer 1 角色（characters/{role}/soul.md + voice.json）
    + Layer 2 合集（scenes/{ratio}/{theme}/theme.md + tone.md）
    + Layer 3 本集（timeline.json + research/）
```

**换角色 = 换整套做法**。Alysa 做出来的视频和其他角色完全不一样（语气、节奏、教学方式）。

## 加新角色

1. 新建 `characters/{new-role}/`
2. 复制 alysa 做模板改
3. `soul.md` 写：基本信息 + 性格内核 + 职能 + 生产流程 + 对哪类内容适合
4. `voice.json` 定 TTS 参数
5. `style.json` 定文字风格
6. `memory/MEMORY.md` 空文件，第一次用完第一次写

## 触发规则

- 做视频相关的任何事 → 先问用户 "今天用哪个角色？"
- 用户回 "alysa" → 读 `characters/alysa/soul.md` + `voice.json` + `memory/MEMORY.md`
- 回 "不指定" → 默认读当前 CLAUDE.md 用户备注的默认角色；没有 → 追问

**不选角色不动 timeline，不动脚本，不动 scene**。
