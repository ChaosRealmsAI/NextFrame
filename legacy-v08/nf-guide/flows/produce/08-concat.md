# Step 08 · 多段拼接（OPTIONAL）

**单 scene timeline 不需要 concat，直接跳到 produce verify**。

本步只适用于：你把视频拆成多个独立 timeline 分别录了，要拼成一个最终 mp4。

## 典型场景

- 每章节独立录，最后拼
- 不同 scene 不同 ratio 时（不推荐 — v1.0 不做跨 ratio）
- 分段并行加速

## 命令

```bash
cat > tmp/concat.txt << 'EOF'
file 'seg-01.mp4'
file 'seg-02.mp4'
file 'seg-03.mp4'
EOF

ffmpeg -f concat -safe 0 -i tmp/concat.txt -c copy output/v1.0/final.mp4
```

如果各段编码参数不一致（不同分辨率 / 码率），退回重编码：

```bash
ffmpeg -f concat -safe 0 -i tmp/concat.txt \
  -c:v libx264 -preset medium -crf 18 \
  -c:a aac -b:a 192k \
  output/v1.0/final.mp4
```

## 验证

```bash
ffprobe -v quiet -show_format output/v1.0/final.mp4
```

## 下一步

```bash
cargo run -p nf-guide -- produce verify
```
