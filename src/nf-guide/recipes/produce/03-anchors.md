# Step 03: 生成 Anchors

v0.8 不再手写毫秒。先把 TTS word timing 变成可引用的 anchors。

## 命令

```bash
nextframe anchors from-tts ./seg0.words.json --out=./anchors.json --json
```

预期：

- 退出码 0
- 产出 `anchors.json`
- 名字稳定，至少包含 `seg0.begin` / `seg0.end`

如果你的 TTS 输出里有逐词信息，通常还会有 `seg0.w0.begin` 这类细粒度 anchor。

## 检查 anchors.json

```bash
cat anchors.json
```

最低要求：

- 顶层是对象
- 有可引用的 anchor id
- 后续 timeline 里的 `begin` / `end` / animation `at` 都只引用这些名字

## 失败时怎么处理

- words 文件为空：回 Step 00a
- anchor 名不稳定：先停，修上游 filler，不要继续写 timeline
- `BAD_TTS_WORDS`：补齐 segment / word 的 `start_ms` 和 `end_ms`

## 下一步

```bash
nf-guide produce timeline
```
