# Step 0: 定比例

比例是一切的起点。后续全部从这里派生。

## 决策

| 比例 | 尺寸 | 设计系统 | 适用场景 |
|------|------|----------|---------|
| 9:16 | 1080×1920 | GRID + TYPE | 访谈切片、短视频、竖屏 |
| 16:9 | 1920×1080 | GRID_16x9 + TYPE_16x9 | 讲解、教程、产品演示 |

## 怎么判断

- 有原始视频素材（播客、访谈）→ 通常 **9:16**（短视频平台竖屏）
- 纯 AI 创作（代码讲解、流程图、教程）→ 通常 **16:9**（横屏）
- 用户明确指定了 → 按用户说的

## 确定后记住

后续每一步都要用到这些值，记在脑子里：

### 9:16 确定后
```
ratio=9:16  width=1080  height=1920
design: GRID, TYPE, TOKENS.interview
scenes 目录: src/nf-core/scenes/9x16/
recorder: --width 1080 --height 1920
```

### 16:9 确定后
```
ratio=16:9  width=1920  height=1080
design: GRID_16x9, TYPE_16x9, TOKENS.lecture
scenes 目录: src/nf-core/scenes/16x9/
recorder: --width 1920 --height 1080
```

## 必读

```bash
cat src/nf-core/scenes/shared/design.js
```
看 GRID (9:16) 和 GRID_16x9 (16:9) 两套布局的区别。所有像素坐标都在这里。

## 下一步

```bash
nf-guide produce check
```
确认素材和组件是否齐全。
