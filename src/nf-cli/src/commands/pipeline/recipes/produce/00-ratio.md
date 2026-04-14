# Step 0: 定比例

比例是一切的起点。后续全部从这里派生：用哪套 GRID、查哪些 scene、timeline 的 width×height、recorder 参数。

## 决策

| 比例 | 尺寸 | 设计系统 | 适用场景 |
|------|------|----------|---------|
| 9:16 | 1080×1920 | GRID + TYPE | 访谈切片、短视频 |
| 16:9 | 1920×1080 | GRID_16x9 + TYPE_16x9 | 讲解、教程、产品演示 |

## CLI

```bash
# 确认后设定（写入 .nextframe/produce.json）
nextframe pipeline init --recipe produce --ratio 9:16
# 或
nextframe pipeline init --recipe produce --ratio 16:9
```

## 门禁

- ratio 必须是 "9:16" 或 "16:9"
- 设定后不可中途更改（改 = 重新 init）

## 必读

- `src/nf-core/scenes/shared/design.js` — 看 GRID (9:16) 和 GRID_16x9 (16:9) 的区别
