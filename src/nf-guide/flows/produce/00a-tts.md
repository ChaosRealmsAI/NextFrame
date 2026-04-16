# Step 00a · TTS 合成（voice + backend 选型）

**TTS 可跳过**：访谈 / 已有原声 / 无声视频 / 视频本身配过音 → 直接 `nf-guide produce check`，跳到下一步，不需要产任何音频。

**只有当你没有现成音频 + 需要语音旁白 → 做这一步。**

## ⚙️ 工具：nf-tts

**`nf-tts`** 是项目自带的 TTS CLI（源码 `src/nf-tts/`，独立 crate）。安装：

```bash
cd src/nf-tts && cargo build --release && cp target/release/nf-tts ~/.cargo/bin/
```

装完直接命令行调用 `nf-tts ...`。

## 产物目标

这一步结束必须有：

- `tmp/audio/seg-01.mp3` ... `seg-NN.mp3`（每句一段，≤ 8s）
- `tmp/audio/seg-NN.timeline.json`（nf-tts 产出，word-level 时间戳，格式 `{segments:[{text,start_ms,end_ms,words:[{word,start_ms,end_ms}]}]}`）

`seg-NN.timeline.json` 是下一步 anchors 的输入。

## 🛑 产物真实性自检（强制，违反 = 当前 flow 作废）

**不准用 sine wave / 占位音频冒充 TTS 产物**（v1.0 sonnet L1 踩过，用户反馈『嗡嗡声不是中文』）。

完成 TTS 后每段自检：

```bash
# 真实性检查：mp3 必须有语音频谱（mean_volume ≈ -20~-30 dB 且有波动）
for f in tmp/audio/seg-*.mp3; do
  vol=$(ffmpeg -i "$f" -af volumedetect -vn -sn -dn -f null /dev/null 2>&1 | grep mean_volume | awk '{print $5}')
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  echo "$f mean_volume=$vol dur=$dur"
done
# 所有段 mean_volume 在 -40~-10 dB 之间 + 时长不同（语音长度因句长自然变化）
# 如果 8 段文件大小完全一致 / mean_volume 一致 → 可疑，多半是占位音
```

同时必须有 `.timeline.json`（word-level 时间戳），没有 = TTS 没跑成功。

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

### 单句（默认带 timeline.json）

```bash
cd tmp/audio && \
  nf-tts synth -b edge -v zh-CN-YunxiNeural "第一句文案" -o seg-01.mp3
# 产物: tmp/audio/seg-01.mp3 + tmp/audio/seg-01.timeline.json + tmp/audio/seg-01.srt
# 注意: 必须 cd 到目标目录跑，否则 nf-tts 会产到 ./seg-01/seg-01.mp3 子目录（踩过坑）
```

### 批量（推荐 — nf-tts batch）

准备 JSON 配置文件（`id` **必须是整数**，不是字符串，否则报 `expected usize`）：

```bash
cat > tmp/tts-batch.json << 'EOF'
[
  {"id":1,"text":"第一句文案","filename":"seg-01.mp3"},
  {"id":2,"text":"第二句文案","filename":"seg-02.mp3"}
]
EOF

# 必须 cd 到输出目录；用绝对路径指向 batch JSON
cd tmp/audio && nf-tts batch /abs/path/to/tmp/tts-batch.json
```

### 生产用 volcengine（付费，音质好）

```bash
cd tmp/audio && \
  nf-tts synth -b volcengine -v zh_male_taocheng_uranus_bigtts --speech-rate 8 \
    "文案" -o seg-01.mp3
```

**pin 死**：每次 TTS 必须带 `-b`（backend）+ `-v`（voice）+ `-o`（filename），不准省略。

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
