# 03 — Component Contract

场景组件是视频的最小视觉单元。每个组件 = 一个 JS 文件，实现统一接口。

## 组件接口

每个组件必须 export 一个对象：

```js
export default {
  id: "headline",           // = 文件名，唯一
  name: "Headline",         // 显示名
  type: "dom",              // dom | canvas | svg | media
  ratio: "16:9",            // 16:9 | 9:16 | 4:3
  
  // 参数定义（AI 读这个知道怎么填）
  params: {
    title: { type: "string", required: true, desc: "标题文字" },
    subtitle: { type: "string", desc: "副标题" },
    fontSize: { type: "number", default: 0.06, desc: "标题字号（短边比例）" },
    color: { type: "color", default: "#ffffff" },
  },

  // 渲染：返回 HTML 字符串
  render(data, props) { return "<div>...</div>"; },
  
  // 语义描述：返回当前帧的文字描述（给 AI 看）
  describe(data, props, t) { return { phase: "...", elements: [...] }; },
  
  // 进入/退出动画（可选）
  enter: "fadeIn",
  exit: "fadeOut",
}
```

## 必须实现

| 方法/属性 | 必填 | 说明 |
|-----------|------|------|
| id | Y | = 文件名 |
| name | Y | 显示名 |
| type | Y | 渲染类型 |
| ratio | Y | 目标比例 |
| params | Y | 参数 schema |
| render(data, props) | Y | 返回 HTML |
| describe(data, props, t) | Y | 返回语义描述 |
| enter/exit | N | 动画名 |

## 参数类型

| type | JS 类型 | 约束 |
|------|---------|------|
| string | string | - |
| number | number | min/max 可选 |
| color | string | hex 或 rgba |
| boolean | boolean | - |
| select | string | options: string[] |
| array | any[] | items schema |

## 字号规范

组件不准硬编码 px 字号。必须用 `resolveSize(params.fontSize, S, fallback)`：

```js
// S = stage 短边
// params.fontSize 可以是：
//   0.06      → S * 0.06（比例）
//   "48px"    → 48（绝对值）
//   "large"   → 预设关键字
const size = resolveSize(params.fontSize, stageShortSide, 0.05);
```

## 响应式规则

- 不准硬编码 1920/1080
- 所有尺寸用比例或 resolveSize
- 同一组件 3 种比例变体：headline.js、headline_portrait.js、headline_43.js
- validate 会检查组件 ratio 是否匹配 timeline

## 命名

- 文件名 = id = camelCase
- 竖屏后缀 `_portrait`，4:3 后缀 `_43`
- 参数名 camelCase

## 新增组件流程

1. 写 `src/nf-runtime/web/src/components/myScene.js`
2. 在 `components/index.js` 注册
3. 实现 render + describe + params
4. 跑 `nextframe lint-scenes` 检查
5. 在 3 种比例下 `nextframe preview` 截图验证
6. 如果只支持一种比例，ratio 字段标明

## 去重规则

同一组件的比例变体（headline vs headline_portrait）共享渲染逻辑：

```js
// headline_shared.js — 共享渲染函数
export function renderHeadline(data, props, ratio) { ... }

// headline.js
import { renderHeadline } from './headline_shared.js';
export default {
  ratio: "16:9",
  render(data, props) { return renderHeadline(data, props, "16:9"); },
}
```

变体文件只传参数差异，不重复渲染逻辑。
