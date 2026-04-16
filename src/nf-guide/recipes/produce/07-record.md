# Step 07: 录制 MP4

## 命令

```bash
nextframe-recorder slide out.html \
  --out demo.mp4 \
  --width 1920 \
  --height 1080 \
  --fps 30
```

竖屏时改成 `--width 1080 --height 1920`。

## 如果 recorder 未编译

本步骤允许直接记录阻塞：

`needs cargo build --release -p nf-recorder`

不要在 produce recipe 里把编译 recorder 当作默认步骤。

## 验证 MP4

```bash
ffprobe -v quiet \
  -show_entries format=duration,size \
  -show_entries stream=index,codec_type,codec_name,width,height \
  -of json demo.mp4
```

至少确认：

- 有 1 条视频流
- 有音频轨时，音频流存在
- 宽高或其 DPR 放大值匹配 ratio
- 时长和 timeline 接近

注意：

- `--width` / `--height` 是页面 CSS 视口，不一定是最终编码像素
- 在 Retina / DPR=2 环境里，`1920x1080` 常见会录成 `3840x2160`
- 所以 ffprobe 时先看 ratio，再看是否等于 `viewport × DPR`

## 人眼复查

打开视频看 3 件事：

- scene 正常更新，不是全程一帧
- subtitle 在中段能看到
- animation 的目标参数确实变化了

## 下一步

需要多段时：

```bash
nf-guide produce concat
```
