# Step 01 · 确认素材 + 检查组件

## 1 · 先确认输入

你至少要有其中一种：

- **纯创作路线**（v1.0 主力）：`tmp/audio/seg-*.mp3` + `tmp/audio/seg-*.words.json`
- **访谈 / 原声路线**：`clip.mp4` 或等价视频素材

纯创作路线必须先完成 Step 00a（TTS 合成）。

## 2 · 检查当前 ratio + theme 下有什么 scene

```bash
node src/nf-cli/bin/nextframe.js scenes --ratio=<ratio> --theme=<theme>
node src/nf-cli/bin/nextframe.js scenes <scene-id>
```

最低配：

- 1 个 **bg** scene（底色 / 氛围）
- 1 个 **content** 或 **text** scene（主内容）
- 可选 **chrome** / **overlay**

v1.0 1 分钟视频建议 5-8 个 scene clips（每 scene 平均 7-12s）。

## 3 · 先读 theme.md

```bash
cat src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
```

不读 theme.md 就写 params = 字号 / 留白 / 颜色写错。

## 4 · 缺 scene 怎么办

```bash
cargo run -p nf-guide -- component
```

走 component recipe 4 步（pick → aesthetics → craft → verify）把缺的 scene 做出来。

## 5 · type 白名单检查（硬规则）

所有现有 scene 的 `type` 字段必须 ∈ `{dom, media}`。不在白名单的 scene 会被 build-v08 拒绝（报 `UNSUPPORTED_SCENE_TYPE`）。

```bash
grep -E '^\s+type:' src/nf-core/scenes/<ratio-dir>/<theme>/*.js \
  | grep -v -E 'type:\s*"(dom|media)"'
```

输出非空 = 有违规 scene，必须先回 component recipe 改。

## 下一步

- scene 不够：`cargo run -p nf-guide -- component`
- scene 已齐：`cargo run -p nf-guide -- produce scene`
