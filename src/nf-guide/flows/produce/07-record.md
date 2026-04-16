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
cargo build --release -p nf-recorder
```

## 验证 MP4（先粗查，细查走 Step 09）

```bash
ffprobe -v quiet \
  -show_entries format=duration,size,bit_rate \
  -show_entries stream=index,codec_type,codec_name,width,height \
  -of json output/v1.0/landscape-1920x1080-1min.mp4
```

至少确认：
- 有 1 条 h264 video stream
- 有 1 条 aac audio stream
- `duration ≥ 60.0`

## 下一步

```bash
cargo run -p nf-guide -- produce concat     # 多段拼接（可选）
cargo run -p nf-guide -- produce verify     # 硬指标 + LLM 判帧门禁
```
