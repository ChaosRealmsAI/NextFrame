# 05 · 防呆机制

v0.1.0 的 safety net 以 `src/engine/validate.js`、`src/ai/tools.js` 和对应测试为准。

## 设计原则

1. 结构化错误优先于抛异常
2. 能在 metadata 层发现的问题，不拖到 ffmpeg
3. warning 不阻塞编辑，error 阻塞 render
4. AI mutation 必须带 validate 闭环

## 当前 6 道 gate

`validateTimeline()` 当前覆盖的 6 项检查如下。

| # | Gate | 失败动作 |
|---|---|---|
| 1 | Schema / required fields | error |
| 2 | Symbolic time resolve / cycle / range | error |
| 3 | Asset existence | warning |
| 4 | Unknown scene references | error |
| 5 | Same-track overlap | warning |
| 6 | Duplicate track / clip ids | error |

`test/safety-gates.test.js` 正在逐项验证这 6 个 gate。

## Gate 1 · Schema / required fields

检查内容：
- timeline 必须是 object
- `schema` 必须是 `nextframe/v0.1`
- `duration > 0`
- `project.width/height/fps > 0`
- `tracks` 必须是非空数组

典型错误：
- `BAD_TIMELINE`
- `BAD_SCHEMA`
- `BAD_DURATION`
- `BAD_PROJECT`
- `NO_TRACKS`

## Gate 2 · Symbolic time

检查内容：
- `{at|after|before|sync|until|offset}` 必须能 resolve
- 引用必须存在
- 不能形成 cycle
- resolve 后不能超出 `[0, timeline.duration]`

典型错误：
- `TIME_REF_NOT_FOUND`
- `TIME_CYCLE`
- `TIME_OUT_OF_RANGE`

## Gate 3 · Asset existence

检查内容：
- `assets[].path` 指向的文件是否存在

行为：
- 缺失资产不会让 `validateTimeline()` 失败
- 只产生 `MISSING_ASSET` warning

这和 v0.1 的“路径索引型资产管理”一致：可以先编辑，再补文件。

## Gate 4 · Scene references

检查内容：
- `clip.scene` 必须在 `REGISTRY` 中存在

典型错误：
- `UNKNOWN_SCENE`

错误会附带：
- `ref = clipId`
- `hint = available scenes ...`

## Gate 5 · Same-track overlap

检查内容：
- 同一条 track 中按 start 排序后，clip 之间是否重叠

行为：
- 重叠仅发 `CLIP_OVERLAP` warning
- 不阻止 validate success

## Gate 6 · Duplicate ids

检查内容：
- `track.id` 全局唯一
- `clip.id` 全局唯一

典型错误：
- `DUP_TRACK_ID`
- `DUP_CLIP_ID`

## Render 和 safety 的关系

v0.1.0 有一个关键修复：`render` 在碰 ffmpeg 之前就必须先 validate。

也就是说：
- `nextframe render` 会先调用 `validateTimeline()`
- 如果有 error，直接退出
- 不会继续调用 ffmpeg

这就是 `cli-render-8` 对应的实现约束。

## apply_patch 的额外约束

AI patch 路径在 `src/ai/tools.js`，和单纯的 `validateTimeline()` 不同，它还做两件事：

### 1. mutation 后自动 validate

`apply_patch` 会：
- 依次执行 op
- 每次在最终结果上调用 `validateTimeline()`
- 把 validation report 一起返回

所以它是“改动 + 校验”一体化入口。

### 2. 拒绝 raw numeric add-clip.start

`apply_patch` 有一条显式铁律：

```js
{ op: "add-clip", clip: { start: 3 } }  // reject
```

会返回：
- `RAW_SECONDS`

目的：
- AI add-clip 时强制使用 symbolic start
- 避免自动编排里把时间关系写死成脆弱的数字

注：
- 这条规则是 AI patch surface 的规则
- 不是整个 runtime 都禁止 numeric time

## 不是 validate gate、但仍属 safety 范围的事项

当前实现里，下面这些不再写成 `validateTimeline()` 的 gate：
- AI assertion DSL
- diff sanity
- vision spot-check
- autosave / crash recovery

这些在早期设计里出现过，但 v0.1.0 尚未作为统一 validator gate 落地。

## 验证命令

```bash
cd nextframe-cli
node --test test/safety-gates.test.js
node --test test/cli-render.test.js
```
