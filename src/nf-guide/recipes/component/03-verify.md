# Step 3 · 自检（lint + smoke + gallery + checklist 四关）

## 1 · scene-lint（AST 扫 6 种硬错）

```bash
node src/nf-cli/bin/nextframe.js scene-lint --ratio=<ratio> --theme=<theme>
```

检查：
- **L1** CSS `@keyframes` 在 render 里
- **L2** 语法错
- **L3** `frame_pure:true` 但读 `t`
- **L4** `videoOverlay:true` 缺黑框
- **L5** render 签名与 type 不匹配
- **L6** `intent < 50` 字

**必须 0 error 才能进下一步。**

---

## 2 · smoke test（30 字段 + render 不抛）

```bash
node src/nf-cli/bin/nextframe.js scene-smoke --ratio=<ratio> --theme=<theme>
```

期望：你的组件出现在列表里且标 `✓`。

最常见失败：
- `missing: intent` → 把意图写到 50+ 字
- `render() threw: xxx` → render 里用了未定义变量
- `render(host) did not mutate host or return HTML` → 忘了 `host.innerHTML = ...` 或 `return "..."`
- `invalid type "html"` → type 只能是 `dom|media`

---

## 3 · gallery 真实视觉（浏览器）

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=<ratio> --theme=<theme>
```

自动开浏览器，点你的组件卡 → 单组件详情页：
- 按 **Play** 看动画
- 拖 **scrubber** 看任意 `t`
- 右侧看 `describe()` 实时 JSON
- 对照 `intent` 里写的"应该看到什么"是不是真的看到

现在的查看方式只有两类：
- `dom` → 看 HTML/SVG/Canvas/滤镜/脚本组合后的真实画面
- `media` → 看资源占位、裁切、黑框、src 是否成立

### 3.5 · gallery 截图像素门禁（硬关卡）

**smoke pass ≠ 视觉 OK**。必须截图确认真的有内容。

```bash
node src/nf-cli/bin/nextframe.js scene-gallery --ratio=<ratio> --theme=<theme> --no-open &

npx playwright screenshot --full-page --wait-for-timeout 6000 \
  http://localhost:8765/gallery-<ratio-dir>-<theme>.html tmp/gallery-check.png
```

硬指标：
- 每个组件卡片非黑像素 ≥ 30%
- 视觉主体能一眼识别
- 配色与 `theme.md` 一致

### 3.6 · 详情页 scrub 门禁

拖 scrubber 从 `t=0 → t=end`：
- 每个时刻都有非黑内容
- 动画有明显变化
- 回拖到同一 `t` 时画面一致

常见失败：
- 画面空白 → innerHTML 没设，或内容飞出画布
- 动画不动 → 没真正读 `t`
- Canvas 变空 → 只序列化了 `<canvas>` 标签，没在真实 DOM 上重画
- 中文方框 → 改用系统字体

---

## 4 · Checklist 13 项

### 视觉主体

- [ ] 有视觉主体
- [ ] 视觉主体占画面 ≥ 40%
- [ ] 不是"标题 + 副标 + bullet list"纯文字
- [ ] 使用了 12 模式之一

### 内容

- [ ] 单张截图能看懂
- [ ] 一个焦点，不塞 5 件事
- [ ] `sample()` 用真实业务内容
- [ ] `intent` ≥ 50 字真实推理

### 视觉

- [ ] 70% 以上画面是空的
- [ ] padding 达标
- [ ] 字号只从 7 级里挑
- [ ] 字体分工正确
- [ ] 只用 1 个主强调色

### 动画

- [ ] 入场动画走 easeOut / cubic-bezier
- [ ] 没有 `linear` easing（除进度条）
- [ ] 多元素 stagger 120-180ms
- [ ] 不会静止 > 3 秒
- [ ] 如果读 `t`，`frame_pure: false`

### 契约

- [ ] smoke pass
- [ ] gallery 截图过
- [ ] 详情页 scrub 过
- [ ] 11 必填 + 18 AI 字段齐

---

## 5 · 红旗（立刻重做）

- ❌ 一帧只有标题+副标+bullet
- ❌ 纯文字页没有视觉主体
- ❌ 编造 artifact
- ❌ 硬编码跑偏的颜色
- ❌ 动画在 scrub 时重播或消失

---

## 6 · 完成 = 4 条全绿

```
✓ scene-lint 0 errors
✓ scene-smoke pass
✓ gallery 看到预期效果
✓ checklist 过关
```

## 下一步

全绿 → 回到 `nf-guide -- produce` 继续做 timeline + build + record
