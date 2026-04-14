# 15 — Quality Scorecard

AI 评审员读这份文件，跑检查，输出质量报告。每个维度 A-F 打分，总分 0-10。

## 评分维度（15 个，4 大类）

### I. Code Quality（6 个维度）

| # | 维度 | A 标准 | F 标准 | 检查命令 | 对应规范 |
|---|------|--------|--------|---------|---------|
| 1 | 编译健康 | 零 error + 零 warning | 编译不过 | `cargo check --workspace && cargo clippy --workspace -- -D warnings` | 09-code-quality |
| 2 | 文件粒度 | 零文件 >500 行 | 5+ 文件超标 | `find src/ -name '*.rs' -o -name '*.js' \| xargs wc -l \| awk '$1>500'` | 09-code-quality |
| 3 | 命名一致性 | 全 nf- 前缀 + 一致风格 | 多种风格混用 | `ls src/` 检查前缀 | 09-code-quality |
| 4 | 代码卫生 | var=0, console.log=0, TODO=0 | 任一 >20 | `grep` 三项计数 | 09-code-quality |
| 5 | 安全标注 | unsafe 无 SAFETY ≤ 3 | >50 | `grep unsafe \| grep -v SAFETY` | 10-ai-dev-environment |
| 6 | 测试覆盖 | 全过 + 覆盖所有 IPC | 有 fail 或覆盖 <50% | `cargo test --workspace` | 07-testing |

### II. Architecture（3 个维度）

| # | 维度 | A 标准 | F 标准 | 检查命令 | 对应规范 |
|---|------|--------|--------|---------|---------|
| 7 | 模块内聚 | 每模块 ≤10k 行，职责清晰 | 万行大模块 | `find src/nf-*/ -name '*.rs' \| xargs wc -l` | 09-code-quality |
| 8 | 依赖方向 | 单向无环 | 循环依赖 | `grep` 反向 import | 09-code-quality |
| 9 | 接口契约 | mod.rs 是唯一窗口，pub 最小化 | pub 到处都是 | 人工审查 | 09-code-quality |

### III. Agent Experience（4 个维度）

| # | 维度 | A 标准 | F 标准 | 检查命令 | 对应规范 |
|---|------|--------|--------|---------|---------|
| 10 | 可理解性 | 每 crate 有 CLAUDE.md ≤30 行 | 无 CLAUDE.md | `ls src/*/CLAUDE.md` | 12-agent-readability, 13-project-docs |
| 11 | 可操作性 | CLI --help 覆盖全功能 | 大量功能无 CLI | `nextframe --help` | 04-ai-interaction |
| 12 | 可验证性 | lint-all.sh 全过 ≤30s | 无自动检查 | `bash scripts/lint-all.sh` | 10-ai-dev-environment |
| 13 | 可调试性 | 错误带 Fix 建议 | 错误信息无法操作 | `grep Err src/ \| grep -v Fix` | 02-module-interface, 04-ai-interaction |

### IV. Documentation（2 个维度）

| # | 维度 | A 标准 | F 标准 | 检查命令 | 对应规范 |
|---|------|--------|--------|---------|---------|
| 14 | 规范覆盖 | 14+ 份 standards 全有 | <5 份 | `ls spec/standards/*.md \| wc -l` | 14-spec-structure |
| 15 | 注释质量 | 英文 + 模块头 + why not what | 无注释或中文混用 | 抽样 `head -1` 检查 //! | 11-comments |

## 评分规则

| 等级 | 分值 | 含义 |
|------|------|------|
| A | 10 | 完全达标 |
| B | 8 | 基本达标，1-2 个小问题 |
| C | 6 | 及格，有明显改进空间 |
| D | 4 | 不达标，需要修复 |
| F | 0 | 严重不达标或完全缺失 |

**总分 = 15 个维度平均分，四舍五入到一位小数。**

## 评审流程

AI 评审员执行：

```
1. 读本文件了解全部维度
2. 对每个维度跑检查命令
3. 对照 A/F 标准打分
4. 如果打分 <B，读对应规范文件了解完整要求
5. 输出质量报告（格式见下）
```

## 报告模板

```markdown
# NextFrame Quality Report

Date: YYYY-MM-DD
Commit: {hash}
Reviewer: {AI model}

## Summary
Overall Score: X.X / 10
Grade: {A/B/C/D/F}

## Scorecard

| # | Dimension | Score | Grade | Issues |
|---|-----------|-------|-------|--------|
| 1 | Build Health | 10 | A | Zero errors, zero warnings |
| 2 | File Granularity | 10 | A | No file >500 lines |
| ... | ... | ... | ... | ... |

## Findings

### P0 (Blocks Release)
- {finding with file:line}

### P1 (Must Fix)
- {finding}

### P2 (Nice to Have)
- {finding}

## Trend
- Previous score: X.X (YYYY-MM-DD)
- Delta: +/-X.X
- Improved: {dimensions}
- Regressed: {dimensions}
```

## 自动化评审命令

```bash
# 一键评审（AI 读这个脚本自动跑）
# 未来可以做成 scripts/audit.sh

echo "=== 1. Build Health ==="
cargo check --workspace 2>&1 | tail -1
cargo clippy --workspace -- -D warnings 2>&1 | tail -1

echo "=== 2. File Granularity ==="
find src/ -name '*.rs' -o -name '*.js' | grep -v target | grep -v node_modules | grep -v .ally | grep -v test | xargs wc -l 2>/dev/null | awk '$1>500{print}' | grep -v total

echo "=== 3. Naming ==="
ls src/ | grep -v '^nf-' | grep -v crates | grep -v scripts | grep -v python | grep -v tests

echo "=== 4. Code Hygiene ==="
echo "var: $(grep -rn '\bvar ' src/ --include='*.js' | grep -v node_modules | wc -l)"
echo "console.log: $(grep -rn 'console.log' src/ --include='*.js' | grep -v node_modules | grep -v '\[bridge\]' | wc -l)"
echo "TODO: $(grep -rn 'TODO\|FIXME' src/ --include='*.rs' --include='*.js' | grep -v node_modules | wc -l)"

echo "=== 5. Safety ==="
echo "unsafe no SAFETY: $(grep -rn 'unsafe' src/ --include='*.rs' | grep -v target | grep -v test | grep -v '// SAFETY' | grep -v allow | grep -v unsafe_code | wc -l)"

echo "=== 6. Tests ==="
cargo test --workspace 2>&1 | grep 'test result'

echo "=== 10. CLAUDE.md ==="
ls src/*/CLAUDE.md .claude/CLAUDE.md AGENTS.md 2>/dev/null

echo "=== 14. Standards ==="
ls spec/standards/*.md | wc -l
```
