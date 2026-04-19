# Step 3: 切真实视频片段（Code · bare ffmpeg）

## 谁做

Code（ffmpeg + jq）· 你（Agent）直接跑 bare 命令 · 没有 nf-cli wrapper。

## 输入

- `<slug>/source.mp4` · 源视频
- `<slug>/sentences.json` · 句级时间戳（`{sentences: [{id, start, end, text}]}`）
- `<episode>/plan.json` · Agent 挑的 highlight（`from` / `to` 是 sentence id）

## 关键：plan.from/to 是 id · 不是秒！

必须查 `sentences.json` 把 id 换成秒：
- `start_sec = sentences[from-1].start - margin`
- `end_sec = sentences[to-1].end + margin`
- `margin = 0.2s`（避免卡断词）

## CLI（bare · agent 一把跑）

```bash
EP=tmp/<run>/projects/<project>/<episode>
SLUG=<slug>
MARGIN=0.2

mkdir -p $EP/clips

# 一次跑完 · 每个 clip 切一刀 + 合成 cut_report.json
SUCCESS='[]'
COUNT=$(jq '.clips | length' $EP/plan.json)

for i in $(seq 0 $((COUNT - 1))); do
  N=$(printf "%02d" $((i + 1)))
  FROM=$(jq ".clips[$i].from" $EP/plan.json)
  TO=$(jq ".clips[$i].to" $EP/plan.json)
  TITLE=$(jq -r ".clips[$i].title" $EP/plan.json)

  # id → 秒（sentences 是 1-indexed · array 是 0-indexed）
  START=$(jq --argjson id $FROM --argjson m $MARGIN \
    '[.sentences[] | select(.id == $id)][0].start - $m | if . < 0 then 0 else . end' \
    $EP/sources/$SLUG/sentences.json)
  END=$(jq --argjson id $TO --argjson m $MARGIN \
    '[.sentences[] | select(.id == $id)][0].end + $m' \
    $EP/sources/$SLUG/sentences.json)
  DUR=$(echo "$END - $START" | bc -l)

  # 文本预览（前 3 句拼起来）
  PREVIEW=$(jq -r --argjson f $FROM --argjson t $TO \
    '[.sentences[] | select(.id >= $f and .id <= $t)][0:3] | map(.text) | join(" ")' \
    $EP/sources/$SLUG/sentences.json)

  # ffmpeg 切 · re-encode 保证帧对齐（不用 -c copy · 会卡关键帧）
  ffmpeg -y -ss $START -to $END -i $EP/sources/$SLUG/source.mp4 \
    -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k \
    $EP/clips/clip_$N.mp4 2>&1 | tail -2

  # 记 success
  SUCCESS=$(echo $SUCCESS | jq \
    --argjson num $((i + 1)) --arg title "$TITLE" \
    --argjson from $FROM --argjson to $TO \
    --argjson start $START --argjson end $END --argjson dur $DUR \
    --arg file "clip_$N.mp4" --arg prev "$PREVIEW" \
    '. += [{clip_num: $num, title: $title, from_id: $from, to_id: $to,
            start: $start, end: $end, duration: $dur, file: $file, text_preview: $prev}]')
done

# 写 cut_report.json
echo "{\"success\": $SUCCESS, \"failed\": []}" | jq '.' > $EP/clips/cut_report.json
```

## 产出（gate: clips-cut）

```
<episode>/clips/
├── clip_01.mp4         # 按 plan.json[0].from/to 切
├── clip_02.mp4
├── clip_NN.mp4
└── cut_report.json     # {success: [{clip_num, title, from_id, to_id, start, end, duration, file, text_preview}], failed: []}
```

`start` / `end` 是**真实秒**（查 sentences.json 算出来的）· karaoke 步必读这个。

## 验证

```bash
# 每个 clip 必能 probe · 时长 > 0
for f in $EP/clips/clip_*.mp4; do
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  echo "$f: ${DUR}s"
done

# cut_report.json schema 齐 · 有 success 数组 · 每条含 clip_num/start/end
jq '.success[0] | {clip_num, start, end, duration, file}' $EP/clips/cut_report.json
```

## 常错

- ❌ 用 `-c copy`（关键帧对齐 · 开头/结尾会卡）
- ❌ margin 太小（0.05）· 开头/结尾卡断词
- ❌ 查 id 时没减 1（`sentences[from]` 错 · 应 `sentences[from-1]` 或用 jq `select(.id == $from)`）
- ❌ 忘 `start < 0` 的边界（第 1 clip 减 margin 后负数 · 要 clamp 0）
