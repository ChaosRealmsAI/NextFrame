# STATE 03: Verify Scene ⛔ BLOCKING

## 你在哪
刚创建或修改了一个 scene。必须验证才能继续。不验证 = 没做完。

## ACTION — 逐条执行，每条都要看结果

### 1. 打开预览截图
```bash
open src/nf-core/scenes/{ratioDir}/{category}/{name}/preview.html
```
等浏览器打开后截图或自己目测。

### 2. 视觉 Checklist（全部 PASS 才行）
- [ ] **背景色正确？** 16:9=#1a1510深暖棕 / 9:16=#0a0a0a深黑。不是紫色、不是亮色
- [ ] **文字可读？** 对比度足够，字号≥14px，中文不乱码
- [ ] **内容在安全区内？** 四周留出 60px 以上。文字不贴边、不截断
- [ ] **颜色符合主题？** 只用 token 里的色值。没有随机的彩色
- [ ] **动画正确？** 拖动时间条，0s→5s→结束，有过渡效果（淡入/移入）
- [ ] **没有溢出？** 内容没有超出 canvas 边界

### 3. 代码 Checklist
```bash
# 确认 meta 正确加载
node src/nf-cli/bin/nextframe.js scenes {name}
```
- [ ] `nextframe scenes {name}` 能输出完整 meta
- [ ] description 是中文一句话，不是 TODO
- [ ] params 里每个参数有 type + default
- [ ] render 函数 export 正确（不报错）

### 4. preview.html 独立可用
- [ ] preview.html 用 `file://` 能直接打开（不依赖 import）
- [ ] render 函数已从 index.js 同步到 preview.html
- [ ] Play 按钮能播放，时间条能拖动

## FAIL？怎么修
| 问题 | 修法 |
|------|------|
| 背景色不对 | 检查 params.bg 默认值，改成正确的 token |
| 文字太小 | 加大 fontSize 参数默认值 |
| 内容溢出 | 加 overflow:hidden 或缩小尺寸 |
| 中文乱码 | 确保 font-family 包含 PingFang SC |
| preview 白屏 | render 有 JS 语法错误，看 console |
| TODO 没改 | 搜索 TODO 替换成实际内容 |

## 修完后重新执行整个 STATE 03。全部 PASS 后再进入下一步。

## NEXT STATE
- 还有缺的 scene → 回到 STATE 02
- 所有 scene 就绪 → 进入 STATE 04（时间线）
- 验证命令：`nextframe video-guide --type={type}`
