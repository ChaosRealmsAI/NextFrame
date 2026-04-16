# Produce Pipeline — v0.8 Anchors × Tracks

从 TTS / 原声素材到最终 MP4 的生产流程。v0.8 的核心变化只有两个：

- 时间不再手写毫秒，先生成 `anchors`
- 画面不再写 `matches`，只写 4 类 `tracks`

## ⚠️ 铁律（违反 = 本次 run 作废，不接受"差不多"）

1. **必须走每一步 CLI**：每个 step 的"命令"区块的 shell 命令必须**原样执行**，禁止用 Node/Python 脚本替代。
2. **禁止自写毫秒到 anchors**：anchors.{id} 只能是 `{at:N}` 或 `{src:"whisper",path,word/sentence}`，**禁写 `{begin:N, end:N}` 形态**（那是 clip 的字段不是 anchor）。
3. **产物真实性自检**：TTS mp3 必须自检是否真人声（不是 sine wave 占位）；anchors 必须从 TTS words 生成；timeline 所有 begin/end/at 必须是 anchor 名字不是数字。
4. **每步贴 stdout 证据**：每个 step 完成后贴出命令 + 产物路径 + CLI stdout，不准说"已完成"。
5. **卡住就停 不准绕**：flow CLI 不够用 / 产物格式对不上 → **停下报 BLOCKED，不准自己写 adapter 替代**。绕流程 = 这次 run 的产物全部作废。

## 🧭 新 AI 起手（必读）

你是刚进来的 AI。按这个顺序：

1. **读这份 guide.md 全部**（特别是上面的铁律）
2. **记录入仓**：决定 project 目录（如 `projects/{your-name}/`），准备 `run.log`（在项目目录内，不写 tmp/）
3. **从 `ratio` 起步**，每步跑 `cargo run -p nf-guide -- produce {step}` 读 prompt → 原样执行命令 → 产物 + stdout append 到 `run.log`
4. **遇阻**：step CLI 不够用 / 产物格式对不上 → `run.log` 追加 `BLOCKED_AT: {step}\nREASON: {一句话}\nCLI_OUTPUT: {最后 20 行}`，停止执行，交主 agent 决策
5. **每步日志格式**（照抄）：

   ```
   ## {YYYY-MM-DD HH:MM} · {step}
   CMD: {实际执行的 shell}
   OUT: {stdout 最后 20 行}
   ARTIFACT: {产物路径}
   STATUS: done | blocked
   ```

6. **绝不**在 `src/` 改代码；**绝不**在 `tmp/` 写"方案 / 笔记"—— 那些是一次性的，不沉淀

## 顺序

`00 ratio` → `00a tts` → `01 check` → `02 scene` → `03 anchors` → `04 timeline` → `05 validate` → `06 build` → `07 record` → `08 concat` → `09 verify`

## 流程图

```
ratio
  ↓
tts（可选）
  ↓
check
  ├─ scene（缺组件时循环）
  ↓
anchors
  ↓
timeline
  ↓
validate
  ↓
build
  ↓
record
  ↓
concat（可选）
  ↓
verify（硬指标 + LLM 判帧）
```

## 步骤一览

| step | 命令 | 产物 |
| --- | --- | --- |
| `ratio` | `nf-guide produce ratio` | ratio 决策 |
| `tts` | `nf-guide produce tts` | `seg0.mp3`, `seg0.words.json` |
| `check` | `nf-guide produce check` | 可用素材 + scene 清单 |
| `scene` | `nf-guide produce scene` | 缺失 scene |
| `anchors` | `nf-guide produce anchors` | `anchors.json` |
| `timeline` | `nf-guide produce timeline` | `timeline.json` |
| `validate` | `nf-guide produce validate` | contract 通过 |
| `build` | `nf-guide produce build` | `out.html` |
| `record` | `nf-guide produce record` | `demo.mp4` |
| `concat` | `nf-guide produce concat` | `episode.mp4` |
| `verify` | `nf-guide produce verify` | `verify-report.md` |

## 记忆法

- `anchors` 解决“什么时候”
- `tracks` 解决“放什么”
- `build` 把两者降成浏览器运行时能吃的绝对毫秒 HTML
- `nextframe-recorder` 只负责按帧调用 HTML 契约录成 MP4

## 查看坑

```bash
nf-guide produce pitfalls
```

## 附录：审美参考

2 分钟过一遍审美 15 条硬规则 → 读 `flows/shared/aesthetics-quick-ref.md`。完整 9 篇论证 → `spec/cockpit-app/references/aesthetics/`。
