# 09 — Code Quality & Module Design

## 模块分层（4 层，单向依赖）

```
应用层 → 核心层 → 共享库
              ↓
           运行时
```

| 层 | 模块 | 规则 |
|---|------|------|
| 应用层 | nf-shell, nf-cli, nf-publish | 可以调核心层，不准互调 |
| 核心层 | nf-bridge, nf-recorder, nf-tts | 可以调共享库，不准调应用层 |
| 运行时 | nf-runtime | 被 shell 和 recorder 加载，不主动调其他模块 |
| 共享库 | crates/nf-* | 只依赖标准库和第三方库，不依赖项目内其他层 |

**违反依赖方向 = 编译不过（Cargo.toml 不允许反向依赖）。**

## Crate 内部结构

每个 Rust crate 按职责分子目录：

```
src/nf-xxx/src/
├── lib.rs 或 main.rs     ← 入口，pub 接口最小化
├── feature_a/
│   ├── mod.rs            ← 子模块契约（只 pub 必要的）
│   ├── impl_1.rs
│   └── impl_2.rs
├── feature_b/
│   └── ...
└── util/                 ← 内部工具（pub(crate)）
```

### 可见性规则

| 层级 | 默认可见性 | 何时升级 |
|------|-----------|---------|
| 函数/类型 | `pub(crate)` | 需要跨 crate 才 `pub` |
| 子模块 | `pub(super)` | 需要跨模块才 `pub(crate)` |
| mod.rs re-export | 只导出外部需要的 | 内部类型不导出 |

**原则：默认私有，按需开放。**

### mod.rs = 契约

mod.rs 是子模块的唯一对外窗口：

```rust
// domain/mod.rs
pub(crate) mod project;
pub(crate) mod episode;

// 只 re-export handler 函数，不暴露内部类型
pub(crate) use project::handle_project_list;
pub(crate) use episode::handle_episode_list;
```

改 mod.rs 的 re-export = 改契约。改内部文件不影响外部。

## JS 模块结构

```
src/nf-runtime/web/src/
├── core/          ← 引擎（不依赖 UI）
├── components/    ← 场景组件（只依赖 core/shared）
├── editor/        ← 页面（依赖 core + ui）
├── ui/            ← 通用组件（不依赖 editor/pipeline）
├── preview/       ← 预览（依赖 core）
└── pipeline/      ← 生产线（依赖 core + ui）
```

### JS 依赖方向

```
editor/pipeline → ui → core
components → core/shared（只）
preview → core
```

**components 不准 import ui/editor/pipeline。** components 是纯渲染单元。

## 文件规则

| 维度 | 规则 | 检查方式 |
|------|------|---------|
| 产品代码 | ≤ 500 行 | wc -l |
| 测试代码 | ≤ 800 行 | wc -l |
| 单模块总量 | ≤ 10,000 行 | find + wc |
| 单 crate | ≤ 15,000 行 | 超了拆 crate |

超标 = 必须拆。不等不攒。

## Rust 编码规则

| 规则 | 强制方式 |
|------|---------|
| 零 unwrap | clippy deny unwrap_used |
| 零 expect（产品代码） | clippy deny expect_used |
| 零 panic | clippy deny panic |
| 零 unreachable | clippy deny unreachable |
| 零 todo | clippy deny todo |
| 零 wildcard import | clippy deny wildcard_imports |
| unsafe 有 SAFETY 注释 | grep 检查 |
| 所有 crate 继承 workspace lint | `[lints] workspace = true` |

## JS 编码规则

| 规则 | 检查方式 |
|------|---------|
| 零 var | grep |
| 零 console.log（bridge 除外） | grep |
| 零 TODO/FIXME | grep |
| 全局状态集中在 state.js | 人工审查 |
| 模块间不直接调用 | 通过事件或全局函数 |

## 命名规则

| 对象 | 规则 | 示例 |
|------|------|------|
| Crate 名 | nf-kebab-case | nf-bridge, nf-tts |
| Rust 文件 | snake_case.rs | export_runner.rs |
| Rust 类型 | CamelCase | ExportTask |
| Rust 函数 | snake_case | handle_export_start |
| JS 文件（组件） | camelCase.js | headline.js |
| JS 文件（模块） | kebab-case.js | dom-preview.js |
| CSS class | kebab-case | pl-atom-card |
| IPC 方法 | domain.camelCase | export.muxAudio |
| CLI 命令 | kebab-case | project-new |

## 新代码检查清单

每次写新代码前问自己：

1. 这个文件会超 500 行吗？→ 先拆再写
2. 这个函数需要 pub 吗？→ 默认 pub(crate)
3. 这个模块依赖了谁？→ 检查依赖方向
4. AI 能操作这个功能吗？→ 有 CLI 入口吗
5. 改这个文件会影响其他模块吗？→ 走 mod.rs 契约

## 门禁脚本

```bash
# scripts/lint-all.sh — 每次提交前跑
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings

# 文件大小
find src/ -name '*.rs' -o -name '*.js' | xargs wc -l | awk '$1>500 && !/test/ && !/node_modules/'

# JS 质量
grep -rn '\bvar ' src/ --include='*.js' | grep -v node_modules
grep -rn 'console.log' src/ --include='*.js' | grep -v '\[bridge\]' | grep -v node_modules

# 依赖方向
grep -rn "from.*modules/" src/nf-runtime/web/src/components/ --include='*.js'

# Workspace 完整性
# 所有有 Cargo.toml 的目录都在 workspace members 里
```

**全部 exit 0 才能合并到 main。**

## 技术选型原则（来自 Agent Experience 研究）

- **用无聊的技术** — AI 对成熟技术（Rust std、vanilla JS、ffmpeg）的理解远好于新潮框架
- **不混技术栈** — 一个职责用一种技术。不在 JS 里写 Rust 的活
- **设计模式优先** — 用 AI 熟悉的模式（Builder、Adapter、Registry）。AI 不用读代码就懂意图
- **不重名** — 项目内不允许两个文件叫同一个名字（除 mod.rs/index.js）。AI 搜到多个同名文件浪费 context
- **每次 AI 犯错后改环境** — AI 犯错 = 环境的 bug。加注释、改名、加 lint 规则防止再犯
