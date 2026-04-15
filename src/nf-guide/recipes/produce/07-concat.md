# Step 7: 多段拼接（可选）

单段视频跳过此步。多个 clip + bridge 需要拼接成完整一期。

## 准备 concat 列表

按 plan.json 的顺序排列所有片段：

```bash
cat > concat.txt << 'EOF'
file 'clip_01.mp4'
file 'bridge_01.mp4'
file 'clip_02.mp4'
file 'bridge_02.mp4'
file 'clip_03.mp4'
EOF
```

**顺序很重要** — 按内容逻辑排列，不是按文件名。

## 拼接

```bash
# 无重编码拼接（秒完成，前提是所有片段同分辨率同编码）
ffmpeg -f concat -safe 0 -i concat.txt -c copy episode.mp4

# 如果报错"codec not compatible"，用重编码（慢但兼容）：
ffmpeg -f concat -safe 0 -i concat.txt -c:v libx264 -c:a aac episode.mp4
```

## 验证

```bash
ffprobe -v quiet -show_format episode.mp4
# duration 应该 ≈ 所有片段时长之和

open episode.mp4
# 看片段之间的衔接是否自然
```

## 完成

最终产出：`episode.mp4`

回顾整个流程：
```
nf-guide produce ratio     → 定了比例
nf-guide produce check     → 确认了素材和组件
nf-guide produce scene     → 做了缺失组件
nf-guide produce timeline  → 写了时间轴
nf-guide produce validate  → 通过了参数检查
nf-guide produce build     → 构建了 HTML + 看了截图
nf-guide produce record    → 录制了 MP4
nf-guide produce concat    → 拼接了完整一期
```
