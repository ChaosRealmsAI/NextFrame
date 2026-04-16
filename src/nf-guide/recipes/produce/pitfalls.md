# Produce Pipeline — v0.8 已知坑

## 1. 还在写 `matches`

- **触发**: 从旧 recipe 或旧示例复制了 v0.6 timeline
- **现象**: `nextframe validate` 直接报 `UNSUPPORTED_VERSION`
- **修复**: 顶层只保留 `version`, `anchors`, `tracks`

## 2. 手写毫秒，不走 anchors

- **触发**: 直接在 clip 上写裸 `0`, `1200`, `5000`
- **现象**: timeline 难维护，validate / build 也无法复用 filler 结果
- **修复**: 统一从 `nextframe anchors from-tts` 产出的名字引用

## 3. animation target 路径写错

- **触发**: 写成旧 layer 路径，或少了 `.clips[N].params.`
- **现象**: build 通过但动画不生效，scene 参数不变
- **修复**: 只用 `sceneTrackId.clips[N].params.fieldName`

## 4. subtitle 文本放错地方

- **触发**: 只写 `params.text`
- **现象**: kind contract 不通过，或 runtime 取不到文字
- **修复**: `subtitle` clip 主字段写 `text`

## 5. scene 运行时混进 TS / import

- **触发**: `runtime-v08/*.js` 写了 `import`、`export` 或类型标注
- **现象**: builder 内联后浏览器直接炸
- **修复**: runtime-v08 只能写原生 JS IIFE

## 6. build 后还在讨论 anchors

- **触发**: 以为浏览器 runtime 会自己解析 `seg0.begin`
- **现象**: recorder / preview 时间不同步
- **修复**: 记住 invariant: runtime 只看 build 后的绝对毫秒

## 7. recorder 没有 release binary

- **触发**: 直接跑 `nextframe-recorder slide ...` 但 binary 不存在
- **现象**: 命令找不到或启动失败
- **修复**: 记录阻塞为 `needs cargo build --release -p nf-recorder`

## 8. ffprobe 宽高比预期大一倍

- **触发**: 用 `--width 1920 --height 1080` 录制后，ffprobe 看到 `3840x2160`
- **现象**: 误以为 recorder 没按命令执行
- **修复**: 先确认 ratio 正确；Recorder 会按页面 DPR 编码，Retina / DPR=2 下输出常见是 `viewport × 2`
