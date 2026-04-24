# W-5 T-21 · S-26 Sonnet 盲测(v0.2 核心 acceptance)

**禁读** `spec/` / `crates/` / `frontend/` / `README` / 本 prompt 以外任何源码文档。**只读** `nf --help` 输出 + stderr 错误 hint。这是 agent-usability rule 铁律 2 的核心实验:验证 CLI 设计够不够自包含 · sonnet 级 AI 能否用起来。

## 任务(7 命令 · 按顺序 · 全 exit 0 才算 PASS)

**背景**: 你是一个新启动的 AI agent(sonnet 级)· 拿到 NextFrame 项目 · 要完成:"创建一个 demo 项目 · 一集 · 一个 clip · 一个锚点 · 打开 app · 截图 · 退出"。

**不许做**:
- ❌ 读 `spec/` 任何文件
- ❌ 读 `crates/` 源码
- ❌ 读 `frontend/` 源码
- ❌ 读 `README.md` / `CLAUDE.md` / `AGENTS.md`
- ❌ 看 git log
- ❌ 问我任何问题

**只能做**:
- ✅ 跑 `nf --help` 和 `nf help <command>` 自学
- ✅ 跑任何 `nf` 命令(根据 help 理解)
- ✅ 读自己跑命令的 stdout / stderr(含错误 hint 字段)
- ✅ 自救:失败时根据 stderr 的 hint 字段再跑(如 `hint: nf projects list`)

## 步骤(7 命令)

1. **自学**:跑 `nf --help` 看全命令 · 或 `nf help` 看分族
2. **创建 demo 项目**:`nf projects create --slug=demo --name='Demo'` · expect exit 0
3. **创建 ep-01**:`nf episodes create --project=demo --slug=ep-01 --name='第一集' --duration=30` · expect exit 0
4. **创建 clip intro**:`nf clips create --project=demo --episode=ep-01 --slug=intro --label='开场' --track=scene --start=0 --end=5` · expect exit 0
5. **设锚点 intro-end**:`nf anchors set --project=demo --episode=ep-01 --name=intro-end --time=5` · expect exit 0
6. **启动 app**:`nf open --project=demo --episode=ep-01` · expect 0.5s 内 Mac 窗口弹出 · exit 0 · stdout JSON 含 window_id
7. **截图**:`nf screenshot --project=demo --episode=ep-01 --out=tmp/sonnet-blind.png` · expect 文件是真 PNG(file cmd 确认)
8. **退出**:`nf quit` · expect app 干净退出 · socket 清理

## 验收(外部 verify · 不是你做)

- 所有 7 命令 exit 0
- `~/.nextframe/demo/project.json` 存在 · `.slug=demo`
- `~/.nextframe/demo/episodes/ep-01.json` 存在 · 含 1 clip + 1 anchor
- `tmp/sonnet-blind.png` 是真 PNG(`file` 输出含 PNG image data)
- `nf ps` 报 no instance(app 已退)
- socket file 不存在

## 报告

产 `SONNET-BLIND-REPORT.md` 项目根:
- 跑了多少命令(含 help 命令)
- 踩坑:哪一步 hint 不清晰 · 哪步错误信息需要猜
- 总体可用性(1-10)
- 最大痛点(自学体验 / 参数记忆 / 错误恢复)· build team 要据此改 help 模板

## 硬约束

- 全程禁读源码 / spec / docs · 只 help + stderr
- 若任一命令需要重跑 · 记录(自救算 pass · 但记教训)
- 时间 15-30min · 超过 30min 停 · 记 partial
- **不** git commit

## 跟 1-3-5 规则的配合

- 1 次命令错 · 看 stderr hint 自救(允许 · 算 pass)
- 2 次同错 · 查 help 是否不清 · 改 help 模板(反馈到 build team)
- 3 次同错 · FAIL · 回 build 改 help + 重跑盲测
