# P3 · 视觉 token 一致性 (软报告)

## 守护

`spec/design/DESIGN.md` + `spec/design/tokens.css` 是项目视觉唯一源。所有产品 UI **禁硬编码色 / 字号 / 圆角 / 阴影** · 必用 `var(--token-*)`。

防 "每页长相不一样" 的 drift。

## 规则

### 产品类 HTML / CSS (spec/design/prototypes/ · frontend/)

- 颜色: 只用 `var(--color-*)` · 禁 `#xxx` / `rgb(...)` / `hsl(...)` 直写
- 字号: 只用 `var(--fs-*)` · 禁 `font-size: 14px` 直写
- 圆角: 只用 `var(--radius-*)` · 禁 `border-radius: 8px` 直写
- 阴影: 只用 `var(--shadow-*)` · 禁 `box-shadow: 0 2px 4px ...` 直写
- 间距: 只用 `var(--space-*)` · 禁 `padding: 12px` 硬写(允许 `0` / `auto`)

### 讲解类 HTML (spec/read-for-human/)

- 不依赖项目 tokens.css · 走 `explain-to-pm` skill 内置固定模式(aurora 紫色玻璃风 · 跨项目通用)
- 本 P3 不审讲解类 · 只审产品类

### Web Components (frontend/nf-components/)

- 每 component Shadow DOM 样式从 `tokens.css` import
- 禁组件内部硬编码值

## check

```bash
./scripts/audit-tokens.sh
```

checker 扫:

```bash
# 1. 产品类 CSS / TS 硬编码色(6 位 / 3 位 hex · rgb · hsl)
rg -n '#[0-9a-fA-F]{3,6}\b|rgb\(|hsl\(' \
   frontend/nf-components/ spec/design/prototypes/ spec/design/examples/ \
   --glob '!tokens.css' --glob '!**/DESIGN.md' --glob '!**/*.md'

# 2. 硬编码字号 / 圆角 / 阴影 / 间距
rg -n 'font-size:\s*\d+(px|rem|em)|border-radius:\s*\d+(px|rem|%)|box-shadow:\s*[0-9]' \
   frontend/nf-components/ spec/design/prototypes/ spec/design/examples/ \
   --glob '!tokens.css'

# 3. 产品 HTML 是否 import tokens.css
rg -L 'tokens\.css' spec/design/prototypes/*.html spec/design/examples/*.html
```

## 评分

| 分 | 违约数 |
|---|---|
| **A=10** | 0 硬编码 · 所有产品 UI 用 token |
| **B=8** | 1-5 处(新增未来得及换) |
| **C=6** | 6-20 处 |
| **D=4** | 20-50 处 / 有新组件未 import tokens.css |
| **F=0** | 50+ / 新 UI 普遍硬编码 · token 系统形同虚设 |

## 门禁

**软报告**。不阻合并 · 跑趋势 · 连续退化 → 警告。

## 现状 (v0.1.1 骨架)

- `frontend/nf-components/src/index.ts` 只有占位 export · 无 CSS → **N/A**(基线不打分)
- `spec/design/prototypes/editor-v0.1.html` 存在 canonical hifi(v0.1 产)
- v0.2 spec phase 产组件时 · 每个组件第一版就必走 tokens

## 关联

- `spec/design/DESIGN.md` (视觉唯一源)
- `spec/design/tokens.css` (token 定义)
- 项目 CLAUDE.md "视觉设计" 段
