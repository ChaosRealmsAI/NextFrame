# 公众号排版技术规范

**写公众号文章前必读。所有结论经 30 项实测验证（2026-04-04）。**

## 一、注入原理

```
AI 写 inline-style HTML → mp.sh body 注入 ProseMirror innerHTML → 公众号保存
```

公众号编辑器只认 inline style。没有 `<style>` 标签、没有外部 CSS、没有 class、没有 JS。135编辑器/壹伴/doocs-md 的输出本质一样——带 `style=""` 的 HTML 标签。

## 二、HTML 标签白名单

```
✅ 能用
p h1-h6 span strong/b em/i u br section blockquote
ul ol li（最多两层嵌套）
table tr td（样式可能被吃）
img（必须 mmbiz.qpic.cn 域名）
a（外链弹安全提示）
svg（含 animate 交互）
mpvoice mpvideo（微信专属）

❌ 不能用
script iframe form input button style object embed
div（不稳定，用 section 替代）
```

## 三、CSS 属性

### 能用

```
font-size（用 px，不用 rem/em）
color
font-weight
font-style
line-height（建议 1.8-2.0）
letter-spacing
text-align（left/center/right）
text-decoration
text-indent（首行缩进用 2em）
background-color
border / border-radius / box-shadow
opacity
padding（比 margin 更可靠）
margin（px/vw 可以，% 不行）
max-width
display（block/inline-block/flex）
vertical-align
pointer-events
```

### 被删除

```
position（全部，用 flex+margin 替代）
z-index（无 position 无意义）
float（展开内容脱离文档流）
transform（不稳定，% 单位失效）
@media / @keyframes / :hover
id 属性 / class 属性
```

### 致命陷阱

```
⚠️ font-family → 会导致整段 style 被丢弃！绝对不要用
⚠️ margin 用 % 单位 → 失效
⚠️ background: linear-gradient() → 不太稳定，部分设备不渲染
```

## 四、深色模式（30 项实测结论）

**核心规则：微信只转灰度色，不转彩色。**

```
灰度色（#000 #333 #999 #fff 等）→ 被自动反转
彩色（#c49a3c #1a6fff #ec4899 等）→ 保持不变
渐变 / SVG / border 彩色 → 保持不变
```

**data 属性实测：**

```
data-darkmode-bgcolor    → ❌ 编辑器注入不生效
data-darkmode-color      → ❌ 编辑器注入不生效
data-darkmode-bgcolor-ID → ❌ 不生效
data-dark-bgcolor        → ❌ 不生效
data-style-dark          → ❌ 不生效
color-scheme             → ❌ 不生效
data-no-dark="true"      → ✅ 阻止转换，元素保持原色
```

**适配方案：用带色相的颜色替代灰度色。** 肉眼几乎看不出区别，但微信不会转换。暗色元素加 `data-no-dark="true"` 锁住。

## 五、色板

### 暖色系（推荐，深浅通吃）

```
卡片底       #f5f0e8   微暖黄白（替代 #f0f0f0 灰白）
卡片边框     #e8dcc8   暖米色（替代 #eee 灰边）
标题         #2c1810   深棕（替代 #1a1a1a 黑）
正文         #5c4a35   中棕（替代 #3f3f3f 深灰）
辅助文字     #9a8470   淡棕（替代 #999 灰）
弱文字       #b8a88a   更淡棕（替代 #bbb 浅灰）
强调         #c49a3c   金色
暗色卡片底   #1a1410   深棕黑（配合 data-no-dark）
暗色分割线   #2a2018   暗棕
```

### 多色标签（彩色不被转换）

```
金   背景 rgba(196,154,60,0.12)   文字 #c49a3c
蓝   背景 rgba(37,99,180,0.10)    文字 #2563b4
红   背景 rgba(180,60,80,0.10)    文字 #b43c50
绿   背景 rgba(34,140,80,0.10)    文字 #228c50
紫   背景 rgba(140,80,180,0.10)   文字 #8c50b4
橙   背景 rgba(180,100,40,0.10)   文字 #b46428
```

## 六、排版原则

1. **外框**：整篇用 `<section style="padding:0 8px;">` 包裹
2. **暗色外框**：加 `border-radius:16px; border:1px solid #2a2018;` + `data-no-dark="true"`
3. **段落**：`font-size:15px; color:#5c4a35; line-height:2.0; letter-spacing:0.5px;`
4. **列表**：用 `section + display:flex` 模拟，不用原生 `ul/li`（微信会吃样式）
5. **外链**：转脚注或删掉链接（微信阻止外链跳转）
6. **padding > margin**：padding 更可靠，margin 有时被吃
7. **暗色元素**：每个 section/p 都加 `data-no-dark="true"`
8. **图片**：必须上传微信素材库拿 `mmbiz.qpic.cn` 链接
9. **不要 font-family**：会导致整段样式丢弃

## 七、SVG 交互

```html
<!-- 点击展开 -->
<svg viewBox="0 0 690 260" width="100%" xmlns="http://www.w3.org/2000/svg">
  <rect rx="10" fill="#f5f0e8" stroke="#e8dcc8"/>
  <text>点击展开</text>
  <animate attributeName="height"
    begin="click" dur="0.4s"
    from="60" to="260"
    fill="freeze" restart="never"/>
  <!-- 隐藏内容 opacity 0→1 -->
  <text opacity="0">
    隐藏文字
    <animate attributeName="opacity"
      begin="click" dur="0.4s" to="1"
      fill="freeze" restart="never"/>
  </text>
</svg>
```

**注意：**
- SVG 颜色不受深色模式转换影响
- `restart="never"` 在 iOS 上可能不生效
- 不能嵌套 SVG
- ID 会被微信删除
- 编辑器里看不到交互效果，必须手机预览

## 八、工作流程

```
1. 读本规范 + 读 atoms/ 原子库
2. AI 根据文章内容直接写 inline-style HTML
3. 从 atoms/ 里挑组件组合，根据内容定制
4. mp.sh body 注入
5. 截图验证
6. 保存草稿 → 手机预览（浅色+深色都看）
7. 确认无误 → 发布
```

## 九、原子库索引

```
mp-atoms/atoms-typography.html   文字排版（段落/强调/标题/章节）
mp-atoms/atoms-quotes.html       引用与金句（书摘/竖线/卡片/大金句）
mp-atoms/atoms-layout.html       布局（双栏/三列/图标行/编号/时间轴）
mp-atoms/atoms-data.html         数据可视化（大数字/进度条/对比卡片/标签）
mp-atoms/atoms-dividers.html     分割线（实线/虚线/渐变/菱形/品牌条）
mp-atoms/atoms-dark.html         暗色组件（数据面板/引用/外框）
mp-atoms/atoms-interactive.html  SVG 交互（展开/问答/色块）
```
