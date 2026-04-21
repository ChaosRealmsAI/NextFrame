# Step 00 · 定比例 + 推荐 theme

v0.8 先定 `ratio`。后面 scene 选择 / timeline / recorder 分辨率全跟着走。v1.0 只做 **16:9 和 9:16**，不做 4:3。

## 决策树（3 条 if-else）

```
if 用户说 "横屏" / "电脑看" / "YouTube" / "B站"      → 16:9
else if 用户说 "竖屏" / "短视频" / "手机" / "抖音" / "小红书" → 9:16
else 不确定 → 问用户："做横屏（16:9）还是竖屏（9:16）？"
```

## ratio 表

| ratio | 分辨率 | 推荐 theme | 用途 |
|-------|--------|-----------|------|
| **16:9** | `1920 × 1080` | `blueprint-cinema` | 讲解 / 教程 / 产品介绍 / 桌面端播放 |
| **9:16** | `1080 × 1920` | `mobile-vertical` | 短视频 / 抖音 / 小红书 / 手机端 |

## 推荐 theme 简介

- **blueprint-cinema**（16:9）— 深蓝 `#0a1628` 底 + 橙红 `#ff6b35` 强调 + 奶白 `#f5f2e8` 文字。蓝图网格 + 电影质感 + 技术感 hud。气质：专业 / 深度 / 科技。
- **mobile-vertical**（9:16）— 亮白 `#f4f6fa` 底 + 蓝 `#2563eb` 强调 + 深灰 `#1f2937` 文字。移动端简洁 + 手机易读 + 轻量。气质：清爽 / 亲和 / 易读。

**没现成 theme.md？** → 先跑 `cargo run -p nf-guide -- design` 产 theme.md 再回来。两个 ratio 需要两个独立 theme.md。

## v0.8 要记住的事

- ratio 只影响 scene 选择 + recorder 尺寸，不改 anchors / tracks 语义
- built HTML runtime 只看绝对毫秒；anchors 只存在于 build 前
- `nextframe scenes --ratio=<ratio> --theme=<theme>` 是后续 scene 发现入口
- 项目目录建议：`projects/v10-landscape/` / `projects/v10-portrait/`

## 硬记录（必须写在 project.json 或脑内）

```
ratio:    16:9 或 9:16
width:    1920 或 1080
height:   1080 或 1920
theme:    blueprint-cinema 或 mobile-vertical
project:  projects/v10-landscape 或 projects/v10-portrait
```

## 下一步

```bash
cargo run -p nf-guide -- produce tts
```
