# Step 3 · 自检（lint + smoke + gallery + checklist 四关）

## 1 · scene-lint（AST 扫 7 种硬错，防呆第一道）

```bash
node src/nf-cli/bin/nextframe.js scene-lint --ratio=<ratio> --theme=<theme>
```

检查 7 种坑：
- **L1** CSS @keyframes 在 render 里（pit 1）
- **L2** 语法错（含 ASCII `"` 嵌中文，pit 6）
- **L3** frame_pure:true 但读 t（pit 4）
- **L4** videoOverlay:true 缺黑框（pit 11）
- **L5** render 签名与 type 不匹配
- **L6** intent < 50 字
- **L7** frame-pure runtime 违规：`particle` 禁 `Math.random`，`motion` 禁 `requestAnimationFrame` / `setTimeout` / `setInterval` / `Date.now` / `performance.now`

出 error → 改完重跑。出 warning → 看情况决定修不修。

**必须 0 error 才能进下一步。**

## 2 · smoke test（30 字段 + render 不抛）

```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=<ratio> --theme=<theme>
```

期望：你的组件出现在列表里且标 `✓`。

**失败 → 看报错，最常见**：
- `missing: intent` → 填真实意图 50+ 字
- `render() threw: xxx` → render 里调用了未定义变量
- `render(host) did not mutate host` → forgot to set innerHTML or appendChild
- `invalid type "html"` → type 必须是 canvas|dom|svg|media|particle|motion

### 2.5 · frame-pure 复验（新 type 必看）

如果你的本地 CLI 已支持：

```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=<ratio> --theme=<theme> --verify-frame-pure
```

它的语义是：**同一 `(t, params)` 连跑两次 render，输出必须一致**。
- `particle` 看粒子状态序列化
- `motion` 看 SVG 序列化

如果本地还没挂这个 flag，也按这个标准手工想一遍：给同样的 `t`，画面必须可复现，不能偷读系统时钟或真实随机数。

---

## 3 · gallery 真实视觉（浏览器）

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=<ratio> --theme=<theme>
```

自动开浏览器，点你的组件卡 → 单组件详情页：
- 按 **Play** 看动画
- 拖 **scrubber** 看任意 t 的画面
- 右侧看 describe() 实时 JSON
- 对照 intent 里写的"应该看到什么"是不是真的看到

新 type 的查看方式：
- `particle` → 看 Canvas 2D 粒子分层、密度、呼吸是否成立
- `motion` → 看 SVG 图层、behavior 节奏、shape 尺度是否成立

### 3.5 · gallery 截图像素门禁（硬关卡 · 强制）

**smoke pass ≠ 视觉 OK**。必须用 playwright 截图+像素检测确认真的有内容。

```bash
# 1. 启动 gallery 后台
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=<ratio> --theme=<theme> --no-open &

# 2. playwright full-page 截图
npx playwright screenshot --full-page --wait-for-timeout 6000 \
  http://localhost:8765/gallery-<ratio-dir>-<theme>.html tmp/gallery-check.png

# 3. Read 截图 + 肉眼/像素检查每个组件卡片
```

**硬指标**：
- 每个组件卡片非黑像素 ≥ 30%（Read 后用眼看，或脚本算）
- 组件视觉主体能一眼识别（心就是心 / 数字就是数字 / 图就是图）
- 配色与 theme.md 一致（米白主题组件不能黑底）

**不过 = 重写。** 不是补丁。

### 3.6 · 详情页 scrub 门禁

每个新 type 组件点进详情页后，拖 scrubber 从 t=0 → t=end：
- 画面每个时刻都有非黑内容（不能中间黑一截）
- 动画有明显变化（静帧 = 废）
- 回拖到同一 t 画面完全一致（frame-pure 视觉验证）

**失败情况**：
- 画面空白 → innerHTML 没设或 CSS 把内容藏到画布外
- 动画不动 → 没有真正读 `t`，或新 type 没按 contract 返回 runtime config
- motion 缩略图几乎看不见 → `size/viewBox` 和实际 shape 尺度不成比例（见 pitfalls 19）
- particle 每次刷新都长得不一样 → render 里偷用了 `Math.random`（见 pitfalls 20）
- 中文方框 → 改用系统字体 `'PingFang SC'` / `'Noto Serif SC'`

---

## 4 · Checklist 13 项（人眼/AI 过一遍）

### 视觉主体（命门）

- [ ] **有视觉主体** — 文字全删掉，还剩一张有意义的图吗？
- [ ] 视觉主体占画面 ≥ 40%？
- [ ] 不是"标题 + 副标 + bullet list"纯文字（除非 reveal/rule）？
- [ ] 使用了 12 模式之一，不是混合或自创？

### 内容

- [ ] tweet-line — 这组件单张截图能看懂？
- [ ] 一个焦点，不塞 5 件事？
- [ ] sample() 用真实业务内容（不是 Lorem ipsum）？
- [ ] intent ≥ 50 字真实推理，不是套话？

### 视觉

- [ ] 70% 以上画面是空的（留白达标）？
- [ ] padding ≥ 140px top/bottom 或 80px 左右？
- [ ] 字号只从 7 级里挑（display/headline/title/body/label/caption/mini）？
- [ ] 字体分工正确（serif 给大字/italic / mono 给 label/code / sans 其他）？
- [ ] 只用 1 个主强调色 `--ac`，配角色只用 1 个？
- [ ] 没有硬编码的硬色值（除了从 theme.md 复制的 hex）？
- [ ] 没有 `text-overflow: ellipsis`（文字不被截断）？

### 动画

- [ ] 入场动画走 `cubic-bezier(0.16,1,0.3,1)` 或 `easeOut`？
- [ ] 没有 `linear` easing（除进度条）？
- [ ] 多元素 stagger 间隔 120-180ms？
- [ ] 没有 `box-shadow / rotate / skew / bounce`？
- [ ] 不会有静止 > 3 秒的段？
- [ ] render 有 `_rendered` 缓存防动画重播？
- [ ] 如果有 t-driven 动画，`frame_pure: false`？

### 契约

- [ ] smoke test 通过（`scene-smoke --ratio --theme`）？
- [ ] **gallery 截图 playwright + 非黑像素 ≥ 30%**（强制 · §3.5）？
- [ ] **详情页 scrub 每时刻都有画面**（强制 · §3.6）？
- [ ] gallery 配色与 theme.md 一致？
- [ ] 11 必填 + 18 AI 理解字段全齐？
- [ ] TODO 注释块已删，status 从 experimental 改为 stable？

---

## 5 · 红旗（立刻重做）

出现以下任一 → **整组件重做**，不是补丁：

- ❌ 一帧只有标题+副标+bullet（除 reveal/rule）
- ❌ 纯文字页没有视觉主体
- ❌ 数字没有对比锚点（metric 废了）
- ❌ 标注 > 3 个（annotate 散焦）
- ❌ 节点 > 7 个（system 看不清）
- ❌ 写了原始 linear easing
- ❌ 用 Emoji 当主视觉
- ❌ 编造 artifact（假代码假数据）
- ❌ 硬编码 hex 但没对照 theme.md（色调跑偏）
- ❌ 动画在 scrubber 拖动时每次重播

---

## 6 · 完成 = 4 条全绿

```
✓ scene-lint 0 errors
✓ scene-smoke pass
✓ gallery 看到预期效果（含动画）
✓ checklist 13 项全过
```

不过 = 不交付，不算完。

## 下一步

全绿 → 回到 `nf-guide -- produce` 继续做 timeline + build + record
