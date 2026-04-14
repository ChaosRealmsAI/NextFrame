# 05 — Visual Language

## 设计系统：Obsidian Velvet

暗色系、高对比、专业感。所有 UI 和视频画面共用一套视觉 token。

## 色板 Token

| Token | 值 | 用途 |
|-------|-----|------|
| --bg | #0a0a0c | 最深背景 |
| --surface | #111114 | 卡片/面板背景 |
| --card | #161619 | 悬浮卡片 |
| --accent | #7c6aef | 主强调色（紫） |
| --green | #3eb370 | 成功/生成完成 |
| --yellow | #e0a040 | 警告/编码器 |
| --red | #ff8a8a | 错误 |
| --ink | #e4e4e8 | 主文字 |
| --ink-mid | rgba(228,228,232,0.75) | 次要文字 |
| --ink-dim | rgba(228,228,232,0.5) | 弱文字 |
| --ink-mute | rgba(228,228,232,0.25) | 极弱/标签 |
| --border | rgba(255,255,255,0.06) | 边框 |

**组件只引用 token，不硬编码颜色值。**

## 字体梯度

| 级别 | 大小 | 用途 |
|------|------|------|
| display | 24-28px | 大标题 |
| heading | 16-18px | 区块标题 |
| body | 13-14px | 正文 |
| caption | 11-12px | 标签/辅助 |
| mono | 11px | 代码/时间码 |

字体族：
- 正文：-apple-system, SF Pro Text, system-ui
- 代码：SF Mono, Menlo, monospace
- 衬线（视频字幕）：Georgia, Times New Roman, serif

## 间距系统

基础单位 4px，只用 4 的倍数：

| 名称 | 值 | 用途 |
|------|-----|------|
| xs | 4px | 紧凑间距 |
| sm | 8px | 元素间 |
| md | 12px | 组件内 |
| lg | 16-20px | 区块间 |
| xl | 24-32px | 大区间 |

## 动画曲线

| 名称 | 值 | 用途 |
|------|-----|------|
| ease-out | cubic-bezier(0.16, 1, 0.3, 1) | 大部分交互 |
| ease-in-out | cubic-bezier(0.65, 0, 0.35, 1) | 页面切换 |
| spring | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性效果 |

默认时长：hover 150ms，展开 200ms，页面 300ms。

## 视频内容安全区

| 比例 | 上 | 下 | 左 | 右 |
|------|---|---|---|---|
| 16:9 横屏 | 5% | 5% | 3% | 3% |
| 9:16 竖屏 | 15% | 10% | 5% | 5% |
| 4:3 PPT | 5% | 5% | 5% | 5% |

文字最小字号：横屏 18px，竖屏 24px。
