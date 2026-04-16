# Produce Pipeline — v0.8 已知坑

## 1. 还在写 `matches`

- **触发**: 从旧 flow 或旧示例复制了 v0.6 timeline
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

---

## v1.0 本轮新增（sonnet L1 + opus 主 agent 都踩过）

## 14. TTS 产物是 sine wave / 占位音冒充真实语音

- **触发**: sonnet L1 没调 vox / vox 调用失败但没报错，`seg-*.mp3` 全是正弦波占位
- **现象**: 用户听说"不是中文 是嗡嗡声"；所有 mp3 文件大小完全一致（可疑指标）
- **根因**: flow 00a-tts 没要求真实性自检；sonnet 为了交付偷懒造假
- **修复**: 走 `vox synth`/`vox batch` 真的合成；跑 00a-tts §"产物真实性自检"命令
- **防复发**: 看到 8 段 mp3 大小完全相同 / volumedetect mean_volume 完全一致 → 高度怀疑占位音；TTS 产物必须有 `.timeline.json` sidecar

## 15. 自写 Node 脚本算 anchors 手写毫秒

- **触发**: flow `nextframe anchors from-tts` 跑不通 / 格式不对，AI 写 tmp/rebuild-xxx.js 自己算毫秒
- **现象**: anchors 节点形态是 `{"s1":{begin:0,end:5771}}` 而不是 `{at:N}` 或 `{src:"whisper",...}`
- **根因**: AI 绕 flow；违反 ADR-017
- **修复**: 删自写脚本；走 03-anchors §"硬规则" 的 CLI 命令；CLI 不行就 BLOCKED 上报不绕
- **防复发**: `scripts/lint-anchors.sh` 升级检查 anchors 节点形态（待实现）

## 16. vox synth 产物进子目录（-o 不当）

- **触发**: `vox synth -o new-01.mp3`（不 cd 到目标目录）
- **现象**: 产物在 `./new-01/new-01.mp3`（额外套了一层同名子目录）
- **根因**: vox 把 filename 当目录 prefix
- **修复**: 先 `cd tmp/audio && vox synth -o seg-01.mp3`；filename 只写 basename

## 17. vox batch JSON id 必须整数

- **触发**: batch JSON 写 `{"id":"s1", ...}`（字符串）
- **现象**: vox 报 `expected usize`
- **根因**: vox batch id 字段是 usize 整数类型
- **修复**: 改 `{"id":1, "filename":"s1.mp3"}`；id 只用 integer，语义 id 放 filename 上

## 18. build-v08 多 audio track 只用 first 段（静默降级）

- **触发**: timeline audio track 写 8 段 audio clip（分段 s1..s8）
- **现象**: HTML 只挂 `window.__SLIDE_SEGMENTS.audio = firstAudio.src`；后 7 段丢失
- **根因**: build-v08 实现没做多段 audio 合成
- **修复**: 自己 ffmpeg concat 成 full.mp3，audio track 改成一条指向 full.mp3
- **防复发**: build-v08 应该多 audio 报错或实现 filter_complex mux（待实现）

## 19. recorder probe 拿不到 audio → 静默录静音

- **触发**: HTML 里 `window.__audioSrc` 明确有值，recorder 却 log "no audio file found, muxing silent track"
- **现象**: mp4 bit_rate ≈ 2kbps（静音轨），文件没人声
- **根因**: `query_page_audio_src` probe 时机/逻辑 bug；静默失败
- **修复**: 事后 ffmpeg mux `-map 0:v -map 1:a` 把真 audio 塞进 mp4（workaround）
- **防复发**: recorder probe 失败应 error exit 1 不是 warning（待实现）

## 20. timeline.duration 与 anchors / audio 长度不一致

- **触发**: `duration:56059` 但 `s8.end:52905`；或 duration 与 full.mp3 长度差 > 100ms
- **现象**: build 不报错但末尾 3s 死空间 / audio 过长超出 timeline
- **根因**: 没一致性校验
- **修复**: 一致性校验 `duration == max(anchors.{id}.end) + tail_pad`（待实现 lint-timeline-consistency）

## 21. clock 用 audio.currentTime 当时钟 → 短 audio ended 后卡死

- **触发**: timeline 64s 但 audio 只 7s；audio ended 后 currentTime 冻结在 7
- **现象**: 画面停在第 7 秒
- **根因**: build-runtime tick() 唯一时间源是 audioEl.currentTime
- **修复**: 已修 (commit e6dfc87) — audio ended 事件切 wallclock fallback
- **防复发**: 对 audio 长度 < timeline duration 的情况加 build warning

## 22. ffmpeg -shortest 截短视频

- **触发**: recorder mux audio+video 带了 `-shortest` flag
- **现象**: 64s 视频被 7s audio 截成 54.47s mp4
- **根因**: 错误 flag
- **修复**: 已修 (commit e6dfc87) — `-shortest` 删除
