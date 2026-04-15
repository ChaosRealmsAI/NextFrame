# design · 新主题设计语言

> 新系列 / 新主题上手第一步。产出 `src/nf-core/scenes/{ratio}/{theme}/theme.md`。
> 已有 theme.md 的话跳过本 recipe，直接进 produce recipe。

## 为什么要单独的设计阶段

组件自包含（零 import / hex 写死）。要保持视觉一致性，**设计语言必须先单独沉淀成文档**，后续所有组件读这个文档复制值。否则：每个组件 AI 随便选色，看起来像缝合怪。

## 3 步（按顺序走）

| Step | 做什么 | 输出 |
|------|--------|------|
| 00-brief | 定主题气质、目标受众、参考物 | 脑子里（或写在 `.autopilot/` 里） |
| 01-tokens | 定具体 hex / font / px / grid | 脑子里（下一步写进文档） |
| 02-write | 按模板写 `theme.md` | `scenes/{ratio}/{theme}/theme.md` |

## 运行

```bash
cargo run -p nf-guide -- design           # 概览
cargo run -p nf-guide -- design brief     # 第一步 prompt
cargo run -p nf-guide -- design tokens
cargo run -p nf-guide -- design write
```

## 完成标准

- `theme.md` 包含：气质、配色 hex、字体阶梯、字号阶梯、网格坐标、图层顺序、组件设计原则
- 值都是具体的（hex 不是 "orange"；字号不是 "big"）
- AI 读一遍就能照抄到组件文件里

完成后 → 进入 `produce` recipe 开始做组件和视频。
