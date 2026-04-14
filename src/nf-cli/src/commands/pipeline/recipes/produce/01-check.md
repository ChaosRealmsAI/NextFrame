# Step 1: 确认素材 + 检查组件

## 素材确认

### Type A（有素材 — 访谈切片）
```bash
# 确认视频片段存在
ls clips/clip_01.mp4
ffprobe -v quiet -show_entries format=duration -of csv=p=0 clips/clip_01.mp4

# 确认翻译数据存在且结构正确
node -e "
  const f = require('./translate/clip_01.fine.json');
  console.log('segments:', f.segments.length, 'duration:', f.clip_duration);
  // 验证结构: 每个 segment 有 s/e/speaker/en/cn[]
  for (const seg of f.segments.slice(0,2)) {
    console.log('  seg', seg.s, '-', seg.e, seg.speaker, 'cn:', seg.cn.length);
  }
"
```

### Type B（纯创作 — 讲解视频）
```bash
# 确认脚本/数据文件存在
ls script.md   # 或其他输入数据
```

## 组件检查

```bash
# 列出当前 ratio 下所有可用组件
nextframe scenes

# 9:16 访谈需要 7 个:
#   interviewBg, interviewHeader, interviewVideoArea,
#   interviewBiSub, interviewMeta, interviewBrand, progressBar9x16
#
# 16:9 讲解需要 9 个:
#   darkGradient, headlineCenter, codeTerminal, flowDiagram,
#   lecturePanel, subtitleBar, progressBar, slideChrome, videoClip
```

## 门禁

- 素材文件全部存在
- 缺组件 → 进 Step 2（做组件）
- 全有 → 跳到 Step 3（写 timeline）

## 必读

- `src/nf-core/scenes/shared/design.js` — TOKENS/GRID/TYPE 设计规范
- 老版本参考: `MediaAgentTeam/.../frames/slide-base.js` + `clip-slide.js` + `subs-zone.js`
