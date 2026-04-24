# v0.2 红队双视角总结

**注**:详细 opus 视角 `opus/threat-model.md`(720 行 · STRIDE + 攻击面 + 7 假设挑战 + top5)· ally 视角 `ally/REPORT.md`(44 attempts · 8 findings + 7 safe)· 原子产物丢失待从 git 历史恢复。

## 汇总

| Severity | opus(思辨) | ally(机械) | 合计 |
|---|---|---|---|
| P0 | 2 | 0 | 2 |
| P1 | 4 | 4 | 8 |
| P2 | 5 | 3 | 8 |
| P3 | 多 | 1 | 多 |

## P0(必修 v0.3)

1. **opus-S1/S2 · Socket takeover race**(`ipc_server.rs:461-463`)· `/tmp/nextframe-{uid}.sock` 无条件 remove · 无 peer-credential check · 同 UID 攻击者可 MITM CLI↔shell · 修向 peer-cred check 启动时检查活跃
2. **opus-E1 · WebView file:// + no CSP + IPC bridge 无限制** · 修向 CSP header + ipc_handler 输入 whitelist + production devtools off

## P1 opus(4)

- R-1 AI 可伪造 actor:"human" in log
- R-2 无 shell-level audit log(absence finding)
- I-2 devtools-query 预装 credential exfil footgun
- D-1 Unbounded IPC connection spawn

## P1 ally(4)

- finding-02 episode 创建跟 project 目录 symlink 出 .nextframe
- finding-03 并发 project create 共享 registry.tmp 损坏
- finding-04 project.json 内 slug 跟文件名不一致被接受
- finding-05 nf open 对不存在/traversal project 开窗

## 关键 meta-insight(opus)

单一信任模型决策驱动所有:**v0.x = 单 UID 信任区 · AI 有完整 authority · 目标最小化附带损害**。接受 → 4 P1 downgrade to doc · 拒绝 → top5 全 P0。当前实现是中间态(声称单 UID · 接口按 zero-trust 暴露)· 这是最先要修的结构性问题。

## v0.3 kickoff 建议 scope_in

- [ ] **第一件事** · merge v0.2-integration @ 32a39252 到 main · 解 workspace Cargo.toml 冲突(融合 v0.2 4 crates + v0.3 12 crates)
- [ ] P0-1 · Socket peer-cred + stale 活跃检测
- [ ] P0-2 · WebView CSP + ipc_handler whitelist + devtools production-off
- [ ] P1 · actor server-assigned + audit log + FS canonical path + registry flock
- [ ] P3 · README 修正(patch v0.2.1 or v0.3 顺带)
