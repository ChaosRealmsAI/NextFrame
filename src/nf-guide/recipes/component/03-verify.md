# Step 3 · 自检（smoke + gallery + checklist 三关）

## 1 · smoke test（30 字段 + render 不抛）

```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=<ratio> --theme=<theme>
```

期望：你的组件出现在列表里且标 `✓`。

**失败 → 看报错，最常见**：
- `missing: intent` → 填真实意图 50+ 字
- `render() threw: xxx` → render 里调用了未定义变量
- `render(host) did not mutate host` → forgot to set innerHTML or appendChild
- `invalid type "html"` → type 必须是 canvas|dom|svg|media

---

## 2 · gallery 真实视觉（浏览器）

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=<ratio> --theme=<theme>
```

自动开浏览器，点你的组件卡 → 单组件详情页：
- 按 **Play** 看动画
- 拖 **scrubber** 看任意 t 的画面
- 右侧看 describe() 实时 JSON
- 对照 intent 里写的"应该看到什么"是不是真的看到

**失败情况**：
- 画面空白 → innerHTML 没设或 CSS 把内容藏到画布外
- 动画不动 → CSS `animation:` 忘加 `both`，或忘 `@keyframes`
- 每次 scrub 动画重播 → render 忘 `host._rendered` 缓存
- 中文方框 → 改用系统字体 `'PingFang SC'` / `'Noto Serif SC'`

---

## 3 · Checklist 13 项（人眼/AI 过一遍）

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
- [ ] gallery 看到预期效果？
- [ ] 11 必填 + 18 AI 理解字段全齐？
- [ ] TODO 注释块已删，status 从 experimental 改为 stable？

---

## 4 · 红旗（立刻重做）

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

## 5 · 完成 = 3 条全绿

```
✓ smoke test pass
✓ gallery 看到预期效果（含动画）
✓ checklist 13 项全过
```

不过 = 不交付，不算完。

## 下一步

全绿 → 回到 `nf-guide -- produce` 继续做 timeline + build + record
