# STATE 06: Record + Verify Video

## 你在哪
HTML 已验证通过。最后一步：录制 MP4 并验证。

## ACTION — 录制
```bash
/Users/Zhuanz/bigbang/MediaAgentTeam/recorder/target/release/recorder slide {htmlPath} --out {mp4Path} --width {width} --height {height} --fps 30 --dpr 2
```

## VERIFY — 录完后立即执行

### 1. 检查文件存在 + 大小
```bash
test -f {mp4Path} && echo "MP4 exists: $(du -h {mp4Path} | cut -f1)" || echo "MP4 MISSING"
```
- [ ] 文件存在
- [ ] 文件大小 > 100KB（太小说明有问题）

### 2. 检查时长和分辨率
```bash
ffprobe {mp4Path} 2>&1 | grep -E "Duration|Video:"
```
- [ ] Duration 与 timeline.duration 一致（±1s）
- [ ] 分辨率正确（width*dpr x height*dpr）
- [ ] fps 正确（30fps）

### 3. 抽帧检查 — 每段各一帧
```bash
# Phase 1
ffmpeg -y -ss 2 -i {mp4Path} -frames:v 1 /tmp/verify-phase1.png 2>/dev/null
# Phase 2 (中间)
ffmpeg -y -ss {mid} -i {mp4Path} -frames:v 1 /tmp/verify-phase2.png 2>/dev/null
# Phase 3 (结尾)
ffmpeg -y -ss {end} -i {mp4Path} -frames:v 1 /tmp/verify-phase3.png 2>/dev/null
```
查看抽帧图片：
- [ ] Phase 1 帧：内容正确？不是空白？
- [ ] Phase 2 帧：内容切换了？跟 Phase 1 不同？
- [ ] Phase 3 帧：内容切换了？跟 Phase 2 不同？
- [ ] 每帧都有背景、有内容、有进度条？

### 4. 不是静态帧
- [ ] 三帧内容不完全相同（证明 recorder 在不同时间点渲染了不同画面）
- [ ] 进度条在三帧中位置不同（0% → 50% → 100%）

## FAIL？怎么修
| 问题 | 修法 |
|------|------|
| MP4 不存在 | recorder 崩了，看报错。可能 HTML 有 JS 错误 |
| 时长不对 | build.js 的 __SLIDE_SEGMENTS 没设对。重新 build 再录 |
| 分辨率不对 | --width --height --dpr 参数检查 |
| 三帧完全一样 | recorder 没驱动时间轴。检查 __onFrame 是否正确暴露 |
| 进度条不动 | progressBar 的 totalDuration 没设 |
| 帧是黑屏 | scene render 有 bug，回到 STATE 03 验证 scene |

## DONE
全部 PASS → 视频制作完成！
```bash
open {mp4Path}
```
