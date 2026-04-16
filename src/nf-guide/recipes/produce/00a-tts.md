# Step 00a · TTS 合成（voice + backend 选型）

纯 TTS 视频从这起手。访谈 / 已有原声跳过。

## 产物目标

这一步结束必须有：

- `tmp/audio/seg-01.mp3` ... `seg-NN.mp3`（每句一段，≤ 8s）
- `tmp/audio/seg-NN.words.json`（每段对应逐词时间戳）

`seg-NN.words.json` 是下一步 anchors 的输入。

## 1 · Backend 选型（2 选 1）

```
if 免费 / 快速 / 中文够用 / 不追求极致音质 → edge（默认）
else 预算 OK / 追求专业音质 / 要更多情感控制 → volcengine
else 不确定 → edge
```

| Backend | 价格 | 音质 | 情感 |
|---------|------|------|------|
| **edge** | 免费 | 好 | 中立 |
| **volcengine** | 付费 | 极好 | 丰富 |

## 2 · Voice 选型（3 维决策）

```
性别:   男声 / 女声
语言:   纯中文 / 中英双语
情感:   calm（讲解）/ excited（产品发布）/ neutral（新闻）
```

### edge backend 常用 voice

| 情境 | voice | 性别 | 风格 |
|------|-------|------|------|
| 产品介绍 / 技术讲解（默认） | `zh-CN-YunxiNeural` | 男 | 沉稳有力 |
| 教育 / 温和讲解 | `zh-CN-XiaoxiaoNeural` | 女 | 亲和清晰 |
| 新闻 / 严肃 | `zh-CN-YunjianNeural` | 男 | 播音感 |
| 活力 / 营销 | `zh-CN-XiaoyiNeural` | 女 | 活泼 |

**v1.0 默认**：`zh-CN-YunxiNeural`（产品介绍场景最稳）。

## 3 · 合成命令（pin 死）

单句：

```bash
vox --backend edge --voice zh-CN-YunxiNeural \
  --text "第一句文案" \
  --out tmp/audio/seg-01.mp3
```

批量（一句一段，每段 ≤ 8s）：

```bash
# 1. 拆句到 tmp/audio/script.txt（每行一句）
# 2. 循环合成
i=1
while IFS= read -r line; do
  vox --backend edge --voice zh-CN-YunxiNeural \
    --text "$line" \
    --out "tmp/audio/seg-$(printf %02d $i).mp3"
  i=$((i+1))
done < tmp/audio/script.txt
```

## 4 · 逐词对齐（whisperX 或 nextframe audio-synth）

```bash
nextframe audio-synth <project> <episode> --segment=NN --json
```

读返回 JSON 找 words 文件路径，复制成统一名：

```bash
cp <returned-words.json> tmp/audio/seg-NN.words.json
```

或手动跑 whisperX：

```bash
whisperx tmp/audio/seg-NN.mp3 --model large-v3 --language zh \
  --output_dir tmp/audio/ --output_format json
```

## 5 · 验证

```bash
node -e "const d=require('./tmp/audio/seg-01.words.json');
const words=(d.segments||[]).flatMap(s=>s.words||[]);
console.log({segments:(d.segments||[]).length, words:words.length});"
```

要求：
- ≥ 1 个 segment
- ≥ 1 个 word
- word 含 `start` / `end` ms 字段

## 6 · 分段原则（硬规则）

- **每句一段 seg-NN.mp3**（不是一整段 TTS）
- **每段 ≤ 8s**（超过就拆）
- **段之间可以留 300-500ms 静音**（呼吸感，避免连读）
- **总时长 ≥ 60s** 分成 10-20 个 seg（v1.0 目标 1 分钟视频）

## 下一步

```bash
cargo run -p nf-guide -- produce check
```
