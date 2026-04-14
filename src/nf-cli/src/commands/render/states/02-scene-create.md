# STATE 02: Create Scene

## 你在哪
需要创建一个缺失的 scene 组件。

## ACTION
1. 创建骨架：
```bash
nextframe scene-new {name} --ratio={ratio} --category={category} --description="{description}"
```

2. 打开生成的 index.js，定制 render() 函数：
   - 参考已有组件：`cat src/nf-core/scenes/16x9/backgrounds/darkGradient/index.js`
   - render(t, params, vp) 必须是纯函数
   - 同样的 (t, params, vp) → 同样的 HTML

3. 同步更新 preview.html：
   - 从 index.js 复制 render 函数（去掉 export）
   - 填入 DEMO 参数

## 主题色约束（必须遵守）
| Token | 16:9 讲解 | 9:16 访谈 |
|-------|-----------|-----------|
| 背景 | #1a1510 | #0a0a0a |
| 文字 | #f5ece0 | #f5ece0 |
| 强调 | #da7756 | #da7756 |
| 金色 | #d4b483 | #d4b483 |
| 绿色 | #7ec699 | — |
| 蓝色 | #8ab4cc | #8ab4cc |
| 红色 | #e06c75 | — |
| Sans | system-ui | system-ui |
| Serif | Georgia, 'Noto Serif SC' | — |
| Mono | 'SF Mono', monospace | 'SF Mono', monospace |

## 禁止
- ❌ 硬编码颜色（必须用 params 传入或用上面的 token）
- ❌ 在 render() 里用随机数（破坏帧纯性）
- ❌ 超出 viewport 的内容
- ❌ 文字小于 14px
- ❌ 留任何 TODO

## NEXT STATE
创建完后 → 进入 STATE 03（验证 scene）
