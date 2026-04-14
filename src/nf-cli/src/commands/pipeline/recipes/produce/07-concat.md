# Step 7: 多段拼接（可选）

多个 clip + bridge 按顺序拼成完整一期。单段视频跳过此步。

## CLI

```bash
# 创建 concat 列表
cat > concat.txt << 'EOF'
file 'clip_01.mp4'
file 'bridge_01.mp4'
file 'clip_02.mp4'
file 'bridge_02.mp4'
file 'clip_03.mp4'
EOF

# 拼接（无重编码，秒完成）
ffmpeg -f concat -safe 0 -i concat.txt -c copy episode.mp4

# 验证
ffprobe -v quiet -show_format episode.mp4
```

## 注意

- 所有片段必须相同分辨率和编码（recorder 统一输出 h264）
- 顺序按 plan.json 的 clips[] + bridges[] 排列
- bridge 没有视频叠加，只有图文 + TTS 音频

## 门禁

- episode.mp4 存在
- 时长 = 所有片段时长之和（±1s）
