# Step 6: 录制 MP4

## CLI

```bash
# 9:16 竖屏
nextframe-recorder slide timeline.html \
  --out output.mp4 --width 1080 --height 1920 --fps 30

# 16:9 横屏
nextframe-recorder slide timeline.html \
  --out output.mp4 --width 1920 --height 1080 --fps 30
```

## 关键日志检查

录制完看日志，确认：

```
segment 1: detected 1 videoClip layer(s)    ← 视频层被检测到
overlay: compositing 1 video layer(s)       ← ffmpeg 叠加执行了
output ready: /tmp/output.mp4               ← 输出成功
```

如果没有 "detected videoClip" → scene 缺少 `meta.videoOverlay = true`
如果没有 "overlay: compositing" → 视频路径解析失败，检查路径是否含中文

## 验证输出

```bash
ffprobe -v quiet -show_entries format=duration,size \
  -show_entries stream=width,height,codec_name -of json output.mp4

# 检查:
#   width × height 匹配 ratio
#   duration ≈ timeline.duration (±1s)
#   有 h264 视频轨
#   有 aac 音频轨（Type A 有原声时）
```

## 已知坑

### 中文路径 404
视频文件路径含中文 → recorder URL 编码解码可能出错。
修复: 用绝对路径，或创建 ASCII symlink。

### 视频区位置错
recorder 从 DOM `getBoundingClientRect()` 读视频位置。
如果 scene 没渲染或位置异常 → 视频叠加到错误位置。
验证: 对比 preview 截图里的黑色视频框和最终 MP4 里视频的位置。

### WKWebView 渲染不全
多个 absolute-positioned div 可能在快速 DOM 更新时丢失。
代码块用 `<pre>`，流程图用 `<svg>`。

## 门禁

- output.mp4 存在
- ffprobe 分辨率匹配
- ffprobe 时长 ≈ timeline.duration
- 有音频轨（如果 timeline 有 audio）
