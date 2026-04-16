# component · 打造单个 scene 组件（单步状态机）

> 对标：**小Lin说 × Kurzgesagt × Vox × 3Blue1Brown × Fireship**。每一帧都是精心设计的画面，不是文字堆砌。做不到就不做。

produce/02-scene 是"怎么批量做"，本 flow 是"怎么做好一个"。

## 什么时候走这个

- 要做一个**新组件**（已跑完 design flow、theme.md 存在）
- 要**升级老组件**（从静态升级到有动画）
- **审美评审**一个组件

## 4 步

| Step | 做什么 | 输出 |
|------|--------|------|
| 00-pick | 定 role/type + **视觉主体**（frame-craft 12 模式） | 脑子里 |
| 01-aesthetics | 吸收 5 位顶级博主审美 + 动画 12 原则 | 脑子里 |
| 02-craft | scene-new CLI 生成骨架 + 填内容 + 接 runtime / t-driven 动画 | `{role}-{id}.js` |
| 03-verify | smoke + gallery + checklist 三关 | 绿灯才算完 |

## 跑

```bash
cargo run -p nf-guide -- component
cargo run -p nf-guide -- component pick
cargo run -p nf-guide -- component aesthetics
cargo run -p nf-guide -- component craft
cargo run -p nf-guide -- component verify
```

## 铁律（看完再进 step）

1. **每帧必须有视觉主体**（真界面 / 真 artifact / 真数据 / 大数字）占画面 ≥ 40%。纯文字 = 废。
2. **60% 留白**。内容不超过画面 40% 面积。
3. **动画必须走** cubic-bezier(0.16, 1, 0.3, 1)，禁 linear，禁 bounce/rotate 花哨。
4. **字号 5 级** 不自己发明中间值（xl/l/m/s/xs）。
5. **一画面最多 3 种语义色**（背景不算）。
6. **每 3-5 秒画面必须有变化**。
7. **所有文字肉眼看得见**，主文字 100% 透明度 + 足够对比度。
8. **hex/字号/坐标写死**在组件文件里（零 import），从 theme.md 复制。

完成标准：smoke pass + gallery 里能看到动画 + checklist 13 项全绿。
