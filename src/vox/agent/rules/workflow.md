## 单条合成

```bash
# 自动检测语言选声音（中文自动用 YunxiNeural）
vox synth "你好世界" -d ./audio/

# 指定声音
vox synth "Hello world" -v en-US-EmmaMultilingualNeural -d ./audio/

# 用别名
vox synth "你好" -v narrator -d ./audio/

# 从文件读取长文本
vox synth --file script.txt -d ./audio/

# 从 stdin 读取
echo "管道输入" | vox synth -d ./audio/

# 调参数
vox synth "快一点" --rate "+30%" --pitch "+2Hz" -d ./audio/

# 指定输出文件名
vox synth "命名" -o greeting.mp3 -d ./audio/

# 生成 SRT 字幕（与音频同名 .srt 文件）
vox synth "This is a subtitle test" --srt -d ./audio/
```

输出: `{"id":0,"status":"done","file":"./audio/a3f8c2.mp3","duration_ms":1200,"cached":false}`

## 批量合成

```bash
cat <<'EOF' | vox batch -d ./audio/
[
  {"text": "第一句"},
  {"text": "第二句", "voice": "zh-CN-XiaoxiaoNeural"},
  {"text": "Third sentence", "voice": "en-US-EmmaMultilingualNeural"}
]
EOF
```

每完成一条输出一行 NDJSON，最后输出 manifest 汇总。
每个 job 可选字段：text（必填）、voice、rate、volume、pitch、filename。

## 直接播放

```bash
# 自动检测语言
vox play "你好世界"

# 指定声音
vox play "Hello" -v en-US-EmmaMultilingualNeural
```

## 语音预览

```bash
# 用标准文本试听某个声音
vox preview -v zh-CN-XiaoxiaoNeural

# 自定义预览文本
vox preview -v zh-CN-YunxiNeural -t "自定义试听文本"
```

## 查声音

```bash
vox voices --lang zh    # 中文
vox voices --lang en    # 英文
vox voices --lang ja    # 日文
```

## 音频拼接

```bash
vox concat 001.mp3 002.mp3 003.mp3 -o combined.mp3
```

## 配置管理

```bash
# 设置默认声音
vox config set voice zh-CN-YunxiNeural

# 设置默认输出目录
vox config set dir ./audio

# 创建声音别名
vox config set alias.narrator zh-CN-YunxiNeural
vox config set alias.xiaoxiao zh-CN-XiaoxiaoNeural

# 查看所有配置
vox config get
```

## 缓存

相同 text + voice + rate + pitch + volume 不会重复合成。
输出中 `"cached":true` 表示命中缓存。

## 试运行

```bash
vox batch jobs.json --dry-run
```

## 自动语言检测

不指定 `--voice` 时，vox 自动检测文本语言：
- 中文 → zh-CN-YunxiNeural
- 日文 → ja-JP-NanamiNeural
- 韩文 → ko-KR-SunHiNeural
- 英文/其他 → en-US-EmmaMultilingualNeural
