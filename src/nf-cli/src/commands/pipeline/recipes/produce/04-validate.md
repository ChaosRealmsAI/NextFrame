# Step 4: Validate — 参数门禁

## CLI

```bash
nextframe validate timeline.json
```

## 检查项

| 检查 | 错误码 | 说明 |
|------|--------|------|
| version/width/height/fps/duration | MISSING_FIELD | 必填字段 |
| duration > 0 | BAD_DURATION | 时长不能为 0 |
| layers.length > 0 | NO_LAYERS | 至少一个 layer |
| ratio 匹配 width×height | RATIO_MISMATCH | 9:16 但 width > height |
| audio 对象有 .src | BAD_AUDIO | audio 是对象但没 src |
| scene 存在 | UNKNOWN_SCENE | scene 名字打错了 |
| scene ratio 匹配 | RATIO_MISMATCH | 用了其他比例的 scene |
| params 类型匹配 schema | BAD_PARAM_TYPE | 数字传了字符串 |
| params 范围检查 | PARAM_OUT_OF_RANGE | 数值超出 range |
| segments[] 格式 | BAD_SRT | srt 条目缺 s/e |

## 处理错误

每个 error 有 Fix 提示。按提示修改 timeline.json，重新 validate。

```bash
# 修改后重新验证
nextframe validate timeline.json
# 0 errors → 进 Step 5
```

## 门禁

- 0 errors（warnings 可以有）
- 有 error → 不能进 build
