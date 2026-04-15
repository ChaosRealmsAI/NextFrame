# effects-showcase · 16:9

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质

电影级 · 未来感 · Awwwards Site of the Day 那种"哇"感。
配 **AI 视觉进化**类科普视频 — 讲生成式视觉、神经渲染、shader、扩散模型。
不是"很好看"，要"让人想截图发朋友圈"。

参考：
- Bruno Simon 个人站（WebGL 质感）
- Linear / Vercel / Stripe 发布会落地页（霓虹、玻璃、流体）
- Awwwards Site of the Day 头部 30%（液态噪点 + 霓虹辉光 + 故障美学）

**信息密度低 / 视觉冲击高**。一屏就为了一张图爆炸。

---

## 配色（直接 hex 写到组件里）

### 背景层（深空 + 真黑）
- `--bg`     `#05060a`  主背景（接近真黑但不是 #000，留电影冷调）
- `--bg2`    `#0b0d18`  二级面板
- `--bg3`    `#13162a`  三级表面
- `--bg-in`  `#020308`  inset / 凹陷

### 文字（冷白系）
- `--ink`     `#eaf2ff`        主文字
- `--ink-75`  `rgba(234,242,255,.75)`  次文字
- `--ink-50`  `rgba(234,242,255,.50)`  辅助文字
- `--ink-25`  `rgba(234,242,255,.25)`  脚注 / 占位

### 主调（电光霓虹）+ 辅助
- `--neon-c`  `#00f0ff`  电光青（cyan）— 主辉光 / shader
- `--neon-m`  `#ff2bd6`  品红（magenta）— 故障 / 色散
- `--neon-y`  `#fff05c`  电光黄 — 高亮 / 闪烁
- `--neon-v`  `#7c4dff`  紫罗兰 — 粒子 / 深度
- `--neon-g`  `#39ff88`  毒绿 — 数据 / 波形
- `--neon-r`  `#ff3d3d`  警戒红 — error / glitch

### 透明度变体
- `--c-30`    `rgba(0,240,255,.30)`
- `--m-30`    `rgba(255,43,214,.30)`
- `--v-30`    `rgba(124,77,255,.30)`
- `--ink-glow` `rgba(234,242,255,.85)` 文字辉光内核

### 分割线 / 幽灵
- `--rule`   `rgba(234,242,255,.10)`
- `--ghost`  `rgba(234,242,255,.04)`

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'PingFang SC', sans-serif` | UI / 数据 |
| serif | `Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif` | 大数字 / 引用 |
| mono | `'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace` | 标签 / 标识符 |

**禁止外部字体下载**。

---

## 字号阶梯（1920×1080）

| 用途 | px | 行高 |
|------|----|------|
| Display 巨数 | 280 | 0.95 |
| H1 主标题 | 96 | 1.1 |
| H2 章节 | 64 | 1.2 |
| Body 大 | 36 | 1.55 |
| Body 默认 | 24 | 1.5 |
| Mono 标签 | 18 | 1.4 |

字重：`400 / 600 / 800`。霓虹文字必须 `font-weight: 800` 否则辉光不清楚。

---

## 网格（1920 × 1080）

- **安全边距**：左右 96，上下 80
- **可用区**：1728 × 920
- **主视觉中心**：(960, 540)
- **大数字锚点**：(960, 540)，字基线 ~ 640

---

## 视觉技术清单（每个组件展现 1 种）

| 组件 | 技术 | role | type |
|------|------|------|------|
| `bg-liquidNoise`     | SVG `feTurbulence` + `feDisplacementMap` 液态扭曲 | bg | svg |
| `content-shaderRipple` | SVG `feTurbulence` baseFrequency t-driven 模拟 shader 波纹 | content | svg |
| `content-particleField` | Canvas 2D 粒子系统 200+ 点 | content | canvas |
| `text-neonGlow`      | SVG `feGaussianBlur` + `feMerge` 多层霓虹辉光 | text | svg |
| `data-bigStat`       | SVG conic-gradient 圆环 + 透射巨数 + mix-blend | data | svg |
| `overlay-glitch`     | Canvas 2D 多通道 RGB 位移 VHS 故障 | overlay | canvas |

---

## 图层顺序（z 从下到上）

| 层 | role | 例 |
|----|------|----|
| 0 | bg | bg-liquidNoise |
| 1 | content | content-shaderRipple / content-particleField |
| 2 | data | data-bigStat |
| 3 | text | text-neonGlow |
| 4 | overlay | overlay-glitch |

---

## 命名约定

- 文件名：`{role}-{name}.js`，camelCase
- id = camelCase（不带前缀）

---

## 组件设计原则

1. **零 import**
2. **frame_pure: false**（全部 t-driven 持续动画）
3. **viewport-relative**
4. **18 AI 字段必填**，intent ≥ 80 字
5. **assets: []**
6. **必须有 idle motion**（呼吸 / loop / pulse），单帧静止 < 0.5s
7. **入场必须 t-driven**（pop / reveal / fly），不用 CSS @keyframes

---

## 改设计语言时

```bash
grep -rn "#00f0ff" src/nf-core/scenes/16x9/effects-showcase/
sed -i '' "s/#00f0ff/#新色/g" src/nf-core/scenes/16x9/effects-showcase/*.js
```
