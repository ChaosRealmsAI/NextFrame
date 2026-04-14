# NextFrame Standards — Index

12 份规范，覆盖产品全生命周期。AI 和人都读这里。

## 地基（不定死就翻车）

| # | 文件 | 内容 |
|---|------|------|
| 01 | data-contract.md | Timeline JSON Schema、版本兼容、迁移策略 |
| 02 | module-interface.md | 31 个 IPC 方法契约、错误码体系 |
| 03 | component-contract.md | 场景组件接口规范、params schema |

## 架构（不定好就欠债）

| # | 文件 | 内容 |
|---|------|------|
| 04 | ai-interaction.md | AI 操作协议、5 步节奏、自描述/自验证/自纠错 |
| 05 | visual-language.md | 配色 token、字体梯度、间距系统、动画曲线（待定设计） |
| 06 | performance.md | 帧渲染/IPC/启动时间预算 |

## 流程（长期必须）

| # | 文件 | 内容 |
|---|------|------|
| 07 | testing.md | 测试金字塔：单测/集成/截图验证覆盖要求 |
| 08 | release.md | 版本号、changelog、构建、分发 |
| 09 | code-quality.md | 模块分层 + 文件规则 + 编码规则 + 门禁脚本 |

## AI 开发（让 AI 不可能犯错）

| # | 文件 | 内容 |
|---|------|------|
| 10 | ai-dev-environment.md | 3 层防线：编译期拦截 + 运行时可观测 + 验证期断言 |
| 11 | comments.md | 英文注释、why not what、密度、模块头 |
| 12 | agent-readability.md | CLAUDE.md 规范、Gold Standard、域知识内嵌、不重名 |
