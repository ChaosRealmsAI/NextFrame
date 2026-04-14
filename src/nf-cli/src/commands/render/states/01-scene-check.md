# STATE 01: Scene Check

## 你在哪
刚开始做视频。需要确认所有必要的组件（scene）都已就绪。

## ACTION
运行以下命令查看当前有哪些 scene：
```bash
node src/nf-cli/bin/nextframe.js scenes
```

对照下面的必要清单，标记哪些有、哪些缺。

## 必要 Scene（16:9 讲解）
| Scene | Category | 作用 |
|-------|----------|------|
| darkGradient | backgrounds | 深暖棕背景 |
| headlineCenter | typography | 居中大标题 |
| subtitleBar | overlays | SRT 字幕条 |
| progressBar16x9 | overlays | 底部进度条 |

## 必要 Scene（9:16 访谈）
| Scene | Category | 作用 |
|-------|----------|------|
| interviewBg | backgrounds | 深黑背景 |
| interviewTopBar | overlays | 顶部系列标题栏 |
| interviewBiSub | overlays | 双语字幕 |
| progressBar9x16 | overlays | 底部进度条 |

## VERIFY
- [ ] 运行了 `nextframe scenes`
- [ ] 对照清单标记了有/缺
- [ ] 如果全部就绪 → 进入 STATE 04（时间线）
- [ ] 如果有缺 → 进入 STATE 02（创建 scene）

## NEXT STATE
- 有缺 → `nextframe video-guide --type=<type>` 会输出 STATE 02
- 全部就绪 → `nextframe video-guide --type=<type>` 会输出 STATE 04
