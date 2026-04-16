# Step 00: 定比例

v0.8 先定 `ratio`。后面的 scene 选择、timeline 示例、`nextframe-recorder` 分辨率都跟着它走。

| ratio | width × height | 常见用途 |
| --- | --- | --- |
| `16:9` | `1920 × 1080` | 讲解、教程、桌面录屏、横屏 demo |
| `9:16` | `1080 × 1920` | 访谈切片、短视频、竖屏发布 |

## 规则

- 有真人访谈 / clip 原素材，默认先考虑 `9:16`
- 纯 scene 驱动 + TTS 讲解，默认先考虑 `16:9`
- 用户已经指定比例时，直接服从用户输入

## v0.8 要记住的事

- ratio 只影响 scene 选择和 recorder 尺寸，不改变 anchors / tracks 语义
- built HTML 里 runtime 只看绝对毫秒；anchors 只存在于 build 前
- `nextframe scenes --ratio=<ratio>` 是后续所有 scene 发现的入口

## 下一步

```bash
nf-guide produce check
```
