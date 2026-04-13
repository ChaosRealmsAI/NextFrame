# Scene 组件开发规范（v0.4 — 固定比例）

**不做适配。一个比例一个组件。**

## 命名规则

```
headline.js              → 16:9 横屏（默认）
headline_portrait.js     → 9:16 竖屏
headline_square.js       → 1:1 方形
```

AI 根据 timeline 的 width/height 自动选组件：
- width > height → 用默认组件（headline）
- height > width → 用 _portrait 后缀
- width ≈ height → 用 _square 后缀

## 设计原则

1. **每个组件只为一个比例设计** — 布局/字号/间距全部写死
2. **16:9 基准 1920x1080** — 字号用 px，不用比例
3. **9:16 基准 1080x1920** — 字号用 px，专门设计竖屏布局
4. **1:1 基准 1080x1080** — 字号用 px，方形布局
5. **不用 resolveSize** — 直接写 px，因为比例固定
6. **不用 getStageSize** — 比例已知，直接设计

## 字号参考

| 用途 | 16:9 (1920宽) | 9:16 (1080宽) | 1:1 (1080宽) |
|------|--------------|--------------|-------------|
| 大标题 | 96px | 56px | 64px |
| 标题 | 64px | 40px | 48px |
| 正文 | 28px | 24px | 24px |
| 小字 | 20px | 18px | 18px |
| 图表标签 | 24px | 20px | 20px |

## 组件模板

```js
export default {
  id: "headline",           // 默认 = 16:9
  type: "dom",
  name: "Headline (16:9)",
  category: "Typography",
  ratio: "16:9",            // 新增：标明适用比例
  tags: ["text", "title"],
  description: "横屏大标题，1920x1080 专用",
  params: {
    text:     { type: "string", default: "TITLE", desc: "标题文字" },
    fontSize: { type: "number", default: 96,      desc: "字号(px)" },
  },
  get defaultParams() { ... },
  create(container, params) { ... },
  update(els, localT, params) { ... },
  destroy(els) { ... },
};
```

## lint 检查

1. id = 文件名
2. ratio 字段必填："16:9" / "9:16" / "1:1"
3. 默认组件（无后缀）ratio 必须是 "16:9"
4. _portrait 后缀 ratio 必须是 "9:16"
5. _square 后缀 ratio 必须是 "1:1"
