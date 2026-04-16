# Step 6: 多平台发布（待建）

## CLI（规划中）

```bash
nf-cli source-publish <project> <episode> --clip 1 --platform douyin
```

## 输入

- `clip_NN.mp4`（带字幕合成后的版本 / 或原 clip + 字幕 timeline）
- `clip_NN.caption.zh.md`

## 产出（gate: published）

```
<episode>/clips/clip_NN.publish.json
# { platform: "douyin", post_id: "...", url: "...", posted_at: "..." }
```

## 平台

- 抖音
- 视频号（需扫码授权）
- 小红书
- B站
- YouTube（海外版）

## 谁做

Code 调 nf-publish crate（已有骨架，见 `src/nf-publish/`）。

## 状态

⏳ 还没打通。现阶段：人工手动下载 clip + caption 发。
