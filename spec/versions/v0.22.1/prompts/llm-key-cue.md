# 任务 · v0.22.1 · 配 LLM API key + 跑真 nf cue 验证

主 agent 持锁 `feature:v0.22.1-cue`。你是路 G · 把 LLM API key 配上 · 跑真 `nf cue` 切 vox timeline · 看输出 cue list 是不是合理(≤18 字 / 不重叠 / 7 段都切到 2-4 cue)。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 必读

```bash
cat crates/nf-cli/src/commands/cue.rs | head -120                # nf cue 实现 · 看它怎么读 API key
grep -B2 -A10 "API_KEY\|api_key\|env\|getenv" crates/nf-cli/src/commands/cue.rs crates/nf-cli/src/commands/cue_prompt.rs | head -30
cat crates/nf-agent/src/provider.rs | head -120                  # nf-agent 怎么读 API key 默认
grep -B2 -A10 "env::var\|API_KEY" crates/nf-agent/src/provider.rs | head -20
ls ~/.config/nf-agent/ 2>/dev/null
cat ~/.config/nf-agent/*.toml 2>/dev/null | head -20
ls /Users/Zhuanz/workspace/apimart-image-gen/.env 2>/dev/null && echo found apimart .env
echo $ANTHROPIC_API_KEY $OPENAI_API_KEY $SILICONFLOW_API_KEY 2>&1 | head -1
```

## 任务

1. 看 `nf cue` 默认 endpoint(siliconflow.cn / MiniMax-M2.5)· 它读哪个 env var(NF_CUE_API_KEY_ENV 默认指向哪个)
2. 看用户机器是否已有该 key(env vars / ~/.config 下的 toml / .env 文件)
3. 如果有 · 直接 export 或 NF_CUE_API_KEY_ENV=... 跑 nf cue
4. 如果没 · 用其他 nf-agent 已用的 endpoint(可能用户的 ANTHROPIC_API_KEY 或 OPENAI_API_KEY 已存)· override `NF_CUE_BASE_URL` + `NF_CUE_MODEL` + `NF_CUE_API_KEY_ENV` 跑
5. 跑 `nf cue --timeline=tmp/v021-explain/audio/slide-02.timeline.json --max-chars=18 --out=/tmp/cue-slide-02.json`
6. 看输出 cue list:
   - 几条 cue?
   - 每条 ≤18 字?
   - 时间对齐合理?
   - 比 segments fallback 切得更细 / 更语义?

## 自验

```bash
cargo build -p nf-cli
# 把 key 配上(env / file)· 然后:
target/debug/nf cue --timeline=tmp/v021-explain/audio/slide-02.timeline.json --max-chars=18 2>&1 | head -50
# 预期:{"ok":true,"cues_count":3-5,"cues":[...]}
cat /tmp/cue-slide-02.json | python3 -m json.tool | head -30
```

## 输出

把测试结果写到 `spec/versions/v0.22.1/diagnostics/llm-cue-test.md`:
- 用了哪个 endpoint + model
- key 来源(env / file / 别的)
- 7 段全跑一遍(slide-01..07)· 各切了几条 cue
- 1-2 个对照例子(segments fallback 切的 vs LLM 切的 · 看差异)
- 评价:LLM 切的合理吗?哪些不对?

## 禁

- 不改 nf cue / poster-import 实现(除非 LLM 调用流程本身有 bug · 那时简短报)
- 不 commit / 不 push
- 不暴露 API key 到 log / commit

## 报告

- ✅/❌ key 配上 · 跑通 nf cue
- ✅/❌ 7 段 timeline 全切 · cue list 合理
- ✅/❌ diagnostics md 落地
- 一句话 · 用了什么 endpoint · LLM 切的合理度
