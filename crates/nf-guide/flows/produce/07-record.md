# Step 07 · 录制 MP4

v1.0 走 **render CLI 一条命令**（ADR-022）— v0.8 timeline 直接 build + record 一步到位。

## 方案 A（推荐）：render 一条命令

```bash
# 横屏 1920×1080
node src/nf-cli/bin/nextframe.js render \
  projects/v10-landscape/timeline.v08.json \
  output/v1.0/landscape-1920x1080-1min.mp4

# 竖屏 1080×1920
node src/nf-cli/bin/nextframe.js render \
  projects/v10-portrait/timeline.v08.json \
  output/v1.0/portrait-1080x1920-1min.mp4
```

内部：detectFormat = v0.8 → buildV08 生成 tmp html → recorder 录制 → mux 音频 → MP4。

## 方案 B（调试）：两步分解

```bash
# 1. Build HTML
node src/nf-cli/bin/nextframe.js build \
  projects/v10-landscape/timeline.v08.json \
  --out projects/v10-landscape/out.html

# 2. Recorder（横屏）
nextframe-recorder slide projects/v10-landscape/out.html \
  --out output/v1.0/landscape-1920x1080-1min.mp4 \
  --width 1920 --height 1080 --fps 30 --parallel 8

# 竖屏
nextframe-recorder slide projects/v10-portrait/out.html \
  --out output/v1.0/portrait-1080x1920-1min.mp4 \
  --width 1080 --height 1920 --fps 30 --parallel 8
```

## WKWebView DPR 说明（必知）

- `--width 1920 --height 1080` 是 CSS viewport 尺寸（组件 render 里看到的 vp.width = 1920）
- WKWebView 实际渲染按 **DPR=2** → 编码像素 `3840×2160`（Retina）
- ffprobe 看到的 stream width/height 是**编码像素**，不是 CSS 尺寸
- 如需严格 1920×1080 输出：用 ffmpeg 后处理 `-vf scale=1920:1080` 或录制时加 `--dpr 1`

## recorder 未编译？

```bash
# 必须带 --features cli，否则报 "requires the features: cli"
cargo build --release -p nf-recorder --bin nextframe-recorder --features cli
```

## 🚨 parallel segment 有截断风险（v1.0 踩过）

默认 `--parallel 4` 可能把视频切成 4 份并行录 → concat 后时长 = N × 期望时长（v1.0 portrait 踩过：预期 64s 实际 256s）。

**保守用 `--parallel 1`**（sequential），多花 2 分钟但不会出时长错配：

```bash
nextframe-recorder slide out.html --out out.mp4 \
  --width 1080 --height 1920 --fps 30 --parallel 1
```

## 🚨 recorder probe audio 可能静默降级为静音（v1.0 踩过）

recorder 通过扫 `window.__audioSrc` 或 `<audio>` tag 找 audio 文件；如果时机/路径有问题，它会打印 `warn: no audio file found, muxing silent track` 但**不报错继续录静音**。

### 录完**必须**验证 mp4 audio stream 真实性

```bash
ffprobe -v error -select_streams a:0 -show_entries stream=bit_rate,duration \
  -of default=noprint_wrappers=1 output/xxx.mp4
```

判定：
- `bit_rate ≈ 2000`（2 kbps 附近）→ **静音轨**，audio mux 失败
- `bit_rate > 100000`（100+ kbps）→ 真 audio

如果是静音，workaround：事后 ffmpeg mux：

```bash
ffmpeg -y -i recorded.mp4 -i real-audio.mp3 \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k final.mp4
```

## 验证 MP4（先粗查，细查走 Step 09）

```bash
ffprobe -v quiet \
  -show_entries format=duration,size,bit_rate \
  -show_entries stream=index,codec_type,codec_name,width,height,bit_rate \
  -of json output/v1.0/landscape-1920x1080-1min.mp4
```

至少确认：
- 有 1 条 h264 video stream
- 有 1 条 aac audio stream
- `duration ≥ 60.0`
- **audio stream bit_rate > 10000**（排除静音轨）

## 下一步

```bash
cargo run -p nf-guide -- produce concat     # 多段拼接（可选）
cargo run -p nf-guide -- produce verify     # 硬指标 + LLM 判帧门禁
```
