# Step 09 · 质量门禁（硬指标 + LLM 判帧）

v1.0 的终局检查。**任何一项失败 = BLOCKED，视频不发布，回去改**。

## 1 · 硬指标门禁（ffprobe，必过）

### 1.1 时长 ≥ 60s

```bash
ffprobe -v quiet -show_entries format=duration \
  -of default=nw=1:nk=1 \
  output/v1.0/landscape-1920x1080-1min.mp4
# 输出必须 ≥ 60.0
```

### 1.2 视频 + 音频流

```bash
ffprobe -v quiet -show_streams \
  -of json output/v1.0/landscape-1920x1080-1min.mp4 \
  | node -e "const s=JSON.parse(require('fs').readFileSync(0)).streams;
const v=s.filter(x=>x.codec_type==='video');
const a=s.filter(x=>x.codec_type==='audio');
console.log({video:v.length,audio:a.length,vcodec:v[0]?.codec_name,acodec:a[0]?.codec_name});"

# 必须：video 1+ (h264) + audio 1+ (aac)
```

### 1.3 视频码率 ≥ 2000 kbps

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=bit_rate \
  -of default=nw=1:nk=1 \
  output/v1.0/landscape-1920x1080-1min.mp4
# 输出必须 ≥ 2000000（bps）
```

### 1.4 分辨率精确（按 DPR 换算后）

横屏：`1920×1080` 或 `3840×2160`（Retina DPR=2）
竖屏：`1080×1920` 或 `2160×3840`（Retina DPR=2）

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height \
  -of json output/v1.0/landscape-1920x1080-1min.mp4
```

### 硬指标一键脚本

```bash
# 见 scripts/verify-v10-mp4.sh（硬指标整合）
bash scripts/verify-v10-mp4.sh \
  output/v1.0/landscape-1920x1080-1min.mp4 16:9
```

**任何硬指标 FAIL → BLOCKED**，必须修：
- 时长不够 → 回 Step 04 补 scene clips 或延长 TTS
- 无音频流 → mux 没跑，回 Step 07 检查 `__audioMeta` 是否展开
- 码率太低 → recorder `--parallel` 过高影响编码，降到 4 再试
- 分辨率错 → recorder 命令 `--width` / `--height` 和 ratio 对不上

## 2 · LLM 判帧门禁（抽 10 帧喂 opus）

### 2.1 抽帧

```bash
mkdir -p tmp/verify-frames
ffmpeg -i output/v1.0/landscape-1920x1080-1min.mp4 \
  -vf "fps=1/6" -frames:v 10 \
  tmp/verify-frames/frame-%02d.png
```

10 帧均匀分布（每 6s 一张）。

### 2.2 喂 opus 打分（4 项 × 5 分）

对每帧打 4 项分（1-5）：

1. **字号可读性** — 主信息字号够大，1080p 下 ≥ 28px
2. **留白合理** — 内容 ≤ 40% 画面，不拥挤
3. **动画自然度** — 配合 scrub 检查连续性（opus 可看 10 帧流变）
4. **叙事画面对应** — 画面与 script 台词匹配

### 2.3 评分门禁（autopilot 自动跑）

硬规则：
- **总均分 ≥ 4.0/5.0**（40 项平均）
- **单项均分 ≥ 3.5/5.0**（没有一项严重短板）

**任何一项不达标 → BLOCKED**。

产 `projects/v10-landscape/verify-report.md`：

```markdown
# Verify Report — v1.0 landscape

## Hard metrics
- duration: 67.2s ✓ (≥ 60s)
- video stream: 1 h264 ✓
- audio stream: 1 aac ✓
- bitrate: 4800 kbps ✓ (≥ 2000)
- resolution: 3840×2160 ✓ (DPR=2 of 1920×1080)

## LLM judge (opus, 10 frames)
- 字号可读性: 4.3/5.0 ✓
- 留白合理:   4.1/5.0 ✓
- 动画自然度: 3.9/5.0 ✓
- 叙事对应:   4.4/5.0 ✓
- 总均分:     4.18/5.0 ✓ (≥ 4.0)
- 单项最低:   3.9   ✓ (≥ 3.5)

## Verdict: PASS
```

## 3 · L3 收敛判定

v1.0 真正收敛需要：

- **连续 2 次独立 sonnet run**（新会话，无记忆）都通过全部门禁
- 两次 run 之间 `git diff` 零改动（flow + 代码都稳定）
- 两次 run 的硬指标差异 < 5%（稳定非偶然通过）

达成 → v1.0 done，飞书推送。

## 4 · 失败 → 回哪一步

| 症状 | 回 |
|------|-----|
| 时长不够 | Step 00a / Step 04 |
| 画面黑 | Step 02（scene type 白名单）+ Step 06（build 检查）|
| 无音频 | Step 07（检查 mux）|
| 字号糊 | Step 02（theme.md 字号阶梯）|
| 动画不对 | component/02-craft（t-driven）|
| LLM 打分低 | component/01-aesthetics + design/02-write |

## 5 · 完成

全绿 → 发布 → autopilot 飞书通知 done。
