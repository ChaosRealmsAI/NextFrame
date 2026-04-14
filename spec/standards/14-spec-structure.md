# 14 — Spec Directory Structure

## spec/ 文档体系

```
spec/
├── standards/          ← 宪法：不变的质量规范（改了要全量审计）
├── architecture/       ← 架构：模块设计、分层、依赖图（随代码演进）
├── cockpit-app/        ← 指挥部：BDD + 数据 + 原型
│   ├── bdd/            ← BDD 场景（按模块分目录）
│   ├── data/           ← 路线图、版本、issue、ADR
│   └── prototypes/     ← 交互原型 HTML
├── prototypes/         ← 版本级原型存档
└── poc/                ← 在根目录 poc/，不在 spec 里
```

## 各层规则

### standards/（宪法）
- 编号 01-99，每份一个维度
- **只增不删** — 废弃的标 `[DEPRECATED]`，不删文件
- **改规则 = 重新审计全项目** — 标准变了，代码要跟上
- 格式：标题 → 规则表格 → 检查命令 → 审计脚本

### architecture/（架构）
- 编号 01-99
- **随代码演进更新** — 模块拆了，这里要同步改
- 内容：模块设计、依赖图、技术选型、代码原则
- 旧版本保留，新版本加更大编号（10 → 20）

### ADR（架构决策记录）
位置：`cockpit-app/data/dev/adrs.json`

```json
{
  "id": "ADR-001",
  "title": "Use WKWebView for rendering",
  "status": "accepted",
  "date": "2026-03-15",
  "context": "Need to render HTML to video frames",
  "decision": "Use WKWebView + IOSurface capture",
  "consequences": "macOS only, requires objc2 FFI",
  "alternatives": ["Puppeteer", "Playwright", "wgpu direct"]
}
```

规则：
- **只增不删** — 决策历史不可篡改
- 废弃的 ADR 标 `"status": "superseded"` + 指向新 ADR
- 每条必须有 context + decision + consequences + alternatives

### BDD（行为驱动）
位置：`cockpit-app/bdd/{module}/`

每个模块 5 文件：
```
bdd/{module}/
├── prototype.html     ← 可交互原型
├── ai_ops.json        ← CLI 接口
├── design.json        ← 视觉规范
├── bdd.json           ← Given/When/Then 场景
└── ai_verify.json     ← AI 验证故事
```

规则：
- **BDD 是开发入口** — 没场景不写代码
- status 只有 implement 能改
- verify 只有 verify 能改

### 过程文档
位置：`cockpit-app/data/`

```
data/
├── core/       ← versions.json, project.json, manifesto.json
├── plan/       ← features.json, roadmap.json
├── dev/        ← adrs.json, crates.json, lint.json
├── ops/        ← releases.json, retros.json
└── issues/     ← issues.json（跨模块 bug）
```

### 原型
- `spec/prototypes/` — 按版本存档：v0.1/, v0.2/, v0.3/, v0.4/
- 每个原型是单文件 HTML
- 旧版本的原型放 `_archive/`

## 文档生命周期

| 事件 | 动作 |
|------|------|
| 新版本开始 | 创建 BDD 模块目录 |
| 架构变更 | 加 ADR + 更新 architecture/ |
| 标准变更 | 更新 standards/ + 全量审计 |
| 功能完成 | BDD status:done |
| 验证通过 | BDD verify:pass |
| Bug 发现 | 加 issues.json |
| 版本发布 | 更新 roadmap + releases |

## 审计检查

```bash
# standards 编号连续
ls spec/standards/*.md | grep -oP '\d+' | sort -n

# 每个 BDD 模块有 5 文件
for d in spec/cockpit-app/bdd/*/; do
  count=$(ls "$d" | wc -l)
  [ "$count" -lt 5 ] && echo "INCOMPLETE: $d ($count files)"
done

# ADR 存在
[ -f spec/cockpit-app/data/dev/adrs.json ] && echo "OK" || echo "MISSING: adrs.json"

# architecture 文档存在
ls spec/architecture/*.md | wc -l
```
