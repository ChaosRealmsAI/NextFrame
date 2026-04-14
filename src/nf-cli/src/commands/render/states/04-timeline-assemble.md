# STATE 04: Assemble Timeline

## 你在哪
所有 scene 已就绪并验证通过。现在要拼时间线。

## ACTION

### 1. 确认可用 scene
```bash
node src/nf-cli/bin/nextframe.js scenes
```

### 2. 检查每个 scene 的参数
对每个要用的 scene，查看它需要什么参数：
```bash
node src/nf-cli/bin/nextframe.js scenes {sceneId}
```
看 params 部分，了解每个参数的 type、default、range。不要猜参数。

### 3. 写 timeline JSON
```json
{
  "ratio": "{ratio}",
  "width": {width},
  "height": {height},
  "fps": 30,
  "duration": {duration},
  "background": "{bg}",
  "layers": [
    {"id": "bg", "scene": "darkGradient", "start": 0, "dur": {duration}, "params": {}},
    // 内容层 — 每段内容用不同的 start/dur 控制显示时间
    // 叠加层 — 字幕、进度条全程显示
  ]
}
```

### 层序规则
1. **最底层 = 背景**（z_hint: bottom）
2. **中间 = 内容**（z_hint: middle） — 标题、图表、代码、视频
3. **最上层 = 叠加**（z_hint: top） — 字幕、进度条、顶栏

### 时间不重叠规则
- 同一个视觉位置的内容层，时间不能重叠
- 例：headlineCenter 0-10s + codeTerminal 10-20s → OK
- 例：headlineCenter 0-10s + codeTerminal 5-15s → 重叠！文字会挡住代码

### 字幕规则
subtitleBar 需要 srt 参数：
```json
{"srt": [{"s":0,"e":5,"t":"第一句"},{"s":6,"e":10,"t":"第二句"}]}
```
- s = 开始秒，e = 结束秒，t = 文字
- 不要留空隙超过 1 秒
- 每句 ≤ 20 个中文字

## VERIFY
```bash
node src/nf-cli/bin/nextframe.js validate {timelinePath}
```
- [ ] validate 0 errors
- [ ] 每个 layer 的 scene 存在
- [ ] 内容层时间不重叠
- [ ] 总时长正确

## NEXT STATE
validate 通过 → 进入 STATE 05（构建 HTML）
```bash
nextframe video-guide {timelinePath}
```
