# 任务 · v0.22.1 · poster-import 改 cue + 加 chrome tracks

主 agent 持锁 `feature:v0.22.1-cue`。你是路 C · 改 poster_import.rs · 砍掉 word-level subtitle 改 cue-level + 加 progress-bar / cue-bar 两条 chrome tracks。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 必读

```bash
cat crates/nf-cli/src/commands/poster_import.rs
cat examples/v021-explain/components/html.image-slide.js | head -10        # 范本
ls examples/v021-explain/components/                                       # 看路 B 已落地的 cue-bar / progress-bar
cat examples/v2-showcase/compositions/voice-subtitle-smoke.json | head -50 # subtitle 样
```

## harness preflight

```bash
harness tools
harness search "validate"
```

## 改造点(覆盖修改 poster_import.rs)

**当前** · 每 slide 出 3 tracks(img / audio / subtitle word-level)
**目标** · 每 slide 出 2 tracks(img / audio · 砍 subtitle)+ 全局 2 tracks(progress-bar 顶 + cue-bar 底)= 共 16 tracks(7 img + 7 audio + 1 progress + 1 cue)

**cue 数据**:
- 路 A 的 `nf cue` CLI 还在写 · 暂时**不调** · 用 fallback:把 vox `*.timeline.json` 的 `segments[]` 直接当 cue(每 segment 一句 · 字段 text/start_ms/end_ms/words[])
- 写一个内部 fn `extract_cues_fallback(timeline) -> Vec<Cue>`:遍历 segments[] · 每段建一个 Cue · words 从 segment.words 拿(注意 vox segments[].words[] 字段叫 `word` 不是 `text` · 要 map)
- 留 TODO 注释:`// TODO when nf-cue CLI lands · swap fallback for: spawn nf cue --timeline=... and parse stdout cues[]`
- cue 的 start_ms/end_ms 要加上 cumulative_ms 偏移(每 segment 是 slide 内 0-based · 整体 composition 要绝对时间)

**新 chrome tracks**(全 composition 跨度 · time = [slide-1, out]):
1. `progress-bar` · kind=component · component=`html.progress-bar` · z=90 · params={}(组件自取 ctx.timeMs/durationMs)
2. `cue-bar` · kind=component · component=`html.cue-bar` · z=85 · params={cues: [...全 7 段拼接...]}

**总 cues 数据** · 7 段 timeline 的 cue 列表全部按时间偏移合并成一个 cues[] · 喂给 cue-bar(它自己内部按当前 timeMs 找当前 cue)

**保持** · gap_ms 留着(默认 1500ms · audio-N-end anchor 还要)· image-slide tracks 不动 · audio tracks 不动

**输出 stdout 改**:
```json
{"composition_path":"...","slides":7,"tracks":16,"cues":N,"duration_ms":...}
```

## 同时 · 写 BDD scenario

```bash
bdd feature new v022-cue-pipeline --name "AI cue 切分 + 卡拉OK 加亮 + 进度条" --introduced-at v0.22.1
bdd scenario new v022-cue-pipeline/cue-roundtrip --given "tmp/v021-explain 已有 7 段 vox timeline" --when "nf poster-import → composition with cues + chrome → nf export" --then "mp4 含整句 cue 字幕加亮 + 顶部进度条"
bdd scenario add-action v022-cue-pipeline/cue-roundtrip "..."  # 5-7 步
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-poster-import --command "..." --assert "stdout-json:.tracks=16" --assert "stdout-json:.slides=7"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-composition-validate --command "..." --assert "stdout-json:.ok=true"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-shell-startup --command "pkill ... ; (target/debug/nf-shell > /tmp/shell-bdd.log 2>&1 &) && sleep 4 && head -1 /tmp/shell-bdd.log" --assert 'stdout-contains:"event":"ready"'
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-open --command "target/debug/nf open --project=v021-explain --composition=main --episode=main && sleep 3" --assert "stdout-json:.window_id=w-1"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-capture --command "..." --assert "file-min-bytes:spec/versions/v0.22.1/evidence/desktop.png:500000"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-export --command "..." --assert "stdout-json:.audio_muxed=true" --assert "file-min-bytes:spec/versions/v0.22.1/evidence/v022.mp4:5000000"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-frame-extract --command "ffmpeg -y -ss 5 -i .../v022.mp4 -vframes 1 .../frame-5s.png 2>&1 | tail -1" --assert "file-min-bytes:.../frame-5s.png:200000"
bdd scenario add-tool v022-cue-pipeline/cue-roundtrip --tool nf-shell-quit --command "target/debug/nf quit 2>&1 || true" --assert "stdout-contains:quit"
```

具体命令/assert 参考 `spec/bdd/v022-poster-pipeline/scenarios/poster-import-roundtrip.json`(已存在的范本)。

**别忘** · contract module 不必新建(沿用 poster-import 模块)

## 自验

```bash
cargo build -p nf-cli
target/debug/nf poster-import tmp/v021-explain --out=v021-explain --gap-ms=1500
# 预期 stdout: {"tracks":16,"slides":7,"cues":N,...}
target/debug/nf composition validate --project=v021-explain --composition=main
# 预期 ok=true
```

## 禁

- 不调 nf cue(还没 land)· 用 fallback segments
- 不动 nf-shell / nf-recorder / 组件文件
- 不 commit / 不 push

## 报告

- ✅/❌ poster-import 编译过 · 跑通 16 tracks 输出
- ✅/❌ composition validate ok=true
- ✅/❌ BDD scenario v022-cue-pipeline 创建 · 8 ai_tools / 12+ asserts
- 一句话 · 实现 + 踩坑
