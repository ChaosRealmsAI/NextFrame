# Produce Pipeline — 已知坑

每个坑来自真实调试经历。触发时状态机自动提示。

## v0.6 tracks + matches

### `nextframe build` 报 "v0.1 tracks/clips format detected"
- **触发**: tracks[] 存在但没写 matches[]
- **现象**: build 拒绝启动，误认为是 v0.1 老格式
- **修复**: 加 `matches: []`（哪怕空数组）+ 至少一条 rule；或用 `nextframe match from-tts` 一键生成
- **防呆**: detectFormat 已识别 v0.6（有 tracks + matches 就认）

### TTS mp3 文件没扩展名
- **触发**: `nf-tts synth -o narration` 产出文件叫 `narration`（无 `.mp3`）
- **现象**: 后续 `from-tts` 或 build 找不到音频
- **修复**: 合成后手动 `mv narration narration.mp3`
- **防呆**: `nextframe match from-tts` 会自动猜 `<stem>.mp3`，找不到就报错

### 手改了 segment.startMs
- **触发**: 为了对齐某个句子手动改 timeline.json 里的时间戳
- **现象**: `match validate` 报 "timestamps edited manually"
- **修复**: 重跑 TTS 而不是改时间；文本要调整就重新合成

### matches 里 plan 引用的 scene 不存在
- **触发**: AI 写的 plan 选了某个 scene 名在 registry 里没有
- **现象**: `match validate` 拒绝 + 给 `suggest` 列表
- **修复**: 按 suggest 改 scene 名；或者 `nextframe scenes` 看全量

## 字幕

### 字幕对齐错乱
- **触发**: 把 fine.json segments 拍平成 [{s,e,zh,en}] SRT 数组
- **现象**: 英文字幕跟中文子 cue 重复，每个中文短句都显示整段英文，字幕跳动
- **修复**: 直接传 `params.segments = fine.json.segments`，用 `findActiveSub()` 两级查找
- **防呆**: validate 检查 segments 结构

### 字幕不显示
- **触发**: srt 参数传了字符串而不是数组
- **修复**: validate 会报 BAD_PARAM_TYPE
- **防呆**: validate 自动拦截

## 音频

### audio 变 [object Object]
- **触发**: timeline.audio = {sentences: [...]} 没有 .src 字段
- **现象**: 浏览器 runtime 把 audio 对象 toString() → "[object Object]" → 404
- **修复**: audio 必须是字符串或 {src: "path"} 对象
- **防呆**: validate 检查 BAD_AUDIO

### 录制后无声音（-91dB 静音）
- **触发**: timeline.audio.src 是绝对路径（如 /Users/xxx/clip.mp4），recorder 通过 HTTP 服务加载 HTML
- **现象**: ffprobe 显示有 aac 音轨但 mean_volume = -91dB，完全静音
- **原因**: 浏览器把绝对路径 `/Users/xxx/clip.mp4` 解析为 `http://localhost:PORT/Users/xxx/clip.mp4`，resolver 去掉 base_url 后丢失开头的 `/`，拼接 root 后路径不存在，fallback 到 anullsrc 静音
- **修复**: resolve_media_src 现在会尝试还原绝对路径（补 `/` 前缀）；build-runtime 同时设置 window.__audioSrc 保留原始路径
- **防呆**: mux_audio_track 在 fallback 到静音时输出 warn 日志，recorder 日志里搜 "no audio file found" 即可定位

## 布局

### 标题和视频重叠
- **触发**: 标题字号太大或 Y 位置太低，超出 GRID.header 区域侵入 GRID.video 区域
- **修复**: 标题必须在 260px 以内（GRID.header.height），用 TYPE.title.size (60px) 不要更大
- **防呆**: build 自动截图，AI 读图检查

### 颜色用错
- **触发**: 硬编码 #d4b483（旧色值）而不是 TOKENS.interview.gold (#e8c47a)
- **修复**: 所有颜色从 TOKENS 取
- **防呆**: grep 硬编码 hex 值

### 视频全屏覆盖 UI（缺 videoOverlay 坐标）
- **触发**: timeline 的视频 layer 没写 `videoOverlay: {x,y,w,h}` 百分比坐标
- **现象**: 最终视频只有原始访谈画面，标题/字幕/进度条/品牌全被遮住
- **Why**: recorder 先截 HTML 画面，再用 ffmpeg 把真实视频叠上去。没坐标 → 默认全屏叠加
- **修复**: layer 上加 `"videoOverlay": {"x":"7.4074%","y":"14.3750%","w":"85.1852%","h":"28.0208%"}`，坐标从 design.js GRID 算
- **防呆**: 检查 `nextframe scenes <name>` 的 meta.videoOverlay 是否为 true → 是则必须写坐标

## 录制

### recorder 找不到视频层
- **触发**: scene meta 没有 videoOverlay: true
- **现象**: 日志里没有 "detected videoClip layer"，视频区永远黑
- **修复**: 视频 scene 的 meta 必须有 videoOverlay: true
- **防呆**: 检查 recorder 日志

### 视频叠加位置偏移（DPR 未乘）
- **触发**: ffmpeg overlay 用 GRID 坐标（80, 276）但输出是 DPR=2 的画面（2160×3840）
- **现象**: 视频叠加到标题区域（y=276 在 3840 高的画面里只有 7%），不在视频框里
- **原因**: GRID 坐标是 CSS 像素（1080×1920），ffmpeg 操作的是物理像素（2160×3840），需要 ×DPR
- **修复**: build_overlay_filter 现在接受 dpr 参数，坐标自动 ×dpr
- **防呆**: recorder 日志输出 `overlay: ... (dpr=X.XX)` 确认 DPR 被应用

### 中文路径 404
- **触发**: 视频文件路径含中文字符
- **现象**: recorder 的 urlencoding_decode 之前会破坏 UTF-8 多字节字符（已修复）
- **修复**: 已修复。如仍遇到，用绝对路径或 ASCII symlink
- **防呆**: UTF-8 路径单元测试

### recorder 需要 --features cli
- **触发**: `cargo run --bin nextframe-recorder` 不加 `--features cli`
- **现象**: 编译失败或找不到 binary
- **修复**: 用 `cargo run --release --features cli --bin nextframe-recorder -- slide ...`
- **防呆**: 06-record.md 已有正确命令，按状态机走不会错

### WKWebView 渲染不全
- **触发**: 多个 absolute-positioned div 在快速 DOM 更新时丢失
- **现象**: 代码块只显示前几行，流程图只显示第一个节点
- **修复**: 代码块用单个 `<pre>`，流程图用单个 `<svg>`
- **防呆**: scene 开发规范，preview 截图验证

## ratio

### build 用错 ratio 的 scene
- **触发**: timeline 没有 ratio 字段，build-scenes.js 默认 "16:9"
- **现象**: 9:16 timeline 报 "missing scenes for ratio 16:9"
- **修复**: timeline 必须有 ratio 字段
- **防呆**: validate 警告 MISSING_RATIO
