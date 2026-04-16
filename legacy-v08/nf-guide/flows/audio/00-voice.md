# Step 0: 选 voice + engine（Agent 干）

## CLI

无文件产出。决定后在 Step 1 的第一次 `audio-synth` 时通过 flag 传入：
```bash
nextframe audio-synth <project> <episode> --segment 1 --voice <NAME> --backend <edge|volcengine>
```
voice 会持久化到 `pipeline.audio.voice`，后续段自动用同一个，除非显式覆盖。

## 输入

- script.segments（已写好的 narration）
- 内容性质（专业 / 轻松 / 严肃 / 综艺）
- 性别偏好（如有）

## 产出（gate: voice-set）

`pipeline.audio.voice` 字段写入（首次 audio-synth 自动落盘）。

---

## 给 Agent 的提示词

你是音频导演。给这个视频选合适的 TTS engine + voice。

### 决策维度

1. **engine**：
   - `edge` — 微软 Edge TTS，免费、稳定、自然度好，**默认选这个**
   - `volcengine` — 火山引擎，国内速度快、音色丰富，需 API key

2. **voice**（按内容性质匹配）：

| 内容性质 | edge 推荐 voice | 火山推荐 |
|---------|-----------------|---------|
| 知识/教程/中性 | `zh-CN-XiaoxiaoNeural` | `BV001_streaming` |
| 轻松/活泼 | `zh-CN-XiaoyiNeural` | `BV007_streaming` |
| 男声/沉稳 | `zh-CN-YunjianNeural` | `BV002_streaming` |
| 男声/年轻 | `zh-CN-YunxiNeural` | `BV056_streaming` |
| 故事/有情感 | `zh-CN-XiaohanNeural` | `BV023_streaming` |
| 英文 | `en-US-AriaNeural` | — |

3. **speed**：默认 1.0x。语速建议：
   - 教程/严肃 → 0.95-1.0
   - 短视频 / 抓眼球 → 1.05-1.15
   - 故事 → 1.0

### 决策步骤

1. 读 script 的 role 标签（钩子/痛点/方案/...）和实际 narration 内容
2. 判断风格基调：是「上课感」还是「朋友聊」？
3. 选 voice + engine
4. 第一次 audio-synth 时带 flag

### 输出

打印决策结果给 user/下个 agent：

```markdown
## 音频决策

- engine: edge
- voice: zh-CN-XiaoyiNeural
- speed: 1.05
- 理由: 内容是轻松的产品介绍，Xiaoyi 比 Xiaoxiao 更活泼，1.05x 让节奏紧凑
```

然后进 Step 1 触发 audio-synth。
