# Produce Pipeline — 已知坑

每个坑来自真实调试经历。触发时状态机自动提示。

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

## 布局

### 标题和视频重叠
- **触发**: 标题字号太大或 Y 位置太低，超出 GRID.header 区域侵入 GRID.video 区域
- **修复**: 标题必须在 260px 以内（GRID.header.height），用 TYPE.title.size (60px) 不要更大
- **防呆**: build 自动截图，AI 读图检查

### 颜色用错
- **触发**: 硬编码 #d4b483（旧色值）而不是 TOKENS.interview.gold (#e8c47a)
- **修复**: 所有颜色从 TOKENS 取
- **防呆**: grep 硬编码 hex 值

## 录制

### recorder 找不到视频层
- **触发**: scene meta 没有 videoOverlay: true
- **现象**: 日志里没有 "detected videoClip layer"，视频区永远黑
- **修复**: 视频 scene 的 meta 必须有 videoOverlay: true
- **防呆**: 检查 recorder 日志

### 中文路径 404
- **触发**: 视频文件路径含中文字符
- **现象**: recorder 的 urlencoding_decode 之前会破坏 UTF-8 多字节字符（已修复）
- **修复**: 已修复。如仍遇到，用绝对路径或 ASCII symlink
- **防呆**: UTF-8 路径单元测试

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
