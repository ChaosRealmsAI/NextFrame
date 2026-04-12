# 05 · 防呆机制

NextFrame 的所有"safety net"。每条都是免费的（pure logic 或 metadata），强制执行。

---

## 设计哲学

1. **免费 > 付费**：能用 metadata 解决就不用 vision API
2. **拦在源头**：apply_patch 调用前 validate，不要让坏数据进 timeline
3. **AI hint 友好**：每个错误都给"AI 怎么修"的 hint
4. **永远不静默失败**：宁可大声 error，不可悄悄吞
5. **可解释**：每个拒绝都有 code / message / ref / hint 4 字段

---

## 6 道防呆闸

每次 `apply_patch` 或 `validate_timeline` 都跑这 6 道：

| # | 闸 | 触发 | 失败动作 |
|---|---|---|---|
| **1** | Schema 校验 | timeline 字段类型/必填 | reject patch + error |
| **2** | Symbolic time resolve | `{after:'X'}` 里 X 必须存在 | reject + hint "available markers: ..." |
| **3** | Asset 存在 | 引用的 mp4/png/srt/font 在磁盘 | warning + fallback placeholder |
| **4** | Reference 完整 | 没有 dangling clipId / sceneId | reject + hint "did you mean ..." |
| **5** | AI assertion 通过 | apply_patch 后 describe_frame 必须满足 expected | rollback + give error to LLM |
| **6** | Diff sanity | patch 改的字段数 ≤ N（N 由 op 类型决定）| warning |

详细每道：

---

### 闸 1 · Schema 校验

跑 `validate_timeline()`。检查：

- `timeline.schema` 字符串匹配支持版本
- `timeline.duration` > 0
- `timeline.project.{width,height,fps}` 存在且 > 0
- 每个 `track.id` 唯一
- 每个 `clip.id` 全 timeline 唯一
- 每个 `clip.scene` 在 SCENE_REGISTRY 里
- `clip.start` + `clip.dur`（resolve 后）在 `[0, timeline.duration]`
- 同 track clip 不重叠
- params 类型符合 SCENE_META.params schema

**输出**：`{ok, errors[], warnings[], hints[]}`

**测试**：50+ test fixtures，正负 case 全覆盖。

---

### 闸 2 · 符号时间 resolve

跑 `resolveTimeline()`。检查：

- 每个 `TimeExpression` 引用的 anchor 存在
- 没有循环引用（cycle detection via topo sort）
- resolve 后值在 `[0, duration]` 内

**失败 hint**：列出所有可用 anchor 名给 AI。

**示例 error**：
```json
{
  "code": "TIME_REF_NOT_FOUND",
  "message": "clip 'clip-headline' references {after: 'clip-aurorra'}",
  "ref": "clip-headline",
  "hint": "Did you mean 'clip-aurora'? Available: clip-aurora, clip-chart, marker-drum-1"
}
```

---

### 闸 3 · Asset 存在

每次 `validate_timeline` 或 `export`，scan 所有 `assets[].path`，确认文件存在 + 在沙盒内。

**沙盒规则**：
- path 必须在项目目录或用户 home 目录下
- 不允许 `..` 越界
- 不允许绝对路径越权（`/etc/passwd` 拒绝）
- symlink 解析后再检查

**失败动作**：
- v0.1 lint：warning + 渲染时画 placeholder（红色 "missing: filename.mp4"）
- v0.2 GUI：弹"重新链接"对话框

---

### 闸 4 · Reference 完整

graph traversal 检查：

- `chapter.start` / `chapter.end` 引用的 marker 存在
- `clip.start` / `clip.dur` 引用的 anchor 存在
- `keyframe.t` 引用的 anchor 存在
- 删除一个 clip 前，warning 所有引用它的 patches

**失败 hint**：列出所有引用 + suggest 删除/修复。

---

### 闸 5 · AI assertion

每次 `apply_patch` 后，**强制 AI 提交一个 expected 断言**：

```js
apply_patch_with_assertion({
  patch: { op: 'moveClip', clipId: 'X', start: { after: 'Y' }},
  expected: [
    { at: 'clip-X.start - 0.1', predicate: 'clip-X.visible == false' },
    { at: 'clip-X.start + 0.1', predicate: 'clip-X.visible == true' },
  ]
});
```

engine resolve patch → describe_frame at expected 时间点 → assert predicate。

**任何一条 false → rollback patch + return error 给 AI**：

```json
{
  "code": "ASSERTION_FAILED",
  "message": "After moveClip clip-X to {after: clip-Y}, expected clip-X visible at t=clip-X.start+0.1, but got visible:false",
  "ref": "clip-X",
  "hint": "clip-X 的 phase 可能没正确 reset。检查 scene's enter phase 时长 vs gap"
}
```

**这是闭环的关键**。AI 不能盲目改完 patch 就走。

---

### 闸 6 · Diff sanity

每次 patch 后比较 oldTimeline 和 newTimeline 的 jsondiff size。

**预期值**（每个 op）：
- `moveClip`：1 字段改 → diff size = 1
- `setParam`：1 字段改 → diff size = 1
- `addClip`：1 array push → diff size ≤ 5
- `removeClip`：1 array splice → diff size = 1
- `splitClip`：array splice + 1 add → diff size ≤ 8

**超过 → warning**："这次 patch 改了 50 个字段，远超 moveClip 的预期 1 个。是否有意？"

防止 AI 因为某个 bug rewrite 整个 timeline。

---

## 防呆专门给 AI 的扩展

### 7. 命令循环检测

如果 AI 在最近 N 次 patch 中相同 op + 相同 clipId 出现 ≥ 3 次 → flag "stuck loop"，要求 AI 换思路或升级人工。

### 8. 时间分辨率检查

任何 raw time 不在 0.1s 网格上 → warning + auto-quantize。

### 9. 字体可用性检查

scene META 声明的 font 在系统不存在 → warning + fallback 到 system-ui。

### 10. 字幕长度检查

subtitle clip 时长 > 7s → warning "用户来不及读"。
subtitle clip 时长 < 0.5s → warning "一闪而过"。

### 11. 字幕字数密度检查

`textOverlay` 等 scene 的 text 长度 / clip duration > 5 字符/秒 → warning "速度过快"。

### 12. 颜色对比度检查

`textOverlay` 的 color vs 同位置背景颜色 → 计算 WCAG contrast ratio < 4.5:1 → warning "可读性差"。

由 W7 vision 验证：当 metadata flag 这条时，调一次 vision spot-check 确认。

---

## Lint 4 个等级

```
ERROR    阻止 render / save / export，必须修
WARNING  允许继续但显眼提示，e.g. 字幕过长
INFO     轻微提示，e.g. 命名建议
HINT     AI 友好的修复建议，e.g. "试试加上 fontSize: 80"
```

CLI：
```bash
nextframe lint project.nfproj
# Errors: 2  Warnings: 5  Hints: 3
# ❌ ERROR clip-headline: TIME_REF_NOT_FOUND ...
# ⚠️ WARN  clip-subtitle: SUBTITLE_TOO_LONG (8.2s) ...
# 💡 HINT  clip-x: try setting fontSize=80 for better readability
```

`--strict` flag：把 warning 升级为 error，CI 用。

---

## Vision spot-check（W7 决策）

**只在以下场景调 vision LLM**：

1. 闸 12 颜色对比度 < 4.5:1 → spot-check 确认
2. 闸 10 字幕过长 → spot-check 确认能否塞下
3. export 前对 chapter 边界帧 + peak action 帧做最终 vision pass
4. AI 自己 request `vision_check(t, "look at this frame, is X visible?")`

**vision spot-check 的 budget**：
- 1 个 timeline / 1 次 export ≤ 5 次 vision call
- 超过自动降级到只跑 metadata 检查 + warn

**provider**：
- v0.1：用本 Claude 进程的 Read tool 看本地 PNG（W7 已验证可行，0 API cost）
- v0.2：可选配 Anthropic API key 用更新的 vision

---

## 故障恢复

### Scene 渲染异常

scene 函数抛 error → engine catch → 画黑底红字 "Scene 'X' crashed: <message>" → 继续渲染其他 scene。

**单 scene crash 不污染整帧** — 这是 frame-pure 的红利。

### Engine 自身异常

`renderAt` 抛 → 上层 try/catch → 返回 `{ok:false, error}` → CLI 退出码 2。

### Export 中途失败

frame N 出错 → 继续渲下一帧，最后报告 missed frames + 用前一帧 placeholder 填补 → 继续 ffmpeg pipe。

最坏情况：mp4 可播但有几帧黑屏 + log 标记。

### Crash recovery

每次 patch 后写 `.nfproj.autosave`，下次启动检测，提示用户恢复。

---

## Tests

每个闸 fixture 在 `tests/safety/{N}-{name}.test.js`：

- 50+ "should pass" cases
- 50+ "should fail" cases 每个带 expected error code
- E2E：故意构造一个坏 timeline 跑 lint，期望返回的 errors 数 + codes 严格匹配

CI 强制 100% 闸覆盖（每个闸至少 5 个正负 case）。

---

## 引用

- [00-principles](./00-principles.md) — 错误是 value 的原则
- [04-interfaces](./04-interfaces.md) — ValidationError 字段定义
- [06-ai-loop](./06-ai-loop.md) — 闸 5 的 AI 闭环细节
