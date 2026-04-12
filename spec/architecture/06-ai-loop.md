# 06 · AI 操作模型

NextFrame 的核心命题：**让 LLM 像人一样可靠地剪辑视频**。这一份是落地的怎么做。

来源 POC：W1 (describe) / W2 (gantt) / W3 (ascii) / W4 (symbolic time) / W5 (tools) / W7 (vision).

---

## 设计原则

1. **AI 是 first-class user**，不是 GUI 自动化机器人
2. **AI 看 metadata 不看像素**（除非必要），节省 95% 成本
3. **AI 写关系不写浮点**（symbolic time）
4. **AI 必须自验证**（assertion 强制）
5. **AI 错了能 recover**（rollback + retry + escalate）

---

## AI 看到的世界 — 3 个免费视图

### 视图 A · ASCII Gantt（时间结构）

每次操作前自动注入：

```
NextFrame Project · 0:30.0 · 3 tracks · 6 clips · 3 chapters

           intro              body                outro
           ┃                  ┃                   ┃
     0:00         0:10        0:15           0:24       0:30
     ├──────┼──────┼─────────────────┼──────────┼──────────┤
V1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ aurora
              ▓▓▓▓▓▓▓▓▓▓▓▓                                  headline
                                ▓▓▓▓▓▓▓▓▓▓                  chart
                                                ▓▓▓▓▓▓▓▓▓   lowerThird
A1   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ narration.mp3
                                  ▲ punch-line
```

LLM 看一行就懂：当前几个 track，哪段空，clip 在哪个 chapter。

### 视图 B · describe(t) JSON（语义事实）

每次需要"这一帧有什么"时调：

```json
{
  "t": "0:12.5",
  "chapter": "body",
  "active_clips": [
    {
      "clipId": "clip-aurora",
      "sceneId": "auroraGradient",
      "phase": "hold",
      "progress": 0.45,
      "params": { "hueA": 270, "intensity": 1 },
      "elements": [...]
    },
    {
      "clipId": "clip-chart",
      "sceneId": "barChartReveal",
      "phase": "reveal",
      "progress": 0.20,
      "elements": [
        { "id": "title", "type": "text", "content": "FEATURES", "fontSize": 96, "visible": true, "opacity": 1 },
        { "id": "bar-1", "type": "rect", "content": "SCENES", "value": 21, "fillPct": 0.40 }
      ]
    }
  ]
}
```

**LLM 不看像素就知道这一帧画了什么、值是多少、可见性如何**。

### 视图 C · ASCII screenshot（粗略外观）

只在需要"看一眼形状"时调（80×24 字符）：

```
================================================================================
                                                                                
                      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                            
                      NEXTFRAME                                                  
                                                                                
                ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                                  
                                                                                
       ████  ████  ████  ████  ████                                            
================================================================================
```

LLM 看到大致布局：标题在中、底部 5 个色块。**0 成本 0 API 调用**。

---

## AI 操作的 5 步节奏（强制）

每次操作必须按这个顺序输出 5 步，下一步可见上一步的结果：

### 1. THINK（计划）

```
用户要求：标题晚 1 秒出现
当前 timeline 状态（gantt 已注入）：headline 在 0:01.2 出现
计划：
  - 找到 headline clip
  - moveClip 它到现在位置 + 1 秒
  - 验证：t=0:02.1 时不可见，t=0:02.3 时可见
  - 检查：是否会撞上后面的 chart clip
```

### 2. SEARCH（找目标）

```
find_clips({sceneId: 'kineticHeadline'})
→ ['clip-headline-1']

get_clip('clip-headline-1')
→ { id, start: 1.2, dur: 6, ... }
```

如果 search 返回多个 → AI 必须二次确认（哪个是用户说的"标题"）。

### 3. PATCH（写改动）

```
apply_patch({
  op: 'moveClip',
  clipId: 'clip-headline-1',
  start: { offset: 'clip-headline-1.start', by: 1.0 }
})
```

或更好（用关系不用 offset）：

```
apply_patch({
  op: 'moveClip',
  clipId: 'clip-headline-1',
  start: { after: 'marker-drum-1', gap: 2.0 }  // 假设原来是 gap: 1.0
})
```

### 4. ASSERT（验证）

```
assert_at(timeline, '0:02.1', 'clip-headline-1.visible == false')
→ pass
assert_at(timeline, '0:02.3', 'clip-headline-1.visible == true')
→ pass
assert_at(timeline, '0:02.3', 'clip-headline-1.elements.title.opacity > 0.5')
→ pass
```

任何 fail → 自动 rollback + 把失败原因塞回 LLM 让它重试。

### 5. RENDER（自检）

```
render_ascii(timeline, '0:02.3')
→ [80x24 ASCII screenshot of frame at 0:02.3]
```

LLM 自己看一眼，确认形状对。**不调外部 vision**，免费的 ASCII。

如果 ASCII 看着怪 → 调 vision_check（W7）作为 escalation。

---

## AI tool 完整 7 函数

详见 [04-interfaces](./04-interfaces.md) 的 AI Tool Surface 章节。重点：

| 函数 | 功能 | 何时用 |
|---|---|---|
| `find_clips(predicate)` | 语义搜索 | 找操作目标 |
| `get_clip(clipId)` | 读详情 | 改前看现状 |
| `describe_frame(t)` | 帧语义快照 | 验证 / 推理 |
| `apply_patch(patch)` | 改动 + validate | 真正修改 |
| `assert_at(t, predicate)` | 断言验证 | 改后必跑 |
| `render_ascii(t)` | ASCII 截图 | 自检视觉 |
| `ascii_gantt()` | 全局视图 | 进入 / 改后 |

附加：
| `vision_check(t, prompt)` | 真 LLM 看 PNG | 仅在 metadata flag 后用 |

---

## 时间表达 — 4 道铁律

### 铁律 1：AI 不写 raw seconds

```
❌ start: 3.5
✅ start: { after: 'clip-headline', gap: 0.5 }
✅ start: { at: 'marker-drum-1' }
```

apply_patch 检测到 raw seconds 直接 reject 给 hint："use symbolic time instead"。

### 铁律 2：所有时间用 chapter / marker 命名

```json
{
  "chapters": [
    { "id": "intro", "start": 0, "end": 5 },
    { "id": "body", "start": 5, "end": 25 },
    { "id": "outro", "start": 25, "end": 30 }
  ],
  "markers": [
    { "id": "drum-1", "t": 1.2 },
    { "id": "punch-line", "t": 18.5 }
  ]
}
```

AI 说"在 punch-line 之前 0.3s" → engine 算出 t=18.2。

### 铁律 3：所有时间 quantize 到 0.1s

raw seconds 永远是 `xxx.x` 形式。0.123 → 0.1。

LLM 不擅长浮点比较，0.1s 网格让它的世界变干净。

### 铁律 4：display 用 mm:ss.f 不用浮点

每个 prompt / describe / error 都用 `0:02.5` 不是 `2.5`。

CLI 输出统一格式。LLM 看到的都是 mm:ss.f，省错乱。

---

## 完整示例 · 用户中文需求 → MP4

**用户输入**：
> "做一个 12 秒的产品发布开场，3 个轨道。背景渐变，标题居中出现，结尾有 lower third 字幕。让标题动画在背景音乐第一个鼓点（约 1.2 秒）出现。"

### 第 1 轮：AI 创建空 timeline 加 chapters/markers

```
THINK: 12 秒，3 chapters：intro [0-2], body [2-9], outro [9-12]
       1 marker: drum-1 at 0:01.2
       3 video tracks v1/v2/v3, 1 audio track a1

SEARCH: (skipped, empty timeline)

PATCH:
  apply_patch({op: 'setDuration', value: 12})
  apply_patch({op: 'addChapter', id: 'intro', start: 0, end: 2})
  apply_patch({op: 'addChapter', id: 'body', start: 2, end: 9})
  apply_patch({op: 'addChapter', id: 'outro', start: 9, end: 12})
  apply_patch({op: 'addMarker', id: 'drum-1', t: 1.2})

ASSERT:
  validate_timeline() → ok
  describe_frame('0:00.0').chapter == 'intro'
  describe_frame('0:05.0').chapter == 'body'
  describe_frame('0:11.5').chapter == 'outro'

RENDER:
  ascii_gantt() → [empty 12s 3 chapter ASCII]
  → 验证 chapter 边界正确
```

### 第 2 轮：AI 加 4 个 clip

```
THINK: 现在加 clip。aurora 全程，headline 从 drum-1 开始持续到 outro，
       lowerThird outro 全程，narration audio 全程

PATCH:
  addClip v1 aurora { start: at: 'project-start', dur: at: 'project-end' }
  addClip v2 kineticHeadline { start: at: 'marker-drum-1', dur: until: 'chapter-outro.start' }
  addClip v3 lowerThirdVelvet { start: at: 'chapter-outro.start', dur: until: 'project-end' }
  addClip a1 narration.mp3 { start: at: 'project-start' }

ASSERT:
  describe_frame('0:00.0').active_clips contains aurora
  describe_frame('0:01.5').active_clips contains [aurora, headline]
  describe_frame('0:10.0').active_clips contains [aurora, lowerThird]
  describe_frame('0:11.5').active_clips.find(c => c.scene === 'lowerThirdVelvet').phase == 'exit'

RENDER:
  ascii_gantt() → [4 tracks, full layout]
  render_ascii('0:01.5') → [应该看到 aurora + headline 入场]
  render_ascii('0:10.0') → [应该看到 aurora + lowerThird]
```

### 第 3 轮（用户后续）："标题再大一点"

```
THINK: 用户说"再大一点"。我理解为 +38%（0.13 → 0.18）

SEARCH: find_clips({sceneId: 'kineticHeadline'}) → ['clip-headline-1']
get_clip('clip-headline-1') → params.size === 0.13

PATCH: setParam clip-headline-1 size 0.18

ASSERT:
  describe_frame('0:05.0').active_clips
    .find(c => c.clipId === 'clip-headline-1')
    .elements.find(e => e.id === 'headline')
    .fontSize === 0.18 * 1080  // ≈ 194
  → pass

RENDER:
  render_ascii('0:05.0') → 标题占 ~40% canvas 高度
```

---

## 错误恢复

### Case 1: assertion fail

AI 改完后 assert 不过 → engine rollback → 给 AI 错误信息：

```json
{
  "code": "ASSERTION_FAILED",
  "message": "Expected clip-headline-1.opacity > 0.8 at 0:05.0, got 0.45",
  "ref": "clip-headline-1",
  "hint": "可能 phase 时长改变了。检查 reveal 阶段时长（默认 0.6s）vs 当前 t 距离 clip start 的关系"
}
```

AI retry 一次（不同策略），第 2 次还失败 → escalate 给人类。

### Case 2: lint warning

apply_patch 成功但 lint 出 warning → 不阻塞 → 警告塞回 AI：

```json
{
  "warnings": [
    {
      "code": "SUBTITLE_DENSITY_HIGH",
      "message": "字幕 cue at 0:08.0 显示 25 个字符，duration 1.2s = 21 字符/秒，太快",
      "hint": "降速到 8 字符/秒，建议 dur ≥ 3.1s"
    }
  ]
}
```

AI 决定接受还是修复。

### Case 3: 死循环

最近 3 次 patch op + clipId 完全相同 → engine 强制中断：

```json
{
  "code": "STUCK_LOOP_DETECTED",
  "message": "你最近连续 3 次对 clip-X 执行 moveClip，说明思路卡住了",
  "hint": "请换思路。也许 clip-X 不是问题所在，问题在引用它的其他 clip。先 describe_frame 看上下文。"
}
```

---

## Vision spot-check 的边界

只在以下 4 种情况调 vision LLM（详见 [05-safety](./05-safety.md) 闸 12）：

1. **对比度 lint 触发**：颜色对比度 < 4.5:1 → vision 确认是否真的看不清
2. **字幕长度 lint 触发**：字幕 > 7s 或字符密度 > 5 字/秒 → vision 看实际能否塞下
3. **export 前最终验收**：chapter 边界帧 + peak action 帧 → vision 总评
4. **AI 主动 request**：`vision_check(t, "看这帧，X 是不是被遮住了")`

每次 timeline 操作 vision call ≤ 5 次。超过自动降级到 metadata-only。

---

## 集成 · workflows/ai-edit.js 实现伪代码

```js
export async function aiEdit({prompt, timeline, mode, llmClient}) {
  const stepLog = [];
  const tools = createToolsFor(timeline);

  let currentTimeline = timeline;
  let iter = 0;
  const MAX_ITER = 5;

  while (iter < MAX_ITER) {
    // 1. 注入上下文
    const ctx = {
      gantt: tools.ascii_gantt(),
      currentTimeline: JSON.stringify(currentTimeline),
      lastError: stepLog.at(-1)?.error,
      userPrompt: prompt,
    };

    // 2. 调 LLM 出 5 步
    const response = await llmClient.complete({
      system: AI_LOOP_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: ctx.userPrompt },
        { role: 'system', content: `Current state:\n${ctx.gantt}\n\nLast error: ${ctx.lastError ?? 'none'}` }
      ],
      tools: tools.toolDefinitions,
    });

    // 3. 执行 LLM 提的 patches
    const patches = response.tool_calls;
    let success = true;

    for (const patch of patches) {
      const result = tools.apply_patch(patch.args);
      stepLog.push({ kind: patch.tool, args: patch.args, result });

      if (!result.ok) {
        success = false;
        break;
      }
      currentTimeline = result.value;
    }

    if (success && response.is_done) break;
    iter++;
  }

  return { ok: iter < MAX_ITER, newTimeline: currentTimeline, steps: stepLog };
}

const AI_LOOP_SYSTEM_PROMPT = `
You are an AI assistant operating NextFrame, a frame-pure video editor.

You have 7 tools: find_clips, get_clip, describe_frame, apply_patch, assert_at, render_ascii, ascii_gantt.

You MUST follow the 5-step rhythm for every change:
  1. THINK: write your plan in plain text
  2. SEARCH: use find_clips/get_clip to gather context
  3. PATCH: use apply_patch with SYMBOLIC time only (never raw seconds)
  4. ASSERT: use assert_at to verify the change took effect
  5. RENDER: use render_ascii or ascii_gantt to visually confirm

Time rules:
- NEVER write raw numbers like start: 3.5
- ALWAYS use { after: 'clip-X', gap: 0.5 } or { at: 'marker-drum-1' }
- All times are quantized to 0.1s
- Display times in mm:ss.f format

If an assertion fails, the engine will rollback and tell you why. Read the error and try a different approach. After 3 failed attempts on the same op + clip, escalate to the user.
`;
```

---

## v0.1 集成顺序

1. **Foundation** (1 day)：W1 describe + W2 gantt + W3 ascii → 跑通到 engine/ 模块
2. **Patch surface** (1 day)：W4 symbolic time + W5 tools → workflows/ai-tools.js
3. **Loop** (1 day)：workflows/ai-edit.js + Anthropic API client + 5 步节奏
4. **Test** (0.5 day)：fixture 5 个中文需求，全部跑通
5. **CLI integration** (0.5 day)：`nextframe ai-edit` 暴露

总计 **4 天**（AI 时间约 1 天）。

---

## 验收标准

v0.1 ai-edit 通过的标准：

- [ ] 给 5 个中文需求（产品发布 / 教程开场 / 数据展示 / 鸡汤 / 倒计时），AI 全部能在 ≤ 3 iter 内出可渲染 timeline
- [ ] 95% 操作走 metadata，vision call ≤ 1 次/次需求
- [ ] 每个 timeline lint 0 error
- [ ] export 出的 mp4 实际播放正确

5/5 通过 = AI-native NextFrame 命题成立。
