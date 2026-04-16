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

## 9. scene 参数名猜错 → 黑帧

- **触发**: 不查 `nextframe scenes <id>` 就写 params（比如 headlineCenter 用 `title` 而不是 `text`）
- **现象**: scene 渲染为空（黑色），但 build 不报错
- **修复**: **每个 scene 写 params 前必须 `nextframe scenes <id>` 查参数名**

## 10. DOM 型 scene 在 recorder 里黑帧

- **触发**: 用了 anthropic-warm 主题的 DOM scene（statBig / goldenClose / glossaryCard / analogyCard / slotGrid）
- **现象**: build 成功，但录制出来该场景区间全黑
- **原因**: v0.3 runtime 的 canvas 渲染循环不触发 DOM scene 的 render
- **修复**: 用 canvas 型 scene 替代（headlineCenter / codeTerminal / darkGradient / voidField）

## 11. 没加 effects → 画面硬切不专业

- **触发**: scene clip 不写 `effects.enter`
- **现象**: 场景切换时无过渡，直接跳变
- **修复**: 每个 scene clip 至少加 `"effects": { "enter": { "type": "fadeIn", "dur": 0.5 } }`

## 12. scene type 只能 dom|media（ADR-021）

- **触发**: scene 文件写了 `type: "canvas"` / `"svg"` / `"motion"` / `"shader"` / `"particle"`
- **现象**: build-v08 报 `UNSUPPORTED_SCENE_TYPE`，整条 build 终止
- **修复**: 改 `type: "dom"`（或 `"media"` 如果挂外部资源）。**render body 不用动** — canvas/svg 都继续在 dom 的 return HTML 里写。
- **防复发**: build-v08 validateSceneIds + scene-lint L7 + scene-new CLI --type 枚举，三处白名单门禁。

## 13. v0.8 timeline 缺 `version: "0.8"` → 走 legacy → anchors 不解析

- **触发**: timeline 顶层漏写 `"version": "0.8"`，或写成数字 `0.8`（不是字符串）
- **现象**: build 不报错，但 grep `__SLIDE_SEGMENTS` 或 `layers` 为空；recorder 录出来全黑 / 长度对不上
- **根因**: `render` CLI 走 `detectFormat` 路由（ADR-022）— 缺 `"version": "0.8"` 会 fallback 到 v0.3 legacy path，anchors 字段被忽略
- **修复**: timeline 顶层 `"version": "0.8"`（字符串，带引号），并删除所有 v0.3 `layers` / v0.6 `matches` 字段
- **验证**: `grep -c "__SLIDE_SEGMENTS\|layers" out.html` ≥ 1 说明 v0.8 路径跑通
- **防复发**: Step 05 validate 必跑，检查 `UNSUPPORTED_VERSION` 错误码
