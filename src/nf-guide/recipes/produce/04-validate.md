# Step 4: Validate — 参数门禁

## 跑验证

```bash
nextframe validate timeline.json
```

目标：**0 errors**。warnings 可以有。

## 检查项一览

| 检查 | 错误码 | 原因 | Fix |
|------|--------|------|-----|
| version 必填 | MISSING_FIELD | timeline 没写 version | 加 `"version": "0.3"` |
| ratio 缺失 | MISSING_RATIO (warn) | build 会默认 16:9 | 加 `"ratio": "9:16"` |
| ratio 和尺寸不匹配 | RATIO_MISMATCH | 9:16 但 width > height | 改 ratio 或 width/height |
| duration <= 0 | BAD_DURATION | 时长不对 | 设为视频实际时长 |
| layers 为空 | NO_LAYERS | 没有任何图层 | 加 layers |
| scene 不存在 | UNKNOWN_SCENE | 名字打错或组件没做 | 检查拼写或回 Step 2 |
| scene ratio 不匹配 | RATIO_MISMATCH | 用了其他比例的 scene | 用对应 ratio 的 scene |
| audio 对象没 src | BAD_AUDIO | `{sentences:[]}` 没有 src | 加 `audio.src` 或用字符串 |
| param 类型错 | BAD_PARAM_TYPE | 数字传了字符串 | 改成正确类型 |
| param 超范围 | PARAM_OUT_OF_RANGE (warn) | 数值超出 scene 定义的 range | 调整到范围内 |
| srt 格式错 | BAD_SRT | srt 条目缺 s 或 e | 每条必须有数字 s 和 e |

## 处理错误

每个 error 消息自带描述。按描述修改 timeline.json：

```bash
# 修改后重新跑
nextframe validate timeline.json
# 直到 0 errors
```

## 常见错误场景

### "unknown scene interviewBiSub"
组件不存在。回 Step 2 创建：
```bash
nf-guide produce scene
```

### "BAD_AUDIO: audio object missing .src"
```json
// ❌ 错
"audio": { "sentences": [...] }
// ✅ 对
"audio": { "src": "/path/to/clip.mp4" }
```

### "BAD_PARAM_TYPE: param srt must be array"
```json
// ❌ 错
"params": { "srt": "not-an-array" }
// ✅ 对
"params": { "srt": [{ "s": 0, "e": 3, "t": "文字" }] }
```

## 下一步

0 errors 后：

```bash
nf-guide produce build
```
