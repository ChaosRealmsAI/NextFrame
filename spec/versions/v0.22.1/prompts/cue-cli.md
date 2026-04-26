# 任务 · v0.22.1 · `nf cue` CLI(AI 真切 cue · LLM)

主 agent 持锁 `feature:v0.22.1-cue`。你是路 A · 实现 `nf cue` 子命令 · 用 LLM 把 vox word-level timeline 切成 cue list。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 必读

```bash
cat spec/charter.md
cat spec/architecture.md
cat tmp/v021-explain/audio/slide-01.timeline.json | head -40   # vox 输入格式
cat crates/nf-cli/src/commands/poster_import.rs | head -50      # 现有子命令风格
ls crates/nf-cli/src/commands/                                  # 命名/注册风格
ls crates/nf-agent/src/                                         # 已有 LLM client
cat crates/nf-agent/src/provider.rs | head -100                 # reqwest LLM 调法
cat crates/nf-tts/src/backend/edge/ws.rs | head -40             # 另一个 reqwest 样板
```

## harness preflight(硬)

```bash
harness tools
harness search "cue"
harness search "subtitle"
harness search "llm"
```

不命中 = 必造新工具(注册 nf-cue)。

## 交付 1 件

### `target/debug/nf cue --timeline=<vox.json> [--max-chars=18] [--min-pause-ms=250] [--out=<json>]`

新增子命令 · 文件:
- `crates/nf-cli/src/commands/cue.rs`(新)· main.rs + mod.rs 注册 + Args struct

**输入** · vox `*.timeline.json` 格式:
```json
{
  "duration_ms": 12366,
  "voice": "zh_female_...",
  "words": [{"text": "现", "start_ms": 14000, "end_ms": 14140}, ...],
  "segments": [{"text": "...", "start_ms": 0, "end_ms": 4760, "words": [{"word":"v","start_ms":560,"end_ms":780}, ...]}, ...]
}
```

注意 · word 字段名是 `word` 在 segments[] 里 · 但顶层 `words[]` 用 `text`。统一处理。

**逻辑**:
1. 读 timeline · 提取 word stream(字 + start_ms + end_ms)
2. 调 LLM(走 nf-agent 现有客户端 · 不重写 reqwest)· 给它 word stream + 3 准则 · 让它返 cue list JSON
3. **3 准则**:
   - 语义完整 · 一句话讲完一件事 · 不在动词中切
   - 屏幕能装 · 中文 ≤ `--max-chars`(默认 18)字 · 一行 ≤ viewport 80%
   - 停顿对齐 · cue 切点尽量找 vox 自然停顿(相邻 word 间隔 ≥ `--min-pause-ms` 默认 250ms)
4. 输出 cue list · 每 cue:
   ```json
   {"text": "现在 AI 出 3 张 hifi 图", "start_ms": 14000, "end_ms": 15940, "words": [...原 word 子集...]}
   ```
5. retry · LLM 输出非 JSON 或不满足 schema → 最多 retry 3 次 · 给 stricter prompt
6. JSON schema 校验:start_ms < end_ms · cues 不重叠 · 每 cue 字数 ≤ max_chars · 全部 word 都被某 cue 包含

**输出 stdout JSON**:
```json
{
  "ok": true,
  "cues_count": 5,
  "duration_ms": 12366,
  "max_chars": 18,
  "cues": [...],
  "warnings": []
}
```

如果 `--out=<path>` · 同时写文件。

## LLM client

复用 `crates/nf-agent/src/provider.rs` 的 client。看它怎么:
- 取 API key(env 或 ~/.config)
- POST 到 model endpoint
- 流式或非流式

如果 nf-agent 不太适合(比如它面向 tool-use)· 直接 reqwest::blocking 调 OpenAI-compatible endpoint · 模型用 `claude-sonnet-4-6` 或 `gpt-4o-mini`(看 nf-agent 默认)。

LLM prompt 应该:
- 给 word stream(JSON)+ 3 准则 + max_chars
- 要求严格返回 `{"cues": [...]}` JSON · 无解释文字
- 给 1-2 个示例(few-shot)避免漂移

## 自验

```bash
cargo build -p nf-cli
target/debug/nf cue --timeline=tmp/v021-explain/audio/slide-02.timeline.json --max-chars=18
# 预期 stdout: {"ok":true,"cues_count":N,...}
```

slide-02 文本 = "之前 PM 听 AI 说 我做了 X 功能 · PM 看不到 · 凭想象 · ..."(60+ 字)· 应该切 4-6 cue。

## 禁

- 不机械 split(按句号 / 逗号 / 固定 N 字)· 必走 LLM
- 不动其他 crate
- 不写 mock cue · 必真调 LLM
- 不 commit / 不 push

## 报告

- ✅/❌ `target/debug/nf cue --help` 含子命令
- ✅/❌ 跑 slide-02 timeline · 出合理 4-6 cue
- ✅/❌ 每 cue 字数 ≤ 18 · 时间不重叠
- ✅/❌ retry 逻辑(LLM 给非法 JSON 时)
- 一句话 · 实现 + LLM endpoint + 踩坑
