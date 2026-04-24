# G2 · 架构边界 (硬门禁)

## 守护

**crate 依赖方向单向** —— 禁循环依赖 + 禁反向依赖。避免 v0.x "10 crate 层没载河" 历史回潮。

## 依赖方向 (硬)

```
nf-cli ──┐
         ├─→ nf-shell ─┐
         │             ├─→ nf-engine
         └─→ nf-runtime─┘

frontend/nf-components  (独立 · 不依赖 Rust crate)
```

**允许**:
- `nf-cli` → `nf-shell` / `nf-runtime` / `nf-engine` (上层用下层)
- `nf-shell` → `nf-engine` (shell 借 engine 算)
- `nf-runtime` → `nf-engine` (runtime 借 engine 算)

**禁**:
- `nf-engine` → 任何其他 crate (engine 是地基 · 纯函数 · 无外部依赖)
- `nf-runtime` → `nf-cli` / `nf-shell` (runtime 不反向依赖 driver)
- `nf-shell` → `nf-runtime` / `nf-cli` (shell 是展示 · 不依赖 runtime 驱动)
- 任何循环

## frontend 约束

- `frontend/nf-components` 不调用 Rust crate (通过 IPC / message 通讯 · 不直接依赖)
- 组件间依赖走 Shadow DOM + custom events · 禁全局单例 / 禁 window.*

## check

```bash
./scripts/audit-arch.sh      # 扫 Cargo.toml 里 [dependencies] · 违约即 fail
```

checker 逻辑:
- 读每个 crate 的 Cargo.toml
- 检查 `[dependencies]` 是否出现在允许列表
- 出现禁止依赖 → 打印违约路径 + exit 1

## 评分

| 分 | 状态 |
|---|---|
| **A=10** | 依赖方向 100% 单向 · 0 违约 |
| **B=8** | 1 处违约但有 ADR 说明(例外)· 其他干净 |
| **C=6** | 2-3 处违约无 ADR |
| **D=4** | 4+ 违约 / 发现循环依赖 |
| **F=0** | 多循环 / 大量反向依赖 / 层次崩坏 |

## 门禁

**F/D = 阻合并**。

## 关联

- `charter.json` P5 (桌面端定位 · 不越权)
- `tech-decision` rule (分层 + trait 隔离)
- v0.x 教训: 10 crate 过度分层被砍 · 4 crate 是当前合理切法
