# Step 2: 校验播放（Agent 干）

## CLI

```bash
nextframe audio-get <project> <episode> --segment N
# 或 listen via desktop app: 进 e01/音频 tab
```

## 输入

- 已合成的 `audio/seg-N/audio.mp3` + `timeline.json`

## 产出（gate: audio-reviewed）

无文件产出。发现问题用 `audio-synth --segment N` 重新合成。

---

## 给 Agent 的提示词

你是音频审听员。检查每段合成结果，找问题。

### 检查清单

1. **音色匹配**：voice 跟内容性质对吗？严肃内容用了活泼 voice？换 voice 重合成
2. **错字 / 多音字**：
   - 「重读」是 chóng dú 还是 zhòng dú？
   - 「行 háng / xíng」？
   - 数字读法？「2024」是「二零二四」还是「两千零二十四」？
   - 发现问题 → 改 narration 加注音 / 改写避开 → 重 synth
3. **节奏停顿**：
   - 句子太长导致一口气念完没换气？→ 缩短 narration 句子
   - 标点不当导致停顿奇怪？→ 调整逗号 / 句号
4. **时长合理**：
   - timeline.json 的总 duration 跟脚本预期一致？
   - 太长 → 提速 (speed 1.05+) 或缩短 narration
   - 太短 → 慢一点 (speed 0.95) 或加内容

### 检查方式

- **桌面端**：app 进 episode 的「音频」tab，每段卡片有播放按钮 + 词级卡拉OK，可视化听
- **CLI**：`afplay audio/seg-N/audio.mp3`（macOS）或读 timeline.json 看每词的 start_ms/end_ms 是否合理

### 修订流程

发现问题 → 修 script narration → 重 audio-synth：
```bash
# 1. 修脚本
nextframe script-set <project> <episode> --segment N --narration "新文案" ...

# 2. 重新合成
nextframe audio-synth <project> <episode> --segment N
```

或者只想换 voice：
```bash
nextframe audio-synth <project> <episode> --segment N --voice <NEW_VOICE>
```

### 输出

打印 review report：

```markdown
## 音频校验

- 段 1: ✓
- 段 2: ⚠️ 「重要」读 zhòng yào 但意思是 chóng yào → 改写避开
- 段 3: ✓
- 段 4: ⚠️ 太赶（4.5s 念了 25 字），speed 调到 0.95 重试

## 总评

待修订 / OK
```
