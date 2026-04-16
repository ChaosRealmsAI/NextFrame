# Step 3 · 自检（lint · smoke · gallery · checklist）

## 1 · scene-lint（AST 扫 6 种硬错）

```bash
node src/nf-cli/bin/nextframe.js scene-lint --ratio=<ratio> --theme=<theme>
```

扫：
- **L1** CSS `@keyframes` 出现在 render 字符串里（硬禁）
- **L2** 语法错
- **L3** `frame_pure:true` 但 render 读了 `t`
- **L4** `videoOverlay:true` 缺黑框占位
- **L5** render 签名和 type 不匹配（必须 `(t, params, vp)`）
- **L6** `intent` < 50 字
- **L7** type 不在白名单 `{dom, media}`（BLOCKED）

**必须 0 error 才能进下一步。**

## 2 · smoke test（字段齐 + render 不抛）

```bash
node src/nf-cli/bin/nextframe.js scene-smoke --theme=<theme> --json
```

期望：你的组件在列表里标 `pass: true`。

常见失败：
- `missing: intent` → intent 补到 ≥ 50 字真实推理
- `render() threw: xxx` → render 里用了未定义变量
- `render returned empty string` → 忘了 return
- `invalid type "html"` → type 只能 `dom | media`
- `frame_pure violation` → frame_pure 字段和 render 读 t 行为不一致

## 3 · gallery 真实视觉（浏览器）

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --theme=<theme>
```

自动开浏览器，点你的组件卡：
- 按 **Play** 看动画
- 拖 **scrubber** 看任意 t
- 右侧看 `describe()` 实时 JSON
- 对照 `intent` 写的"应该看到什么"

### 3.1 · 截图像素门禁（硬关卡）

**smoke PASS ≠ 视觉 OK**。必须截图确认真的有内容。

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --theme=<theme> --no-open &
npx playwright screenshot --full-page --wait-for-timeout 6000 \
  http://localhost:8765/gallery-<ratio-dir>-<theme>.html \
  tmp/gallery-check.png
```

截图人眼看：
- 每个组件卡片非黑像素 ≥ 30%
- 视觉主体一眼能认出
- 配色和 theme.md 一致

### 3.2 · scrub 门禁

从 `t=0 → t=end` 拖 scrubber：
- 每一时刻都有非黑内容
- 动画有明显变化（不是每帧一样）
- 回拖到同一 t 时画面一致（frame-pure）

常见失败：
- 画面空白 → return 没给内容，或 CSS 定位把内容推出画外
- 动画不动 → 没真正读 t
- scrub 重播 → 用了 `@keyframes`（回 Step 2 改 t-driven）
- 中文方框 → 字体 fallback 没加 `'PingFang SC'`

## 4 · 人眼 3 项检查（硬规则）

看 gallery 里的组件，人眼判：

1. **字号可读** — 1920×1080 下主信息 ≥ 28px，手机端（等比换算）主字 ≥ 42px
2. **留白合理** — 70% 画面空，内容 ≤ 40% 面积
3. **动画 t 驱动** — scrub 时画面平滑变化，不突变

**如果自动 smoke PASS 但人眼看着错了**（配色崩 / 动画不对 / 视觉主体缺失）→ **BLOCKED，报 opus**，不要硬着头皮走下一步。

## 5 · Checklist（不过关 = 重做）

### 视觉主体
- [ ] 有视觉主体（12 模式之一）
- [ ] 占画面 ≥ 40%
- [ ] 不是 "标题 + 副标 + bullet list" 纯文字

### 内容
- [ ] 单张截图能看懂
- [ ] 一个焦点不塞 5 件事
- [ ] `sample()` 真实业务内容
- [ ] `intent` ≥ 50 字真实推理

### 视觉
- [ ] 70% 画面空
- [ ] padding 达标
- [ ] 字号从 theme.md 4 级里挑
- [ ] 字体 3 族分工正确
- [ ] 只用 1 个主强调色

### 动画
- [ ] 入场 cubic-bezier（非 linear）
- [ ] 多元素 stagger 120-180ms
- [ ] 不静止 > 3s
- [ ] 读 t → `frame_pure: false`

### 契约
- [ ] type ∈ {dom, media}
- [ ] render 签名 `(t, params, vp) → string`
- [ ] 无 `@keyframes` / `Date.now` / `Math.random`
- [ ] scene-lint 0 error
- [ ] scene-smoke pass
- [ ] gallery 截图非黑像素 ≥ 30%

## 6 · 完成 = 4 条全绿

```
✓ scene-lint 0 errors
✓ scene-smoke pass
✓ gallery 截图过（非黑像素 ≥ 30%）
✓ 人眼 3 项过
```

## 下一步

全绿 → 回 `cargo run -p nf-guide -- produce` 继续 timeline + build + record
