# tests/fixtures/ — BDD/subagent 盲测输入

v0.3.0 建 · 给 haiku subagent 盲测用. `.gitignore` 忽略 `*.mp4` / `*.mp3` · 部分 fixtures 不入 git · 跑命令自己生成.

## clips/

- **demo.mp4**(1.2MB · 不入 git):
  ```bash
  ffmpeg -hide_banner -y \
    -f lavfi -i "testsrc2=duration=10:size=640x480:rate=24" \
    -f lavfi -i "sine=frequency=440:duration=10" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k \
    tests/fixtures/clips/demo.mp4
  ```
  10s 彩条测试图 + 440Hz sine 音轨 · yt-dlp 兜底源.

- **demo.srt**(入 git): 4 句手写字幕 · whisperx 兜底用.

## tts/

- **demo.txt**(入 git): 中文 4 句短文本 · TTS 合成输入.
- **demo.timeline.json**(入 git): 手写 WhisperX 风格字级时间戳 · align 步兜底用.

## 为啥 fixtures 不都进 git

- mp4 大(1.2MB) · git 历史臃肿 · 反正 ffmpeg 一条命令秒生成
- 字幕/文本/timeline 小(KB 级) · 入 git 方便
- CI 需要 fixtures 时跑 `make fixtures` 生成(后续版本加)
