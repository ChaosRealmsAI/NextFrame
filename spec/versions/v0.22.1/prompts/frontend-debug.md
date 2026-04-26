# 任务 · v0.22.1 · 调研 frontend 为什么 v3 不渲染我们的 composition

主 agent 持锁 `feature:v0.22.1-cue`。你是路 E · 出**诊断报告**(不写代码)· 找出为什么 `examples/v021-explain/compositions/main.json` 在 nf-shell preview 里黑屏 · 但 `examples/v2-showcase/compositions/showreel-clip-first.json` 渲染对。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 现状

**已知**:
- v021-explain composition 是 v3 clip-first(`schema=nextframe.composition.v3` · 1 clip 包 16 tracks)· 桌面端打开显示 idle hero · DOM 里 `[data-nf-preview-layers]` div 是空的(没 component 元素)
- showreel-clip-first(主 codex 范本)是 v3 clip-first(3 clips)· 渲染对
- nf-cli `nf composition show` 返回的 source.tracks=9(audio 7 个被 compile 滤掉)· source.components 含 3 个组件(image-slide / cue-bar / progress-bar)
- IPC `compositions.show` 返回 v3 raw composition · 跟 showreel-clip-first 同结构
- mp4 export 渲染**对** image(从 frame-5s 看) · 说明 nf-recorder 用 source.tracks 走 flat 路径渲染对
- 但 frontend preview 不渲染

## 必读

```bash
cat frontend/nf-components/src/index.ts | head -100
grep -n "applyComposition\|compositionSource = " frontend/nf-components/src/index.ts
sed -n '420,470p' frontend/nf-components/src/index.ts
sed -n '660,720p' frontend/nf-components/src/index.ts        # renderCompositionPreview
cat frontend/nf-components/src/storage.ts | head -80           # loadCompositionData
grep -B2 -A30 "function normalizeCompositionData" frontend/nf-components/src/storage.ts
grep -B2 -A30 "function normalizeCompositionClips" frontend/nf-components/src/storage.ts
diff -y <(jq -S 'del(.clips[].tracks)' examples/v2-showcase/compositions/showreel-clip-first.json | head -30) <(jq -S 'del(.clips[].tracks)' examples/v021-explain/compositions/main.json | head -30) | head -30
```

## 调查步骤(按顺序做完 · 报告每步发现)

1. **对照两份 composition.json**(顶层 + clip[0] · 不展开 tracks)· 找差异
   - showreel-clip-first 有的字段 · v021-explain 没的?
   - 字段类型 / 单位 / 命名差异?
2. **跟踪 frontend `loadCompositionData` 流程** 分析两份数据走到哪步会失败
   - `IPC compositions.show` 返回啥?
   - `normalizeCompositionData(project, slug, source, composition)` 在两份上分别返啥?
   - `normalizeCompositionClips(composition)` · 用 v021-explain 输入 · 返 clips 数量是几?
3. **对照 source.json 编译产物**(IPC 返回的 source 字段)
   - `nf composition show --project=v2-showcase --composition=showreel-clip-first` 看它的 source.tracks 是几条 · 跟 v021-explain 9 条对比
   - source.components 字段:两份都有 image-slide?
4. **`applyComposition(source, data)` 的调用链**
   - 哪些 condition 必须满足 source 才被 set 到 compositionSource 全局?
   - 是否需要 `data.clipRows` 非空?
   - 是否需要 `data.episodes[0]` 存在?
5. **renderCompositionPreview 必要前置**
   - `compositionSource != null` ✓
   - 还有别的 guard?
6. **路 D 的 nf devtools --eval** 如果在你跑前 land 了 · 用它直接查 webview 状态(`window.compositionSource`/`document.querySelectorAll`)· 否则用 grep 推理

## 输出

写一份 `spec/versions/v0.22.1/diagnostics/frontend-v3-render-investigation.md` · 含:

- **根因**(1 段) · v021-explain 走到哪步死掉
- **修法 1-3 句话** · poster-import 应该改 / frontend 应该改 / 哪个最稳
- **对照表**(showreel-clip-first vs v021-explain · 关键字段差异)
- **复现 + 诊断命令清单**(主 agent 跑就能复现)

不要写代码 · 不要 commit · 只出报告。

## 禁

- 不改任何代码
- 不 commit / 不 push
- 不动 examples / spec 之外(diagnostics 文件除外)

## 报告

- ✅/❌ diagnostics md 落地 · 路径
- ✅/❌ 找到根因(1 句话)
- ✅/❌ 给主 agent 的修法建议(2-3 选项)
