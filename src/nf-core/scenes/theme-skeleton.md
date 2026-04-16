# {theme-name} · {ratio}

> 设计语言文档骨架。design recipe 照此格式填写。**代码不 import 此文件** — 所有值在组件文件里写死。

---

## 气质

<!-- 一句话定调：什么场景、配什么内容、像谁（参考作品） -->

---

## 配色（直接 hex 写到组件里）

### 背景层
- `--bg`    `#......`  主背景
- `--bg2`   `#......`  二级面板
- `--bg3`   `#......`  三级表面

### 文字
- `--ink`    `#......`  主文字
- `--ink-75` `rgba(.,.,.,.75)`  次文字
- `--ink-50` `rgba(.,.,.,.50)`  辅助文字

### 主调 + 辅助
- `--ac`    `#......`  主强调
- `--gold`  `#......`  二级强调
- `--green` `#......`  成功
- `--red`   `#......`  错误

### 透明度变体 / 分割线
- `--rule`  `rgba(.,.,.,.10)`
- `--ghost` `rgba(.,.,.,.06)`

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans  | `system-ui, -apple-system, 'PingFang SC', sans-serif` | UI / 标题 |
| serif | `Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif` | 引用 |
| mono  | `'SF Mono', 'JetBrains Mono', Consolas, monospace` | 代码 |

**禁止外部字体下载** — 组件 `assets:[]` 必须为空。

---

## 字号阶梯

| 用途 | px | 行高 |
|------|----|------|
| Display | ...| ... |
| H1      | ...| ... |
| H2      | ...| ... |
| H3      | ...| ... |
| Body    | ...| ... |
| Caption | ...| ... |

---

## 网格

- **安全边距**：左右 ... 上下 ...
- **可用区**：... × ...
- **chrome 区域**：...
- **主内容区**：...

---

## 图层顺序（z 从下到上）

| 层 | role | 例 |
|----|------|----|
| 0 | bg       | bg-... |
| 1 | content  | content-... |
| 2 | text     | text-... |
| 3 | chrome   | chrome-... |
| 4 | overlay  | overlay-... |

---

## 命名约定

- 文件：`{role}-{name}.js`，camelCase
- id：camelCase 名（不带前缀）
- 全局唯一：同 ratio 同 theme 内 id 不重复

---

## 组件设计原则

1. **零 import** — 每组件单文件，颜色/坐标/工具全写死或内联
2. **frame_pure** — 同 t 同 params → 同画面，禁 Date.now / Math.random
3. **viewport-relative** — 用 `vp.width * 0.5` 不写死像素
4. **assets: []** — 不引用外部 url
