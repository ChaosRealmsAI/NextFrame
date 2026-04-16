# Step 08: 多段拼接（可选）

单段视频跳过。多段时保持和旧流程一样，用 ffmpeg concat。

```bash
cat > concat.txt << 'EOF'
file 'seg-01.mp4'
file 'seg-02.mp4'
file 'seg-03.mp4'
EOF

ffmpeg -f concat -safe 0 -i concat.txt -c copy episode.mp4
```

如果编码不一致，再退回重编码：

```bash
ffmpeg -f concat -safe 0 -i concat.txt -c:v libx264 -c:a aac episode.mp4
```

## 验证

```bash
ffprobe -v quiet -show_format episode.mp4
```
