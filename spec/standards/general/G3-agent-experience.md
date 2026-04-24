# G3 · AI 可操作 (软报告)

## 守护

**AI 是第一用户** (charter P1)。接口 = 说明书 · AI 看 5 分钟会用 · 否则接口没设计好。

## 规则

### CLI

- 每个 subcommand 必有 `--help` · 一句话描述 + 参数 + 示例
- 错误返回 **回收指引**(不是 "Error: ... (exit 1)" · 是 "Error: ... · try `nf xxx --help` · or see spec/xxx")
- JSON 输出 `--format=json` 可选 · AI 好解析
- 人类能做的操作 CLI 都有(self-verification rule 硬约束)

### 配置 / Schema

- `project.json` 有 JSON schema 公开 · 必带 `$schema` 注释
- schema 字段有 `description` · AI 读懂每个字段

### 自验 CLI

每个 BDD scenario 有 `ai_tools[]` (bdd-scaffold skill) · 产品内建 CLI 让 AI 自己跑验证:
- screenshot / click / state / logs · 走跟人类操作同一代码路径
- 不调系统工具(禁 `screencapture` · `scrot` 等需权限工具)

## check

```bash
./scripts/audit-ai.sh
```

checker 扫:
- `nf --help` / `nf <sub> --help` 是否存在 · 是否 1 行描述
- bin/cli 源码里 `anyhow::bail!` / `Result::err` 是否有恢复指引字符串
- `spec/contracts/schemas/*.json` 有无 `description` 字段覆盖
- `spec/bdd/*/scenarios/*.json` 有无 `ai_tools[]` 且 command 可执行

## 评分

| 分 | 指标(启发式) |
|---|---|
| **A=10** | 所有 CLI 有 --help · 错误有恢复指引 · schema 全 description · 每 BDD 有 ai_tools |
| **B=8** | 80%+ 覆盖 · 小处缺失 |
| **C=6** | 50-80% · AI 能用大部分但偶尔猜 |
| **D=4** | < 50% · AI 经常需要读源 |
| **F=0** | 没 --help / 没 schema / 没 ai_tools |

## 门禁

**软报告**。不阻合并 · 跑趋势 · 退化 → 警告。

## 现状 (v0.1.1 骨架)

- `nf --help`: **缺**(只有占位 main) → v0.2 加 clap subcommands 必补
- JSON schema: 无(engine 未实现) → v0.3 加
- BDD ai_tools: 无(BDD 没建) → v0.2 spec phase 产

**基线预期分**: F/D (骨架阶段不惩罚 · 但 v0.2 收尾必达 B+)。

## 关联

- charter P1 (AI 第一用户) · P10 (全自动终态)
- `agent-usability` rule (自包含 · 弱模型干活 · 主 agent 验产物)
- `self-verification` rule (ai_tools 字段 + 产品内建)
