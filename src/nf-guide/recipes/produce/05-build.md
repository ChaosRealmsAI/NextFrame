# Step 5: Build + 截图审查

## 构建

```bash
nextframe build timeline.json
```

输出 JSON 包含 `previews` 数组（3 张截图路径）：

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

如果没有 `previews`（puppeteer 不可用），手动截图：

```bash
nextframe preview timeline.json --auto --json --out=/tmp/preview
# 然后读截图
```

## 必须读截图（不能跳过）

对每张截图检查以下项目：

### 开头帧 (frame-0.5s.png)

- [ ] 背景不是纯黑 — 应该有网格点 + 金色光晕（9:16）或暖棕渐变（16:9）
- [ ] 标题可见且清晰
- [ ] 标题文字没有和视频区重叠（标题在 260px 以内，视频从 276px 开始）
- [ ] 品牌名在底部可见

### 中间帧 (frame-40.7s.png)

- [ ] 字幕区有内容（不是空的）
- [ ] 中文字幕是金色或白色（说话人颜色区分）
- [ ] 英文字幕在中文下方，灰色斜体
- [ ] 进度条在大约一半位置
- [ ] 如果有视频区 — 黑色占位框在正确位置（录制时会叠加真实视频）

### 结尾帧 (frame-80.8s.png)

- [ ] 进度条接近满
- [ ] 字幕仍在显示（最后一句）
- [ ] 整体布局没有崩（元素没跑出屏幕）

## 截图有问题？

### 标题和视频重叠
原因：标题字号太大或位置太低。
修复：检查 scene 里 title Y 位置 < GRID.header.height (260px)

### 字幕没出现
原因 1：segments 数据没传入 → 检查 timeline params.segments
原因 2：时间 t 不在任何 segment 范围内 → 检查 fine.json 的 s/e 值
原因 3：scene 没用 findActiveSub → 回 Step 2 检查 scene 代码

### 背景空白
原因：scene render() 返回空字符串或 scene 没被 build 打包
修复：检查 `nextframe scenes` 是否列出该 scene

### 所有元素都不可见
原因：所有 scene 在 t=0 时 opacity=0（fadeIn 动画）
修复：检查截图时间 > 0.3s（开头帧用 0.5s 就是为了过掉 fadeIn）

**改完 → 回 Step 4 重新 validate + build → 再看截图**

## 跳过截图（仅 CI）

```bash
nextframe build timeline.json --no-preview
```

生产流程不要跳过。

## 下一步

3 张截图全部确认 OK 后：

```bash
nf-guide produce record
```
