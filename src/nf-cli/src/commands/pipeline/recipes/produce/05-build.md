# Step 5: Build + 截图审查

## CLI

```bash
nextframe build timeline.json
```

## 输出

```json
{
  "path": "timeline.html",
  "size": 51000,
  "dimensions": "1080x1920",
  "previews": [
    "timeline-preview/frame-0.5s.png",
    "timeline-preview/frame-40.7s.png",
    "timeline-preview/frame-80.8s.png"
  ],
  "warnings": []
}
```

## AI 必须读截图（不跳过）

```bash
# Read 每张截图，检查：
```

### 开头帧 (frame-0.5s.png)
- 标题和视频区不重叠
- 背景有网格点 + 光晕
- 品牌在底部

### 中间帧 (frame-40.7s.png)
- 字幕显示正确（有中文 + 英文）
- 说话人颜色区分（金色 vs 白色）
- 进度条在中间位置

### 结尾帧 (frame-80.8s.png)
- 进度条接近满
- 最后一条字幕内容正确

## 截图有问题的处理

1. 标题和视频重叠 → 检查 GRID.header 和 GRID.video 间距
2. 字幕没出现 → 检查 segments 数据是否正确传入
3. 空白区域 → 检查 scene render() 返回值
4. 改完 → 回 Step 4 重新 validate + build

## 门禁

- 3 张截图 AI 全部确认 OK
- 如果 --no-preview 跳过截图 → 不允许进 Step 6

## 跳过截图（仅 CI 用）

```bash
nextframe build timeline.json --no-preview
```
