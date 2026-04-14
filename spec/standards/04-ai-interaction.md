# 04 — AI Interaction Protocol

## 核心原则：功能自包含

**每个功能 = 一个完整的操作闭环，不依赖外部知识。**

AI 不看文档。AI 看接口本身。接口必须包含：
- 我是谁（--help、describe）
- 我能干什么（可用操作列表）
- 我怎么干（参数 schema + 示例）
- 干对了长什么样（成功返回 + 验证方法）
- 干错了怎么修（错误 + fix 建议）

**如果 AI 不查文档就用不了 = 这个功能没做完。**

## 自描述层

### CLI 自描述
每个命令必须：
```bash
nextframe <command> --help    # 完整用法 + 参数 + 示例 + 约束
nextframe scenes              # 可用组件 + 每个组件的 params schema
nextframe scenes headline     # 单个组件完整信息
```

--help 不是"帮助文档"，是**接口契约**。AI 读 --help 就知道所有规则。

### 组件自描述
```js
// 每个组件带 params schema — AI 读这个知道怎么填
params: {
  title: { type: "string", required: true, desc: "标题文字", example: "Hello World" },
  fontSize: { type: "number", default: 0.06, min: 0.02, max: 0.15, desc: "短边比例" },
}
```

AI 不需要猜参数名、猜类型、猜范围。schema 就是真相。

### 帧自描述
```js
// describe(t) — 任意时刻帧的语义描述
{
  phase: "enter",          // enter | main | exit
  progress: 0.3,           // 0-1
  elements: [
    { type: "text", content: "Hello", x: 0.1, y: 0.3, fontSize: 48, visible: true },
    { type: "bar", value: 0.7, color: "#3eb370" }
  ],
  text_content: "Hello World — 数据增长 70%"
}
```

AI 不需要截图就能"看"帧内容。describe() 是免费的"视觉"。

## 自验证层

### validate 门禁
```bash
nextframe validate timeline.json
```

6 道门禁，每道返回 pass/fail + 具体位置 + fix 建议：

```json
{
  "ok": false,
  "gates": [
    { "name": "schema", "pass": true },
    { "name": "scene-exists", "pass": false, 
      "errors": [{ "clip": "c3", "scene": "foo", "fix": "run 'nextframe scenes' to see available components" }] },
    { "name": "overlap", "pass": true },
    { "name": "bounds", "pass": true },
    { "name": "font-size", "pass": true },
    { "name": "ratio-match", "pass": true }
  ]
}
```

**validate 不是可选步骤，是操作闭环的一部分。** 每次修改后必须跑。

### 截图验证
```bash
nextframe preview timeline.json --times=0,3,5,10
# 输出：每个时间点的 PNG + 布局地图（元素位置标注）
```

AI 先用 describe() 做文字验证，不对再截图看。两层验证，省 token。

## 自纠错层

### 错误格式
```
failed to {action}: {reason}. Fix: {suggestion}
```

**每条错误必须带 Fix。** 没有 fix 的错误 = 死胡同，AI 不知道下一步。

```
# 好的错误
failed to add layer: scene "foo" not found. Fix: run "nextframe scenes" to see available components

# 坏的错误（禁止）
Error: invalid scene
```

### 连锁修复
当一个操作引发多个错误时，按优先级排序，第一个修了再报下一个：

```json
{
  "errors": [
    { "priority": 1, "message": "scene not found", "fix": "..." },
    { "priority": 2, "message": "font too large", "fix": "..." }
  ],
  "hint": "fix priority 1 first, then re-validate"
}
```

## AI 操作协议

### 5 步节奏
```
THINK → SEARCH → PATCH → ASSERT → RENDER
```

1. **THINK** — 理解意图，不动手
2. **SEARCH** — 查状态：`pipeline-get`、`layer-list`、`app status`
3. **PATCH** — 改数据：`layer-add`、`script-set`、`atom-add`
4. **ASSERT** — 验证：`validate`、`describe_frame`
5. **RENDER** — 确认：`preview` 截图、ASCII gantt

**PATCH 后必须 ASSERT。** 不验证就报完成 = 没完成。

### 状态可查询
AI 必须能随时知道"现在是什么情况"：

| 我想知道 | 命令 | 返回 |
|---------|------|------|
| 桌面端在哪个页面 | `app status` | { page, project, episode, stage } |
| 时间线有什么 | `pipeline-get` | 完整 pipeline JSON |
| 第 5 秒画面是什么 | `preview --times=5` | PNG + describe |
| 可用组件 | `scenes` | 完整组件列表 + params |
| 时间线概览 | ASCII Gantt | 文本格式轨道图 |

### 原子操作
每个 CLI 命令做一件事。不合并、不批量。

```bash
# 好：原子操作
nextframe layer-add --scene headline --start 0 --dur 5
nextframe layer-add --scene barChart --start 5 --dur 5
nextframe validate timeline.json

# 坏：一次做多件事（禁止）
nextframe batch-add --layers "[{...}, {...}]"
```

原子操作 = 可追溯、可 undo、可 debug。

## 新功能上线检查清单

每个新功能必须回答 5 个问题：

| # | 问题 | 不满足 = |
|---|------|---------|
| 1 | AI 怎么**发现**这个功能？ | --help 里看不到 = 不存在 |
| 2 | AI 怎么**理解**参数和约束？ | 没有 schema = 靠猜 |
| 3 | AI 怎么**操作**？ | 没有 CLI/IPC 入口 = 不可操作 |
| 4 | AI 怎么**验证**结果？ | 没有 validate/describe = 盲操作 |
| 5 | AI **出错**了怎么自修？ | 没有 fix 建议 = 死胡同 |

**5 个全满足才能上线。** 这不是文档要求，是功能完整性要求。

## 迭代改进（Agent Experience 核心实践）

每次 AI 操作产品犯错后：

1. **记录** — 什么操作、什么错、为什么
2. **归因** — 是缺文档？命名误导？缺验证？还是接口不够自描述？
3. **修环境** — 加 --help 文本、改错误消息、加 validate 检查、改命名
4. **验证** — 让 AI 重新操作，确认不再犯

**不要教 AI 怎么用你的产品。让产品自己教 AI。**
