# Step 01: 确认素材 + 检查组件

## 先确认输入

你至少要有下面其中一种：

- 访谈 / 原声路线：`clip.mp4` 或等价视频素材
- TTS / 纯创作路线：`seg0.mp3` + `seg0.words.json`

如果走字幕路线，还要知道哪句文案应该落在哪个 anchor 区间。

## 检查当前 ratio 下有什么 scene

```bash
nextframe scenes --ratio=<ratio>
nextframe scenes <scene-id>
```

最低配通常需要：

- 1 个背景 scene
- 1 个主 scene
- 需要品牌条 / 装饰时，再补 chrome / overlay

如果你准备做最小 smoke，1 个 scene 就够。

## 需要主题时先读主题

```bash
cat src/nf-core/scenes/<ratio-dir>/<theme>/theme.md
```

不读主题就写 params，极容易把字号、留白、颜色写到错误轨道。

## 缺 scene 怎么办

```bash
nf-guide produce scene
```

## 下一步

- scene 不够：`nf-guide produce scene`
- scene 已齐：`nf-guide produce anchors`
