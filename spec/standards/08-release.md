# 08 — Release Process

## 版本号

```
v{major}.{minor}.{patch}
```

- major：架构级变更、不兼容的 data contract 变更
- minor：新功能、新组件、新 IPC 方法
- patch：bug 修复、性能优化

## 发布检查清单

### 编译
- [ ] `cargo check --workspace` 零 error
- [ ] `cargo test --workspace` 零 fail
- [ ] `cargo clippy --workspace -- -D warnings` 零 warning
- [ ] `bash scripts/lint-all.sh` 全过

### 功能
- [ ] `nextframe --help` 正常
- [ ] 桌面端能启动
- [ ] 创建项目 → 编辑 → 预览 → 导出 全流程跑通
- [ ] AI 操作：eval + screenshot + navigate 可用

### 数据兼容
- [ ] 旧版本 timeline 能打开
- [ ] 新字段有默认值
- [ ] 迁移函数测试通过

### 构建
```bash
cargo build --release          # Rust 二进制
# 输出：
#   target/release/nf-shell    ← 桌面端
#   target/release/nf-recorder ← 录制引擎
#   target/release/nf-tts      ← TTS
#   target/release/nf-publish  ← 发布器
```

### Changelog

每个版本写 changelog：
```markdown
## v0.X.Y — YYYY-MM-DD

### Added
- 新功能描述

### Changed
- 变更描述

### Fixed
- Bug 修复描述
```

位置：`spec/CHANGELOG.md`

## 分发

| 产物 | 格式 | 目标 |
|------|------|------|
| 桌面端 | .app (macOS) | 本地运行 |
| CLI | npm package | `npm install -g nextframe` |
| TTS | 二进制 | cargo install |
| 发布器 | 二进制 | cargo install |

## 热修复流程

紧急 bug：
1. 从 main 切 hotfix 分支
2. 修复 + 测试
3. 合并到 main
4. bump patch 版本
5. 重新构建发布
