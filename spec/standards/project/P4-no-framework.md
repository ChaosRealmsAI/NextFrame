# P4 · 零框架防倒退 (软报告)

## 守护

`tech-decision` rule 死约束 —— **禁框架 · 允许库**。历史教训:v0.x 走向过度抽象 · v1.19 AppKit 失败 · Tauri / Electron / React / Vue 全禁。

## 规则

### Rust 禁

| 禁 | 允许替代 |
|---|---|
| `tauri` / `tauri-*` | `wry` + `tao` (薄 wrapper) |
| `bevy` / `iced` / `slint` / `egui` / `druid` / `relm` | 手写 event loop + wgpu 直调 |
| `actix-web` / `rocket` (胖 web 框架) | `axum`(库 · OK)/ `hyper`(库 · OK) |
| `diesel` (胖 ORM) | `sqlx` / `rusqlite` |

### TypeScript / npm 禁

| 禁 | 允许替代 |
|---|---|
| `react` / `react-dom` / `@types/react` | 原生 Web Components + Shadow DOM |
| `vue` / `@vue/*` / `svelte` / `next` / `nuxt` | 原生 HTML + `customElements.define` |
| `electron` / `@electron/*` | `wry` + `tao` (Rust 侧) |
| `tauri-apps` (npm 侧) | 无 |
| `@tauri-apps/*` | 无 |

### 允许的薄 wrapper 例外(详见 `tech-decision` rule)

- `wry` (crate) — 跨平台 WebView 薄封装 · binary < 5MB · 用系统 WebView · ✅
- `tao` (crate) — window + event loop 薄封装 · ✅

区别:**薄 wrapper 只做 safe wrapper 基础**(无 runtime / 无打包系统 / 无权限层)· 胖框架带完整 runtime 禁用。

## check

```bash
./scripts/audit-framework.sh
```

checker:

```bash
# 1. Rust 禁列表
rg -n '^tauri|^bevy|^iced|^slint|^egui|^druid|^actix-web|^rocket|^diesel' \
   crates/*/Cargo.toml Cargo.toml

# 2. npm 禁列表
jq -r '.dependencies // {} | keys[]' frontend/nf-components/package.json 2>/dev/null | \
   grep -E '^(react|vue|svelte|next|nuxt|electron|@tauri-apps|@electron)' && exit 1

jq -r '.devDependencies // {} | keys[]' frontend/nf-components/package.json 2>/dev/null | \
   grep -E '^(react|vue|svelte|next|nuxt|electron|@tauri-apps|@electron)' && exit 1

# 3. 任何 crate 依赖了另一个胖框架 crate
cargo tree -p nf-shell 2>/dev/null | grep -E 'bevy|tauri |iced|slint'
```

命中 → fail + 打印违约包名。

## 评分

| 分 | 状态 |
|---|---|
| **A=10** | 0 禁用包 · 只见 wry / tao / axum / serde / clap 等允许库 |
| **B=8** | 跨依赖偶发引入(传递依赖 · 非直接)· 不暴露 API |
| **C=6** | 1 个直接禁用包在 devDep · 不进发布 |
| **D=4** | 直接 dep 有 1 个胖框架 |
| **F=0** | 多个胖框架 / electron / react 主力 |

## 门禁

**软报告** · 但 **D/F 应触发 ADR 讨论**(要么真有理由要么砍)。

## 现状 (v0.1.1 骨架)

- Rust: workspace 空 deps · **A=10** · 基线 ✅
- npm: `typescript: ^5.5.0` devDep · 其他无 · **A=10** · 基线 ✅

## 关联

- `tech-decision` rule (唯一定义源)
- v1.19 归档教训: AppKit 原生手搓 1500 行失败 · 忽视 wry/tao 可直接用
- charter P2 (CLI 驱动 · 桌面是 UI 外壳 · 不绑框架)
