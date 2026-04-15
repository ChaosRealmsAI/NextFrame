# component recipe · 已知坑

每个坑都是真实踩过的。新 AI 进 recipe 前扫一眼。

## 坑 1 · 所有组件都静态（无动画）

**症状**：MP4 里 5 个 slide 每张都是快照，没入场动画。

**根因**：scene-new 生成的 render body 是纯 innerHTML 写死，没加 CSS @keyframes + animation。AI 直接交了。

**修复**：Step 02-craft 第 3 节的模板，inline `<style>` + `@keyframes fadeUp` + `animation: fadeUp 0.7s cubic-bezier(...) both`。

**防复发**：Step 03-verify checklist 加了"入场动画必查"项。

---

## 坑 2 · 动画每次 scrubber 拖动都重播

**症状**：gallery 里拖时间条，每次动画从头播一遍，视觉断裂。

**根因**：render 每帧都 `host.innerHTML = ...` 重置 DOM → CSS animation 重置。

**修复**：
```js
if (host._rendered && t > enter_dur) return;
host._rendered = true;
```

只在 `t < enter_dur` 时重写 DOM，之后保留首次结果。

---

## 坑 3 · Canvas 组件中文方框

**症状**：canvas 里的中文字显示为 □。

**根因**：`@napi-rs/canvas` 默认不加载系统 CJK 字体。

**修复**：全靠 `src/nf-cli/src/lib/canvas-factory.ts` 自动注册系统字体（已做）。`nextframe scene-smoke` 和 `scene-gallery` 都走 canvas-factory，自动注册。

**防复发**：别用 `createCanvas` from `@napi-rs/canvas` 直接导，统一走 `canvas-factory.ts`。

---

## 坑 4 · frame_pure:true 但 render 读 t

**症状**：MP4 里动画应该有但被跳帧，数字从 0 永远是 0。

**根因**：`frame_pure: true` 告诉 recorder "同 params 同输出"，recorder 只录第一帧。但 render 读了 t 做 counter 动画，应该是 dynamic。

**修复**：
- 静态（不读 t）→ `frame_pure: true`（可跳帧，快）
- 动态（读 t）→ `frame_pure: false`（每帧必录，慢但正确）

---

## 坑 5 · 纯文字 slide（无视觉主体）

**症状**：组件只有"H1 + 副标 + bullet list"，观众看不下去。

**根因**：懒得画视觉主体，偷懒做成纯文字。

**修复**：从 12 模式选一个，强制有真 artifact / 大数字 / 节点图。

**防复发**：Step 03-verify checklist 第 1 项："把文字全删掉还剩图吗？"

---

## 坑 6 · 中文字符串用 `"..."` 嵌 `"`

**症状**：`node --check` 报 `',' expected`，组件加载不出。

**根因**：中文描述里用 ASCII `"` 做强调，`"xxx"yyy"` 提前闭合字符串。

**修复**：
- 中文强调用 `『』` 或 `「」`，不用 `"`
- 或者转义 `\"`
- 或者 template string `\`...\``

**防复发**：scene-new 骨架注释里有提醒。

---

## 坑 7 · theme.md 改色但组件没改

**症状**：theme.md 主色改了，组件还是老色，gallery 里不一致。

**根因**：组件写死 hex 没 import，改 theme.md 不会自动传导。

**修复**：用 sed 批改
```bash
grep -rn "#da7756" src/nf-core/scenes/16x9/anthropic-warm/*.js
sed -i '' 's/#da7756/#新色/g' src/nf-core/scenes/16x9/anthropic-warm/*.js
```

改完跑 `nextframe scene-smoke` 确认都还过。

---

## 坑 8 · 组件的 role 填错

**症状**：gallery 里分类混乱，overlay 组件和 content 组件混在同一组。

**根因**：`role` 是软分类，AI 凭感觉填。

**正确分辨**：
- `bg` — 最底层，一张 slide 一个
- `chrome` — 品牌带 / 集数，全集共享，z 最上（不是 overlay）
- `content` — 主内容卡片/图/列表
- `text` — 纯文字（金句、大标题）覆盖 content
- `overlay` — 小徽章 / 章节标，浮在 chrome 之上
- `data` — 图表 / 数字（content 子类）

---

## 坑 9 · t 是 layer-local 不是 timeline-global

**症状**：组件以为 t=0 是视频开始，但实际是 layer.start 起算。

**根因**：render 收到的 `t = time - layer.start`。

**影响**：counter 动画从 0 开始每个 layer 都对，但如果组件想用"当前在整段视频中的进度"，需要 params 传 `globalT` 而不是用 render 的 t。

---

## 坑 10 · describe 返回和 render 画的对不上

**症状**：gallery 右侧 describe JSON 说 `visible: true`，但画面空白。

**根因**：describe 照抄了骨架，没根据实际 render 逻辑更新。

**修复**：describe() 的 elements/boundingBox 必须反映 render 真实画出来的东西。一个 JSON 对的值就等于 render 的调试输出。
