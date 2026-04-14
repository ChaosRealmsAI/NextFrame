# 07 — Testing Strategy

## 测试金字塔

```
        /  截图验证  \       ← 少量，验证视觉
       / 集成测试      \     ← 每个 IPC 方法
      /  单元测试        \   ← 核心逻辑
     /   编译检查          \  ← 类型系统
```

## 各层要求

### 编译检查（零成本）
- `cargo check --workspace` 零 error
- `cargo clippy --workspace -- -D warnings` 零 warning
- TypeScript 类型检查（nf-cli）

### 单元测试（核心逻辑必须有）
| 模块 | 必须测的 |
|------|---------|
| nf-bridge/domain | 项目/集/段 CRUD |
| nf-bridge/storage | 文件读写、自动保存、最近项目 |
| nf-bridge/codec | FFmpeg 命令构建 |
| nf-recorder/parser | Timeline 解析、SRT 解析 |
| nf-recorder/encoder | 像素格式转换 |
| nf-tts/backend | SSML 构建、音频处理 |
| nf-tts/queue | 调度器逻辑 |

### 集成测试（每个 IPC 方法）
- 每个 IPC 方法至少 1 个 happy path + 1 个 error path
- 位置：`nf-bridge/tests/integration/`
- 当前：243 个测试全过

### 截图验证（视觉功能）
- 每个场景组件在 3 种比例下截图
- `nextframe preview --times=0,3,5` 输出 PNG
- AI 用 describe() 做初步验证，不对再截图

## 新功能测试要求

| 功能类型 | 测试要求 |
|---------|---------|
| 新 IPC 方法 | 集成测试 happy + error |
| 新场景组件 | 3 比例截图 + lint-scenes |
| 新 CLI 命令 | --help 可用 + 至少 1 个 e2e |
| 新数据格式 | schema 验证 + 向后兼容测试 |
| Bug 修复 | 回归测试（防止复发） |

## 测试文件规范

- 测试文件名：`*_tests.rs`（Rust）、`*.test.js`（JS）
- 单文件 ≤ 800 行
- 每个 test 函数名描述行为：`fn timeline_save_rejects_symlink_escape()`
- 不 mock 文件系统 — 用真实临时目录

## CI 流程

```bash
cargo check --workspace        # 1. 编译
cargo test --workspace         # 2. 全部测试
cargo clippy --workspace -- -D warnings  # 3. Lint
bash scripts/lint-all.sh       # 4. 全量检查
```

全部 exit 0 才能合并。
