# 07 · Roadmap

**从 walking skeleton 到 v1.0 的完整路径。**

这是给后续 session 的 anti-drift 文档——告诉你「我们在哪，下一步干什么，别的都不是现在的事」。

## 里程碑

```
POC (done) → Architecture docs (done) → Walking skeleton (now) → v0.1 → v0.2 → v0.3 → v1.0
     ↑                  ↑                        ↑               ↑       ↑       ↑       ↑
  19+7 POCs       7 arch docs              nextframe-cli    feature  editor  asset  release
                                           end-to-end mp4   complete   UI    mgmt
```

**当前位置：walking skeleton（v0.1.3）。**

## 阶段定义

| 阶段 | 版本 | 内容 | 完成标志 |
|---|---|---|---|
| POC | - | 验证所有技术假设 | 19+7 POCs committed (done) |
| Spec | - | 7 份架构文档 | spec/architecture/00-06 (done) |
| Walking | v0.1.3 | 最小可跑的 CLI | `nextframe render demo.json out.mp4` 出片 |
| Lint | v0.1.4 | clippy/eslint 规则全部写死 | lint.json committed |
| Implement | v0.1.5 | 填满所有 feature | BDD 全 pass |
| Verify | v0.1.6 | AI 跑一遍 | ai_verify.json 全 green |
| Release | v0.1.0 | 可发布 CLI | npm package 可装 |

## v0.1 CLI（walking → release）

**定位：** AI 和人的终端级视频编辑器。完全命令行，无 GUI。

### v0.1.3 · Walking skeleton（进行中）

最小端到端：
- [x] 7 份架构文档
- [ ] `nextframe-cli/` package 存在
- [ ] 23 个 scene 完成 describe + META 改造
- [ ] 7 个 subcommand（validate / frame / render / describe / gantt / new / add-clip）
- [ ] `examples/demo.timeline.json` → `/tmp/demo.mp4` 12s 1080p h264
- [ ] `node --test` 全绿

### v0.1.4 · Lint

- [ ] `.eslintrc` 禁用 eval/throw/Math.random-in-scenes/wildcard-import
- [ ] `architecture-test.js`——自动读 spec/architecture/01-layering.md，断言 src/ 目录符合层级依赖
- [ ] `scene-contract-test.js`——断言所有 scene 都有 render + describe + META
- [ ] `spec/cockpit-app/data/dev/lint.json` 记录所有规则

### v0.1.5 · Implement（按模块做 BDD）

每个模块走一遍 `bdd/{module}/` 5 文件 → 代码 → test 绿 → verify pass。

模块清单：
1. `cli-render` — render / frame / probe 子命令
2. `cli-timeline-ops` — new / add-clip / move-clip / resize-clip / delete-clip
3. `cli-describe` — describe / gantt / ascii-preview
4. `cli-assets` — import-audio / import-video / list-assets
5. `cli-export` — render + mux audio → final mp4
6. `ai-tools` — 7 tool 函数成为独立可测模块
7. `safety-gates` — 6 个 gate 的单元测试 + fuzz

每模块目标：≤4 小时完成 5 文件 + 代码 + test。

### v0.1.6 · Verify

AI 跑 `ai_verify.json` 里的 story，操作 CLI，截图，检查 mp4 probe 结果，看日志无异常。全 pass 才能标 v0.1 done。

### v0.1 发版

- `npm publish nextframe-cli` 或 `brew install nextframe-cli`
- README + docs
- 5 分钟 demo 视频（用 nextframe-cli 自己生成）

## v0.2 Editor UI（walking → release）

**定位：** 给人的 GUI 外壳。**CLI 是 ground truth**，UI 只是它的视觉化。

### 技术决策
- **壳：wry crate**（不用 Tauri）
- **前端：纯 JS**（不用 React/Vue/Svelte）
- **通信：UI → spawn nextframe-cli subprocess → stdin JSON timeline → stdout rendered frame**
- **不走 IPC/bridge**——CLI 已经是完整 API

### 阶段
- v0.2.0 Prototype：HTML mockup，5 区布局，可点击
- v0.2.1 Spec：BDD per UI module（preview / timeline / inspector / library）
- v0.2.2 Architecture：runtime/web/ 结构
- v0.2.3 Walking：wry shell 能打开窗口 + 调 CLI 渲染一帧
- v0.2.4 Lint：架构测试守护 CLI↔UI 单向依赖
- v0.2.5 Implement：每模块 BDD 驱动
- v0.2.6 Verify：AI 截图验证 UI

## v0.3 Asset management

- 本地资产库（`~/.nextframe/assets/`）索引
- 音频波形缓存
- 视频缩略图缓存
- import/export 整个 nfproj 打包（zip：timeline.json + assets/）

## v1.0 Release

- macOS DMG + Linux AppImage
- 官网 + 文档
- 3 个示范工程
- YouTube 频道发片

## 不在 v0.1 范围内（明确不做）

- GUI（v0.2 才做）
- 插件系统
- 云端协作
- 浏览器版
- Windows 支持（先 macOS，v0.3 再考虑）
- 直播推流
- AI 生视频（只编辑已有素材，不训模型）
- 音乐制作
- 转场动画库（用 scene 模拟即可）
- 关键帧系统（v0.1 用 symbolic time 替代）

## Anti-drift 规则

**每个 session 开头必须：**

1. `git log --oneline -10` 看最近做了什么
2. `cat spec/architecture/07-roadmap.md` 确认当前版本
3. 按当前阶段走对应的 skill，不许跳

**禁止：**
- 给 v0.1 加 GUI 功能（全部推到 v0.2）
- 给 v0.1 加插件/云端/协作（全部推到 v1.x）
- 在 walking 阶段就做 lint/architecture-test（walking 只求跑通）
- 在 implement 阶段重新设计架构（该固化了）
- 在 verify 阶段发现问题就再改代码（应该先改 BDD，再回 implement）

## 时间估算

| 阶段 | 并行 | 串行 | 说明 |
|---|---|---|---|
| Walking (v0.1.3) | 1 agent | 2-3h | 7 phases |
| Lint (v0.1.4) | 1 agent | 1h | 3 规则 + 测试 |
| Implement (v0.1.5) | 2-3 agents 并行 | 12-16h | 7 模块 |
| Verify (v0.1.6) | 1 agent | 2-3h | AI 自动跑 |
| v0.1 Release | manual | 2h | publish + docs |

**v0.1 总计：20-26 小时，可跨 3-5 天。**

v0.2 预计同量级。v0.3 + v1.0 视用户反馈和使用数据定。

## 主 agent 的边界

主 agent（我/Claude Opus 4.6）做：
- 写架构文档 / 路线图
- 调度 background agents
- 验证 milestone
- 与用户对齐

主 agent **不做**：
- 写 feature 代码（交给 subagent/worktree）
- 跑长时间渲染（交给 CLI subprocess）
- 决定产品方向（对齐用户后执行）

## 一句话

**Walking 出片 → Lint 固化 → Implement 按模块做完 → Verify AI 跑 → v0.1 release。不跳步，不早做 UI。**
