# NextFrame — AI-Native Video Editor (v0.3)

## CLI 是唯一入口

```bash
node src/cli/bin/nextframe.js --help    # 完整使用指南在这里
```

CLI help 包含：workflow、timeline 格式、layer 属性、keyframe 动画、布局模板、组件创建方法。
**AI 拿到 CLI 就能用，不需要读其他文档。**

## 没有合适组件 → 自己写

写 `src/runtime/web/src/scenes-v2/myScene.js`，加到 `index.js` 注册。格式见 `nextframe --help`。
