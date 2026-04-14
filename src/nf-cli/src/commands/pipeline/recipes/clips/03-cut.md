# Step 3: 切真实视频片段

## CLI

```bash
nf-cli source-cut <project> <episode> --source <slug> --plan-path plan.json --margin 0.2
```

## 输入

- `<slug>/source.mp4`
- `<slug>/sentences.json`
- `<episode>/plan.json`

## 产出（gate: clips-cut）

```
<episode>/clips/
├── clip_01.mp4      # 按 plan.json[0].from-to 切
├── clip_02.mp4
├── clip_03.mp4
└── cut_report.json  # {success: [{clip_num, title, from_id, to_id, start, end, duration, file, text_preview}], failed: []}
```

## 谁做

Code（ffmpeg，按句号对应时间切）。

## margin

`--margin 0.2` 给首尾各加 0.2s 空隙，避免卡断词。
