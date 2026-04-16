# Produce Pipeline — v0.8 Anchors × Tracks

从 TTS / 原声素材到最终 MP4 的生产流程。v0.8 的核心变化只有两个：

- 时间不再手写毫秒，先生成 `anchors`
- 画面不再写 `matches`，只写 4 类 `tracks`

## 顺序

`00 ratio` → `00a tts` → `01 check` → `02 scene` → `03 anchors` → `04 timeline` → `05 validate` → `06 build` → `07 record` → `08 concat`

## 流程图

```
ratio
  ↓
tts（可选）
  ↓
check
  ├─ scene（缺组件时循环）
  ↓
anchors
  ↓
timeline
  ↓
validate
  ↓
build
  ↓
record
  ↓
concat（可选）
```

## 步骤一览

| step | 命令 | 产物 |
| --- | --- | --- |
| `ratio` | `nf-guide produce ratio` | ratio 决策 |
| `tts` | `nf-guide produce tts` | `seg0.mp3`, `seg0.words.json` |
| `check` | `nf-guide produce check` | 可用素材 + scene 清单 |
| `scene` | `nf-guide produce scene` | 缺失 scene |
| `anchors` | `nf-guide produce anchors` | `anchors.json` |
| `timeline` | `nf-guide produce timeline` | `timeline.json` |
| `validate` | `nf-guide produce validate` | contract 通过 |
| `build` | `nf-guide produce build` | `out.html` |
| `record` | `nf-guide produce record` | `demo.mp4` |
| `concat` | `nf-guide produce concat` | `episode.mp4` |

## 记忆法

- `anchors` 解决“什么时候”
- `tracks` 解决“放什么”
- `build` 把两者降成浏览器运行时能吃的绝对毫秒 HTML
- `nextframe-recorder` 只负责按帧调用 HTML 契约录成 MP4

## 查看坑

```bash
nf-guide produce pitfalls
```
