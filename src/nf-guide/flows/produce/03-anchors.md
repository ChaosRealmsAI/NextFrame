# Step 03 · 生成 Anchors（时间锚点）

v0.8 **不手写毫秒**。先把 TTS word timing 变成可引用的 anchors。

## 🛑 1 · 硬规则（违反 = 当前 flow 作废）

- ❌ **禁止手写毫秒数**（ADR-017）— timeline 里所有 `begin` / `end` / `at` 只引用 anchor 名字
- ❌ **禁止用 Node/Python 脚本自己算 anchors 塞进 timeline.v08.json**（v1.0 opus 踩过）
- ❌ **禁止把 anchors 节点写成 `{begin:N, end:N}`**（那是 clip 字段，不是 anchor 形态）
- ✅ **必须用 CLI**：`nextframe anchors from-tts` 或者手动写 `{at:N}` / `{src:"whisper",...}`
- ✅ **anchors 是唯一时间源**：从 TTS 产出的 `.timeline.json` 或手动对齐生成
- ✅ **runtime 只看 build 后的绝对毫秒；anchor 名字只存在 build 前**

### anchors 节点的合法形态（白名单）

```json
{
  "s0.begin":  { "at": 0 },
  "s0.end":    { "src": "whisper", "path": "tmp/audio/seg-01.timeline.json", "word": -1 },
  "s0.w0.end": { "src": "whisper", "path": "tmp/audio/seg-01.timeline.json", "word": 0 }
}
```

**`{begin:N, end:N}` 是非法**（会被 `scripts/lint-anchors.sh` 当场 FAIL）。如果 CLI 输出了这种形态 = 命令用错了。

## 🚨 卡住不准绕

`nextframe anchors from-tts` CLI 不存在 / 不吃 vox 的 `.timeline.json` 格式 / 产出格式不符预期 → **立即停下写 `BLOCKED: {具体原因}`**，让主 agent 决定修 CLI 还是修 flow，**禁止自己写 adapter 脚本糊弄过去**。绕了就导致 v1.0 那次"anchors 偷懒手写毫秒"的复盘。

## 2 · Anchor 命名约定（3 层结构）

```
seg0.begin           ← 整段开始（段级，必有）
seg0.end             ← 整段结束（段级，必有）
seg0.sentence0.begin ← 句级（可选，用于 scene / subtitle 切换）
seg0.sentence0.end
seg0.w0.begin        ← 词级（可选，用于精确强调 word-level 动画）
seg0.w0.end
```

**段（seg）= 一个 mp3 文件**；**句（sentence）= 段内一个句号分隔**；**词（w）= 逐词 whisperX 时间戳**。

## 3 · 生成命令

```bash
nextframe anchors from-tts tmp/audio/seg-01.words.json \
  --out tmp/anchors-seg-01.json --json
```

批量：

```bash
for i in tmp/audio/seg-*.words.json; do
  base=$(basename "$i" .words.json)
  nextframe anchors from-tts "$i" \
    --out "tmp/anchors-$base.json" --json
done
```

合并所有 anchors 到一个文件：

```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('tmp').filter(f => f.startsWith('anchors-') && f.endsWith('.json'));
const merged = {};
for (const f of files) Object.assign(merged, JSON.parse(fs.readFileSync('tmp/'+f)));
fs.writeFileSync('tmp/anchors.json', JSON.stringify(merged, null, 2));
console.log('merged', Object.keys(merged).length, 'anchors');
"
```

## 4 · Mini 示例

```json
{
  "s0.begin":     { "at": 0 },
  "s0.end":       { "src": "whisper", "path": "tmp/audio/seg-01.words.json", "word": -1 },
  "s0.w0.begin":  { "src": "whisper", "path": "tmp/audio/seg-01.words.json", "word": 0 },
  "s1.begin":     { "src": "whisper", "path": "tmp/audio/seg-02.words.json", "word": 0 },
  "s1.sentence0.end": { "src": "whisper", "path": "tmp/audio/seg-02.words.json", "sentence": 0 }
}
```

`{ "at": 0 }` = 绝对毫秒（只给起点）；`{ "src": "whisper", ... }` = 从 words.json 解析。

## 5 · 验证 anchors.json

```bash
cat tmp/anchors.json
# 必须包含至少 s0.begin / s0.end
# 每个 anchor 都有可解析的 at 或 src/path
```

最低要求：
- 顶层是对象
- 有可引用的 anchor id
- timeline 里的 `begin` / `end` / `at` 全部只引用这些名字

## 6 · 失败时怎么处理

- words 文件为空 → 回 Step 00a 重跑 TTS
- anchor 名不稳定 → 修上游 filler，不要继续写 timeline
- 报 `BAD_TTS_WORDS` → 补齐 segment / word 的 `start` 和 `end` 字段

## 下一步

```bash
cargo run -p nf-guide -- produce timeline
```
