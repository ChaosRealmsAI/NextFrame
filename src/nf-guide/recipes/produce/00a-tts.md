# Step 0a: TTS 生成（Type C 起点）

**仅 Type C（纯 TTS 视频）需要这一步**。Type A（访谈切片）跳过，用 clip 原声。

## 单段合成

```bash
nf-tts synth "你的中文旁白文本，写得自然一点。" \
  -d ./audio -o narration \
  -b edge           # edge = 免费，调试用；production 用 volcengine
```

产出：
- `audio/narration/narration`（mp3 文件，OS file 看是 audio/mpeg）
- `audio/narration/narration.timeline.json`（char 级时间戳，v0.6 必需）
- `audio/narration/narration.srt`（标准字幕，v0.6 不用，留给其他工具）

**注意**：mp3 输出是无扩展名文件，要手动改名：
```bash
mv audio/narration/narration audio/narration/narration.mp3
```

## 多段合成（长视频）

见 `nf-guide audio` recipe — 按 script.json 的 segment 逐段合成，最后 `nf-tts concat` 拼接。

## voice 选择

```bash
nf-tts voices              # 列出所有
nf-tts preview <voice-id>  # 试听
```

推荐：
- edge: `zh-CN-XiaoxiaoNeural`（女声）、`zh-CN-YunxiNeural`（男声）
- volcengine: 见 `nf-tts voices --backend volcengine`

## 验证 timeline.json 合法

```bash
python3 -c "import json; d=json.load(open('audio/narration/narration.timeline.json')); print(f'{len(d[\"segments\"])} segs, {sum(len(s[\"words\"]) for s in d[\"segments\"])} words')"
```

至少 1 segment + 每 segment ≥1 word，才能进 Step 3。

## 下一步

→ Step 1: check（素材+组件齐全）
或直接 → Step 3: timeline（用 `nextframe match from-tts` 一键起手）
