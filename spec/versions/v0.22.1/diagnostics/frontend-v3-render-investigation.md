# Frontend v3 Render Investigation

## 根因

在这棵 worktree 的可复现现场里，黑屏发生在 composition 数据链路之前：`frontend/nf-components/index.html` 引用 `dist/index.js`，但 `frontend/nf-components/dist/index.js` 不存在，`npm run build` 又因 `esbuild: command not found` 失败；打开 nf-shell 后 `nf-topbar` 没有 shadowRoot，`nf-timeline` / `nf-inspector` 没有被数据驱动写入属性，`[data-nf-preview-layers]` 对 v021-explain 和 showreel-clip-first 都为空。这说明当前窗口没有执行 `src/index.ts`，因此 `loadCompositionData -> applyComposition -> renderCompositionPreview` 没有跑到。静态检查 composition/source 本身时，v021-explain 能编译出有效 `nf.render_source.v1`，t=0 有 3 条 active component 轨可渲染，不像是 poster-import JSON 在 normalize 阶段把数据吃空。

如果主 agent 的环境确实已经有可执行前端 bundle 且 showreel-clip-first 渲染正常，那么本报告的现场复现与主 agent 环境不同；下一步应优先用已落地的 `nf devtools --eval` 读取窗口内 `customElements.get("nf-topbar")`、`window.NEXTFRAME_SESSION`、active component 数量和 console error，而不是继续改 poster-import。

## 修法建议

最稳的是前端/ shell 侧先把 bundle 缺失或 stale 变成显式错误：`nf-shell` 启动前检查 `frontend/nf-components/dist/index.js`，缺失时返回可读错误或纳入 build 流程，避免打开一个没有 JS 的 idle shell。v021-explain 的 poster-import 输出目前不需要为了 preview 做结构调整：component ids、clip duration、anchors、compiled tracks 和 component registry 都能对上。若主 agent 在有 bundle 的环境仍复现 v021-only 空层，再改 frontend preview 增加 devtools-visible diagnostics，例如暴露 active track count / component load errors / source track count。

## 对照表

| 项 | showreel-clip-first | v021-explain |
| --- | --- | --- |
| raw schema | `nextframe.composition.v3` | `nextframe.composition.v3` |
| top-level keys | `clips`, `export`, `id`, `name`, `schema`, `theme`, `viewport` | 同左 |
| theme | `launch.dark` | `default` |
| clips | 3 | 1 |
| clip[0].id / name | `intro` / `Intro` | `main` / `v021 explain` |
| clip[0].duration | `5.2s` | `116486ms` |
| clip[0].anchors | `title-in`, `voice-out` | `slide-1..7`, `audio-1-end..7-end`, `out` |
| clip[0].tracks | component + tts + subtitle tracks | 7 image component + 7 audio + progress-bar + cue-bar |
| compiled source schema | `nf.render_source.v1` | `nf.render_source.v1` |
| compiled duration | `16400` ms | `116486` ms |
| compiled tracks in this worktree | 11 | 16 |
| compiled components | `canvas.particle-field`, `html.layer-stack`, `html.sequence-title`, `html.stage-background` | `html.cue-bar`, `html.image-slide`, `html.progress-bar` |
| active visual components at t=0 from compiled source | `intro.stage` active; `intro.title` starts at 400ms | `main.img-1`, `main.progress-bar`, `main.cue-bar` active |
| `normalizeCompositionClips` expected result | 3 clips, then 4 UI rows including `__composition_all__` | 1 clip, then 2 UI rows including `__composition_all__` |

## 前端链路结论

`loadCompositionData(project, composition)` 成功时会请求 `projects.show` 和 `compositions.show`，然后调用 `normalizeCompositionData(project, compositionSlug, loaded.source, loaded.composition)`。v021-explain 的 raw composition 有非空 `clips[]`，`parseTimeSeconds("116486ms")` 可解析为 `116.486` 秒，所以 `normalizeCompositionClips` 不会返回 0；它应返回 1 个 composition clip，`normalizeCompositionData` 应生成 2 个 UI row：`__composition_all__` 和 `main`。

`applyComposition(source, data)` 的 guard 很少：直接设置模块级 `compositionSource = source`，编译 `source.components`，安装 theme，然后 `applyData(data)`。它不要求 `data.clipRows`，也没有 `data.episodes[0]` 之外的额外 source guard。`renderCompositionPreview` 的关键前置是 `compositionSource != null`、`[data-nf-preview-layers]` 存在、`source.tracks` 中有当前时间命中的 `kind === "component"` clip，且 `clip.params.component` 能在 `source.components` 中找到。v021-explain 的 compiled source 满足这些条件。

本机 live probe 不能证明 v021-only 的前端渲染差异，因为 bundle 缺失导致两份 composition 都没有跑到上述链路。这个现象本身是一个有效根因：当前 shell 可以打开静态 HTML，但没有前端运行时代码。

## 复现和诊断命令

```bash
harness tools
harness search "composition"
harness show nf-composition
harness search "devtools"
harness show nf-devtools
harness show nf-window
```

```bash
cat frontend/nf-components/src/index.ts | head -100
rg -n "applyComposition|compositionSource = " frontend/nf-components/src/index.ts
sed -n '420,470p' frontend/nf-components/src/index.ts
sed -n '660,740p' frontend/nf-components/src/index.ts
cat frontend/nf-components/src/storage.ts | head -80
sed -n '420,520p' frontend/nf-components/src/storage.ts
sed -n '678,860p' frontend/nf-components/src/storage.ts
```

```bash
jq '{schema,name,viewport,theme,clips_len:(.clips|length),clip0:(.clips[0] | del(.tracks))}' examples/v2-showcase/compositions/showreel-clip-first.json
jq '{schema,name,viewport,theme,clips_len:(.clips|length),clip0:(.clips[0] | del(.tracks))}' examples/v021-explain/compositions/main.json
diff -y <(jq -S 'del(.clips[].tracks)' examples/v2-showcase/compositions/showreel-clip-first.json | head -30) <(jq -S 'del(.clips[].tracks)' examples/v021-explain/compositions/main.json | head -30) | head -30
```

```bash
mkdir -p tmp/diag-v3-render
target/debug/nf composition compile --project=v2-showcase --composition=showreel-clip-first --out=tmp/diag-v3-render/showreel-source.json
target/debug/nf composition compile --project=v021-explain --composition=main --out=tmp/diag-v3-render/v021-source.json
jq '{schema_version,duration,duration_ms,tracks:(.tracks|length),components:(.components|keys)}' tmp/diag-v3-render/showreel-source.json
jq '{schema_version,duration,duration_ms,tracks:(.tracks|length),components:(.components|keys)}' tmp/diag-v3-render/v021-source.json
jq '[.tracks[] | select(.kind=="component") | {id,z,comp:.clips[0].params.component,begin:.clips[0].begin,end:.clips[0].end}]' tmp/diag-v3-render/v021-source.json
```

```bash
target/debug/nf composition validate --project=v2-showcase --composition=showreel-clip-first
target/debug/nf composition validate --project=v021-explain --composition=main
```

```bash
ls -l frontend/nf-components/dist/index.js
npm run build
target/debug/nf-shell
target/debug/nf open --project=v021-explain --composition=main
target/debug/nf devtools --project=v021-explain --episode=main --query='nf-topbar' --get=shadowRoot
target/debug/nf devtools --project=v021-explain --episode=main --query='[data-nf-preview-layers]' --get=outerHTML
```

Observed in this worktree:

```text
ls: frontend/nf-components/dist/index.js: No such file or directory
sh: esbuild: command not found
nf-topbar shadowRoot = null
[data-nf-preview-layers] = <div class="preview-layers" data-nf-preview-layers=""></div>
```

## 路 D eval 后建议追加

```bash
target/debug/nf devtools --project=v021-explain --episode=main --eval='customElements.get("nf-topbar") != null'
target/debug/nf devtools --project=v021-explain --episode=main --eval='window.NEXTFRAME_SESSION'
target/debug/nf devtools --project=v021-explain --episode=main --eval='document.querySelectorAll("[data-nf-component-root]").length'
target/debug/nf devtools --project=v021-explain --episode=main --eval='document.querySelector("[data-nf-preview-layers]")?.outerHTML'
```
