# Step 0: 下载源视频（Code · bare CLI）

## 谁做

Code（yt-dlp + ffprobe）· 你（Agent）直接跑 bare 命令 · 没有 nf-cli wrapper。

## 工作目录

`<project>` = 作者英文名（如 `simon-sinek` / `edureka`）
`<episode>` = 视频 slug（如 `golden-circle` / `blockchain-in-3`）
`<slug>` = 源视频标识（一般 = episode 或更细）

所有产物写到：
```
/Users/Zhuanz/bigbang/NextFrame/tmp/<run>/projects/<project>/<episode>/sources/<slug>/
```

**装依赖**：`pip install yt-dlp` + `brew install ffmpeg jq`（未装就装）。

## CLI（bare · 一把跑）

```bash
EP=tmp/<run>/projects/<project>/<episode>
SLUG=<slug>
mkdir -p $EP/sources/$SLUG

# 1. 下载 720p mp4
yt-dlp \
  -f 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best' \
  --merge-output-format mp4 \
  -o "$EP/sources/$SLUG/source.mp4" \
  "<YouTube URL>"

# 2. 产 meta.json（title / duration / url）
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$EP/sources/$SLUG/source.mp4")
TITLE=$(yt-dlp --print title "<YouTube URL>")
jq -n \
  --arg title "$TITLE" \
  --arg url "<YouTube URL>" \
  --argjson duration "$DURATION" \
  --arg format "720p-mp4" \
  --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: $title, url: $url, duration_sec: $duration, format: $format, downloaded_at: $t}' \
  > "$EP/sources/$SLUG/meta.json"
```

## 输入

YouTube / Vimeo / TED URL。

## 产出（gate: source-downloaded）

```
<episode>/sources/<slug>/
├── source.mp4       # 720p · h264 · 有音轨
└── meta.json        # {title, url, duration_sec, format, downloaded_at}
```

## 验证

```bash
# mp4 必须能 probe · 时长 > 0
ffprobe -v error -show_entries format=duration -of csv=p=0 $EP/sources/$SLUG/source.mp4
# 期望：数 > 0

jq '.title, .duration_sec' $EP/sources/$SLUG/meta.json
# 期望：两行都非空
```

## 常错

- ❌ URL 带 `&feature=youtu.be` 等 param 别截 · 保留完整
- ❌ 选 4K / 1080p（transcribe 慢 · 720p 够）
- ❌ 无 `mp4` 合并（yt-dlp 默认 webm · 下游 ffmpeg 兼容差）
- ❌ 走代理但 yt-dlp 没设（加 `--proxy http://...` 或设 `HTTPS_PROXY`）
