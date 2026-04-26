# 任务 · v0.22.1 · 修 audio v3 src 路径 · 让 mp4 audio_muxed 回 true

主 agent 持锁 `feature:v0.22.1-cue`。你是路 F · 修 poster-import 在 v3 clip-first 模式下 audio 编译 src 找不到的回归 · 让 export 的 mp4 audio_muxed 重新 true。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 现状

**已知 regression**:
- v0.22.0 mp4 audio_muxed=true(v2 schema)
- v0.22.1 mp4 audio_muxed=false(v3 包装后)+ warning "ignored audio item 'main.audio-1.audio-1' without src"
- 之前我尝试把 src 移到 item 顶层(不在 item.params)· 但 audio 还是没找到 src

## 必读

```bash
cat crates/nf-cli/src/commands/poster_import.rs | head -250         # 我的 v3 wrapper
grep -B2 -A25 '"audio"' crates/nf-project/src/lib.rs                 # audio 编译 path · v3 clip-first 怎么找 src
grep -B5 -A30 "validate_clip_composition_components\|compile_clip" crates/nf-project/src/lib.rs | head -80
cat examples/v2-showcase/compositions/showreel-clip-first.json | python3 -m json.tool | grep -B2 -A10 'audio' | head -30  # codex 范本里 audio 怎么写
```

## 任务

1. 找出 v3 clip-first audio 编译 期望 src 在 **哪个字段**(item.src? track.src? item.params.src? item.audio?)· 通过看 nf-project lib.rs 的 audio compile path 定位
2. 改 poster-import.rs 让 audio item 写到正确字段
3. 跑 nf poster-import + nf export 验 audio_muxed=true
4. 跑 ffprobe 验 mp4 audio stream 存在 + duration 对(107.5+ s)

## 自验

```bash
cargo build -p nf-cli
target/debug/nf poster-import tmp/v021-explain --out=v021-explain --gap-ms=1500
target/debug/nf composition validate --project=v021-explain --composition=main
# 0 warning 关于 audio
target/debug/nf export --project=v021-explain --composition=main --profile=draft --out=/tmp/audio-fix-test.mp4
# stdout 应有 audio_muxed=true · warnings: []
ffprobe -v quiet -show_streams -of json /tmp/audio-fix-test.mp4 | python3 -c "import json,sys; d=json.load(sys.stdin); audio=[s for s in d['streams'] if s['codec_type']=='audio']; print('audio streams:', len(audio), 'duration:', audio[0].get('duration') if audio else None)"
# 预期 audio streams: 1 · duration: 116+
```

## 禁

- 不改其他文件(只 poster_import.rs)
- 不动 nf-project / nf-recorder
- 不 commit / 不 push

## 报告

- ✅/❌ 找到正确 src 字段位置 · 哪个
- ✅/❌ poster-import 跑通 · 0 audio warning
- ✅/❌ mp4 audio_muxed=true · ffprobe 1 audio stream
- 一句话 · 字段是啥 + 怎么修的
