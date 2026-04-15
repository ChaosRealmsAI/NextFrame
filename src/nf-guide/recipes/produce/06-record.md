# Step 6: 录制 MP4

## 录制命令

```bash
# 9:16 竖屏
./target/release/nextframe-recorder slide timeline.html \
  --out output.mp4 --width 1080 --height 1920 --fps 30

# 16:9 横屏
./target/release/nextframe-recorder slide timeline.html \
  --out output.mp4 --width 1920 --height 1080 --fps 30
```

**注意：** 用 `./target/release/nextframe-recorder`（release 版本），不用 debug 版本（慢 10 倍）。

如果 recorder 没编译过：
```bash
cargo build -p nf-recorder --features cli --release
```

## 录制日志检查

录制完成后，在日志里确认这几行：

```
segment 1: detected N videoClip layer(s)     ← 视频层被检测到
overlay: compositing N video layer(s)        ← ffmpeg 叠加执行了
output ready: /path/to/output.mp4            ← 输出成功
XX.X MB | WxH | 30fps | h264_videotoolbox    ← 编码信息
```

### 日志里没有 "detected videoClip"
→ scene meta 缺少 `videoOverlay: true`
→ 回 Step 2 修 scene

### 日志里没有 "overlay: compositing"
→ 视频源路径解析失败
→ 可能原因：中文路径、相对路径、文件不存在
→ 检查 timeline 里的视频 src 是否用绝对路径

### 日志里有 "failed to resolve"
→ 视频文件路径有问题
→ 用 `ls` 确认路径存在
→ 如果路径含中文，用绝对路径（已修复 UTF-8 解码，但仍推荐绝对路径）

## 验证输出

```bash
ffprobe -v quiet -show_entries format=duration,size \
  -show_entries stream=width,height,codec_name -of json output.mp4
```

检查：
- [ ] width × height 匹配 ratio（9:16 = 2160×3840 因为 DPR=2，或 1080×1920）
- [ ] duration ≈ timeline.duration（±1 秒以内）
- [ ] 有 h264 视频轨
- [ ] 有 aac 音频轨（如果 timeline 有 audio）

### duration 差太多
→ recorder 的 `__SLIDE_SEGMENTS` 计算有问题
→ 检查 timeline.duration 是否和 fine.clip_duration 一致

### 没有音频轨
→ audio src 路径错或不存在
→ recorder 日志里搜 "audio" 看有没有 warning

## 打开看一眼

```bash
open output.mp4
```

确认：
- 视频在正确的框里（不是全屏铺开也不是偏了）
- 字幕跟说话人同步
- 整体节奏正常

## 下一步

如果是单段视频 → 完成！

如果需要多段拼接：
```bash
nf-guide produce concat
```
