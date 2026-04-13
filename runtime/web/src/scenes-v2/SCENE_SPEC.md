# Scene 组件接口规范（v0.3）

**所有组件必须遵守此接口。不符合的组件 lint 不通过。**

## 必填字段

```js
export default {
  // ── 身份（必填）──
  id: "headline",                      // 唯一 ID，必须等于文件名（不含 .js）
  type: "dom",                         // dom | canvas | svg | media
  name: "Kinetic Headline",            // 人类可读名
  
  // ── 分类（必填）──
  category: "Typography",              // 见下方分类表
  tags: ["text", "title", "gradient"], // 搜索标签，3-8 个
  
  // ── 描述（必填）──
  description: "大标题，渐变色文字，逐字错开入场",
  
  // ── 参数定义（必填）──
  params: {
    text: {
      type: "string",                  // string | number | boolean | array | object
      default: "TITLE",                // 默认值
      desc: "标题文字",                 // 一句话说明
    },
    fontSize: {
      type: "number",
      default: 72,
      desc: "字号(px)",
      min: 24,                         // 可选：最小值
      max: 200,                        // 可选：最大值
    },
  },

  // ── 生命周期（必填）──
  create(container, params) { },       // 创建 DOM/Canvas → return els
  update(els, localT, params) { },     // 每帧更新。DOM: localT 0~1, 其他: 秒
  destroy(els) { },                    // 清理
  
  // ── 可选 ──
  usage: "封面、章节标题、重点强调",     // 适用场景
  themes: ["dark", "warm", "neon"],    // 适合的主题风格
  presets: {                           // 常用配置
    cover: { fontSize: 110 },
    section: { fontSize: 72 },
  },
};
```

## 分类表（category）

| category | 说明 | 示例 |
|----------|------|------|
| Typography | 文字/标题 | headline, bulletList, typewriter |
| Code | 代码展示 | codeBlock, terminalCode |
| Data Viz | 数据图表 | barChart, lineChart, pieChart |
| Backgrounds | 背景效果 | auroraGradient, fluidBackground |
| Effects | 视觉特效 | particleFlow, circleRipple, confetti |
| Overlay | 叠加层 | subtitleBar, lowerThird, marquee |
| Layout | 布局容器 | featureGrid, card3d |
| Cards | 卡片/标注 | calloutCard, infoCard |
| Media | 媒体嵌入 | videoClip, audioTrack, imageHero |
| Chrome | 框架/外壳 | slideChrome, slideFrame |
| Numbers | 数字展示 | numberCounter, bigNumber, progressRing |
| Diagrams | 流程/时间线 | flowChart, timelineViz, agentLoop |

## tags 建议词

背景: background, gradient, particles, stars, noise
文字: text, title, subtitle, heading, paragraph, code, typewriter
数据: chart, bar, line, pie, radar, progress, number, counter
布局: grid, card, list, table, split, sidebar
动效: animation, stagger, pulse, wave, ripple, glow, confetti
媒体: video, audio, image, logo
风格: dark, warm, neon, minimal, corporate, playful
场景: cover, section, ending, transition, data-report, tutorial

## Lint 检查（validate 时自动执行）

1. id: string, 非空，**必须等于文件名**（headline.js → id:"headline"）
2. type: 必须是 dom/canvas/svg/media 之一
3. name: string, 非空
4. category: 必须在分类表里
5. tags: 数组, 3-8 个 string
6. description: string, 10 字以上
7. params: object, 每个 key 有 type + default + desc
8. create/update/destroy: function
