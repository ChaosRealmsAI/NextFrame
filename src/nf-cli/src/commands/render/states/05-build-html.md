# STATE 05: Build HTML

## 你在哪
时间线已验证通过。现在构建单文件 HTML。

## ACTION
```bash
node src/nf-cli/bin/nextframe.js build {timelinePath} -o {htmlPath}
```

## VERIFY — build 成功后立即执行

### 1. 打开 HTML
```bash
open {htmlPath}
```

### 2. 逐时间段检查 ⛔ 每一条都要确认
拖动进度条到每个时间段的中点，确认：

- [ ] **Phase 1 (开头 1/3 时间)：** 内容正确显示？文字完整可读？
- [ ] **Phase 2 (中间 1/3 时间)：** 内容切换了？前一段消失了？
- [ ] **Phase 3 (最后 1/3 时间)：** 内容切换了？前一段消失了？
- [ ] **t=0：** 背景正确？第一帧有内容？不是白屏/黑屏？
- [ ] **t=末尾：** 进度条满？最后一帧正确？

### 3. 全局 Checklist
- [ ] **背景色正确？** 暖棕/深黑，不是紫色
- [ ] **文字清晰？** 对比度高，不模糊
- [ ] **安全区？** 内容离边缘 ≥ 60px
- [ ] **无重叠？** 同时可见的内容层没有互相遮挡
- [ ] **进度条？** 从 0 到 100% 线性填充
- [ ] **字幕？** 按 SRT 时间正确切换
- [ ] **Play 可用？** 点 Play 能自动播放，拖 scrubber 能跳转
- [ ] **比例正确？** 16:9 是宽屏，9:16 是竖屏，画面不拉伸

### 4. 截图留证（每段各一张）
```bash
# 如果有 screenshot 工具
ffmpeg -y -ss 2 -i {htmlPath} -frames:v 1 /tmp/phase1.png 2>/dev/null
```
或者直接在浏览器里目测确认。

## FAIL？怎么修
| 问题 | 修法 |
|------|------|
| 白屏 | build 失败了，看报错。可能 scene 有语法错误 |
| 内容不切换 | 检查 timeline 的 start/dur，确保不同段的时间不同 |
| 文字重叠 | 两个内容层时间重叠了，调整 start/dur |
| 背景紫色 | scene 默认 theme 不对，显式传 params.bg |
| 进度条不动 | progressBar 需要 totalDuration 参数 |
| 字幕不出 | 检查 srt 参数格式：[{s,e,t}] |
| 画面比例错 | width/height 设置不对 |

修完后：重新 build → 重新执行整个 STATE 05 验证。

## NEXT STATE
全部 PASS → 进入 STATE 06（录制视频）
```bash
nextframe video-guide {timelinePath}
```
