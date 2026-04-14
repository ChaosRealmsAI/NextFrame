# Code Principles — NextFrame

## 1. AI 可操作性

- 每个功能必须有 CLI 入口 — UI 是皮肤，CLI 是骨骼
- 每个操作返回 JSON — AI 不看文本，看结构
- 错误信息带 fix 建议 — AI 能自修复
- 状态可查询 — 任何时刻 AI 能知道"现在是什么情况"
- 截图能力内建 — 不依赖系统权限

## 2. 模块边界

- 一个 crate/模块一个职责，不超过 10k 行
- pub 接口最小化 — 默认 `pub(crate)`，需要跨 crate 才 `pub`
- mod.rs = 模块契约 — 只暴露必要的类型和函数
- 改签名前先 grep 所有调用点，一起改
- 依赖单向无环 — 应用层 → 核心层 → 共享库

## 3. 文件粒度

- 产品代码单文件 ≤ 500 行，目标 ≤ 300 行
- 测试文件 ≤ 800 行
- 一个文件一个职责 — 文件名就是功能名
- 超标就拆，不等不攒

## 4. Rust 侧

- 错误用 `Result<T, String>` 在 IPC 边界，内部用自定义 Error enum
- FFI/unsafe 集中在专门文件 — 不散在业务逻辑里
- 每个 unsafe 块必须有 `// SAFETY:` 注释
- Clippy 6 条 deny 规则 — 编译红线，不准绕过
- 所有 crate 继承 workspace lint：`[lints] workspace = true`

## 5. JS 侧

- 零框架，零构建工具 — script tag 直接加载
- 全局状态显式声明在 state.js — 不散在各模块
- 事件通信用自定义事件 — 模块间不直接调用
- 全 let/const，零 var
- 产品代码零 console.log（bridge IPC 日志除外）

## 6. 跨语言边界

- Rust ↔ JS 只通过 IPC 方法 — 一个 JSON 进，一个 JSON 出
- 新增 IPC 方法必须先在 bridge dispatch 注册
- JS 不直接操作文件系统 — 全走 bridge fs.* 方法
- shell 不绕过 bridge 直接操作业务数据

## 7. 命名

- 全部 `nf-` 前缀 — crate 名、目录名、二进制名
- Rust：snake_case 文件名，CamelCase 类型
- JS：camelCase 文件名（场景组件），kebab-case（模块）
- CSS：kebab-case class 名

## 8. 能力内建

- 不依赖系统权限（Screen Recording、Accessibility 等）
- 不依赖外部 CLI 工具存在
- 从 GPU surface 读像素，自己编码 PNG
- 判断标准：一台全新 Mac（零额外权限）能用吗？

## 9. 发布门禁

```bash
cargo check --workspace           # 编译
cargo test --workspace            # 测试
cargo clippy --workspace -- -D warnings  # lint
bash scripts/lint-all.sh          # 全量检查
node src/nf-cli/bin/nextframe.js --help  # CLI 可用
```

全部 exit 0 才能合并。
