# 任务 · v0.22.1 · 2 个 chrome 组件(cue-bar + progress-bar)

主 agent 持锁 `feature:v0.22.1-cue`。你是路 B · 写 2 个 v2 component:`html.cue-bar` + `html.progress-bar`。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 必读

```bash
cat spec/charter.md
cat spec/design/DESIGN.md                                              # 视觉规范 + tokens
cat examples/v021-explain/components/html.image-slide.js               # 现有 v2 component 范本(ABI 对了)
cat examples/v2-showcase/components/html.stage-background.js           # 另一范本
cat examples/v2-showcase/compositions/voice-subtitle-smoke.json | head -50  # subtitle words 样
cat tmp/v021-explain/audio/slide-01.timeline.json | head -30           # word 时间格式
grep -B2 -A8 "ctx:" frontend/nf-components/src/index.ts | head -25     # 看 ctx 结构(timeMs, durationMs, params, viewport...)
```

参考原型图(2 张 mockup 已确认设计):
- spec/versions/v0.22.1/(此版本目录 · 没有图 · 看下文 LAYOUT 段)

## harness preflight(硬)

```bash
harness tools
harness search "validate"
harness show nf-composition
```

复用 `nf composition validate`。

## 交付 2 件

### 1) `examples/v021-explain/components/html.cue-bar.js`

**主题** · 底部独立字幕条 · 显示当前 cue 整句 · 内部 word 走过加亮琥珀

**ABI**(v2 标准 · 跟 image-slide 同):
```js
export function mount(root, ctx) { ... }
export function update(root, ctx) { ... }
export function destroy(root) { ... }
```

注意 · `ctx.params` 含组件 params · `ctx.timeMs` 是当前时间(ms)· `ctx.localTimeMs` 是 track 内时间 · `ctx.viewport` = {w, h}。

**params 字段**:
```json
{
  "cues": [
    {
      "text": "现在 AI 出 3 张 hifi 图",
      "start_ms": 14000,
      "end_ms": 15940,
      "words": [
        {"text": "现", "start_ms": 14000, "end_ms": 14140},
        {"text": "在", "start_ms": 14140, "end_ms": 14260},
        {"text": "AI", "start_ms": 14260, "end_ms": 14380},
        ...
      ]
    },
    ...
  ]
}
```

**渲染**(底部独立 bar · viewport 12% 高):
```
┌──────────────────────────── viewport ────────────────────────────┐
│                                                                  │
│              (上面是 image-slide 跟 progress-bar)                 │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│   现 在 AI 出 3 张 hifi 图        ← 38pt · 已读字琥珀 · 未读暗白 │
└──────────────────────────────────────────────────────────────────┘
```

**逻辑**:
1. mount · 清 root · 创建 `<div class="cue-bar">` 占满 root(track time = 整个 composition 时长 · root 已被 runtime 设为 viewport 大小)· 在底部 12% 渲染 inner bar
2. update · 用 `ctx.timeMs` 找当前 cue:遍历 cues[] · 第一个满足 `start_ms <= timeMs < end_ms` 的 cue 是当前
3. 如果当前 cue 跟上次不同 · 清空 inner span list · 按 cue.words 创建一组 `<span>` · 每个 span 一个字
4. 每帧 · 遍历 spans · 如果 `word.end_ms <= timeMs` (已读完) → span color = 琥珀 #fbbf24 · 否则 灰白 60% (#fff @ 0.6 alpha)
5. cue 切换瞬间 · 旧 cue 整体淡出 · 新 cue 出现(可选 · 如果太复杂直接突变)

**视觉**:
- bar 高度 12% viewport · 底部固定
- bar 背景 `#0a0c10` · 1px top border `#1a1a22`
- 字号 38pt(可调 params.size_px · 默认 38)· 居中 · 单行 · 字间距 0.04em
- 颜色:已读琥珀 `#fbbf24` · 未读 `rgba(255,255,255,0.6)`
- 字体:Chinese sans-serif(PingFang SC / Noto Sans CJK)
- 没 emoji · 没 marker · 没时间数字

**性能** · 不在 update 里 querySelector · 缓存 spans 在 instance(把 spans 数组挂 root.dataset 或 closure)· 每帧 O(N) iterate spans 改 color 即可。

**禁** · 不 fetch · 不 import · 不 console.log spam

### 2) `examples/v021-explain/components/html.progress-bar.js`

**主题** · 顶部 4px 进度条 · 紫色 fill · 跟 ctx.timeMs / ctx.durationMs 走

**ABI** · 同上(mount/update/destroy)

**params 字段**(空也可 · 全部从 ctx 取):
```json
{
  "color": "#a78bfa",       // 可选 · 默认紫
  "track_color": "#2a2a32"  // 可选 · 默认灰底
}
```

**渲染**(顶部 4px 进度条):
```
─────────────────────────────────────  ← 总宽 viewport · 高 4px
████████████──────────────────────  ← 紫色 fill 35% · 灰底剩余
```

**逻辑**:
1. mount · 创 outer div(高 4px · 满宽 · 顶部 0)+ inner fill div(高 100% · width 0% 起 · transition smooth)
2. update · `ctx.timeMs / ctx.durationMs` * 100 = fill width %
3. 没字 · 没数字 · 没 timecode · 干净一条线
4. fill 颜色用 params.color 或默认紫 #a78bfa · track 用 params.track_color 或 #2a2a32

**视觉**:
- 4px 高 · 顶部固定
- fill 紫 · track 灰底
- transition `width 0.05s linear` 平滑

**禁** · 同上

## 共通铁律(v2 component)

1. **single-file** · 1 个 .js · 无 import / require / fetch
2. **mount(root, ctx)** + **update(root, ctx)** + **destroy(root)** 标准 ABI
3. **import-free** · 全 inline
4. ctx 取数:`ctx.params` 是组件 params · `ctx.timeMs` 当前时间 · `ctx.viewport` viewport 尺寸 · `ctx.params.cues` 拿 cues 数组
5. ABI 错示例 · `mount(root, params, ctx)` ❌ 错 · 看 image-slide.js 修过 · 是 `mount(root, ctx)` 拿 `ctx.params`

## 自验

```bash
ls examples/v021-explain/components/html.cue-bar.js
ls examples/v021-explain/components/html.progress-bar.js
grep -E "^(import|const.*require|fetch\\()" examples/v021-explain/components/html.cue-bar.js examples/v021-explain/components/html.progress-bar.js
# 上面应空(无 import / require / fetch)
```

## 禁

- 不 commit · 不动 nf-* 产品代码 · 不动 v2 schema
- 不动 image-slide(那是路 A 的别人产物 · 已工作)

## 报告

- ✅/❌ 2 文件存在 · 行数 · 无 import
- ✅/❌ 都 export mount/update/destroy
- ✅/❌ ctx.params.cues 接 cues[] · ctx.timeMs 找当前 cue
- 一句话 · 实现 + 踩坑
