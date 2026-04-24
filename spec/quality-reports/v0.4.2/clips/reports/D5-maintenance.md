# D5 · clips pipeline 维护性审查

**版本**: `v0.4.2`
**范围**: `crates/nf-source` + `crates/videocut-*` + clips 相关 guide/spec
**结论**: B- · `videocut-*` crate 的函数级文档和 unsafe 注释状态好；主要维护风险来自 `nf-source` CLI、`nf-guide`、BDD/version spec 三套接口描述互相漂移，新人按文档跑链路会走错入口。

## 指标

| 指标 | 结果 | 口径 |
|---|---:|---|
| `pub fn` 文档覆盖率估算 | `37 / 42 = 88.1%` | 扫描 `^pub fn` / `^pub async fn`，要求函数前有连续 `///`，允许中间有属性行。 |
| `nf-source` `pub fn` 文档覆盖率 | `0 / 5 = 0.0%` | 5 个 `cmd_*::run` 均无 `///`。 |
| `videocut-*` `pub fn` 文档覆盖率 | `37 / 37 = 100.0%` | `videocut-core/download/transcribe/align/cut` 合计。 |
| unsafe 注释率 | `2 / 2 = 100.0%` | 当前范围内只有 `videocut-core/src/python.rs` 测试修改环境变量的 2 个 `unsafe` 行，前置均有 `SAFETY`。 |
| 生产代码 unsafe | `0` | `crates/nf-source` 与 `crates/videocut-*` 生产路径未发现 `unsafe`。 |

## P0

无。没有发现会直接阻断维护审查的安全注释缺失、公开接口完全无文档、或源码中引用不存在 spec 导致编译/运行路径必然失效的问题。

## P1

### D5-P1-1 · clips CLI 契约三方漂移，新人按 spec/guide 无法形成稳定调用链

- 位置:
  - `crates/nf-source/src/cli.rs:14`
  - `crates/nf-guide/flows/clips/guide.md:61`
  - `spec/bdd/clips/feature.json:14`
  - `spec/bdd/clips/scenarios/clips-01.bdd.json:21`
  - `spec/versions/v0.3.0/spec.json:156`
- 现状:
  - 实际 `nf-source` 只有 `download / transcribe / align / cut / preview`，参数是 `--url --out-dir`、`--video --out-dir`、`--srt-path`、`--sentences-path --plan-path` 等。
  - guide 仍说 Code 步骤跑 bare `yt-dlp` / `whisperx` / `ffmpeg`，没有 wrapper。
  - BDD/version spec 又要求 `nf-source download --local-mp4 --out`、`nf-source transcribe --transcript --out`、`nf-source plan`、`nf-source verify`。
- 影响: 新人或弱模型盲测会在第一步就分叉：看 guide 会绕过 `nf-source`，看 BDD 会调用不存在的 flag/subcommand，看源码 `--help` 又得到第三套接口。维护者无法判断应修代码、修 guide，还是修 spec。
- 建议: 选一个 canonical contract。若以当前代码为准，更新 guide/BDD/spec，删除 `--local-mp4`、`--transcript`、`plan`、`verify` 断言，或明确这些是待实现需求；若以 BDD 为准，则把缺的 CLI 功能列入 build backlog，并在 guide 标注 wrapper 是主路径。

### D5-P1-2 · 跨模块命名和 artifact 粒度不一致，切片链路可读性被接口翻译消耗

- 位置:
  - `crates/nf-source/src/cli.rs:23`
  - `crates/nf-source/src/cli.rs:33`
  - `crates/nf-source/src/cli.rs:47`
  - `crates/nf-source/src/cli.rs:59`
  - `crates/nf-guide/flows/clips/guide.md:67`
  - `spec/bdd/clips/feature.json:37`
- 现状: CLI 用 `out_dir` 目录式产物，BDD/spec 用 `--out output/source.mp4` 文件式产物；guide 的目录结构是 episode/source/clips 分层，BDD 说所有产物写 `output/` 根目录；cut 的代码入口需要 `sentences_path + plan_path + out_dir`，BDD 的示例是 `--plan --source --out`。
- 影响: `nf-source` 命令层与 `videocut-*` library 层本身映射清楚，但外层文档把“目录 bundle”和“单文件 output”混在一起。新人排错时需要人工把 `source.mp4`、`sentences.json`、`cut_report.json` 的位置翻译多次。
- 建议: 建一张 `nf-source` canonical artifact map，逐步统一所有文档中的参数名和产物路径。至少对每个子命令列出输入、输出目录、固定文件名、下一步消费方。

## P2

### D5-P2-1 · `nf-source` command adapter 的 5 个 `pub fn run` 无函数文档

- 位置:
  - `crates/nf-source/src/cmd_download.rs:7`
  - `crates/nf-source/src/cmd_transcribe.rs:7`
  - `crates/nf-source/src/cmd_align.rs:7`
  - `crates/nf-source/src/cmd_cut.rs:8`
  - `crates/nf-source/src/cmd_preview.rs:7`
- 现状: `videocut-*` library 层所有 `pub fn` 都有 `///`，但 binary command adapter 全缺。严格按“每 pub fn 有 `///`”口径，整体覆盖率从 `100%` 拉低到 `88.1%`。
- 影响: 这是低风险缺口，因为这些函数只是 CLI 转发；但它破坏了简单门禁，后续无法直接用 `pub fn` 文档覆盖率作为质量指标。
- 建议: 补一句式 `/// Run the ... subcommand.`，或把这些 adapter 降为 `pub(crate)` / 私有函数，避免不必要公开面。

### D5-P2-2 · crate/module 文档仍保留旧产品名，增加历史噪声

- 位置:
  - `crates/videocut-core/src/cut_report.rs:1` 写 `splice cut`
  - `crates/videocut-core/src/srt.rs:1` 写 `splice import`
  - `crates/videocut-download/src/lib.rs:1` 写 `videocut download`
  - `crates/videocut-transcribe/src/lib.rs:1` 写 `videocut transcribe`
  - `crates/videocut-align/src/lib.rs:1` 写 `videocut align`
  - `crates/videocut-cut/src/lib.rs:1` 写 `videocut cut`
- 现状: crate 名是 `videocut-*`，binary 是 `nf-source`；文档同时出现 `splice`、`videocut`、`nf-source`、`nf karaoke`。
- 影响: 不影响代码，但新人会误以为存在 `videocut` 或 `splice` CLI。结合 P1 的 spec 漂移，会放大接口追踪成本。
- 建议: 模块文档统一为“library crate for the `nf-source <subcommand>` path”，旧名只在迁移说明或 ADR 中保留。

### D5-P2-3 · 公开数据结构字段文档密度不均

- 位置:
  - `crates/nf-source/src/cli.rs:8`
  - `crates/videocut-transcribe/src/lib.rs:29`
  - `crates/videocut-cut/src/lib.rs:21`
  - `crates/videocut-core/src/preview.rs:14`
- 现状: 多数 public struct 有类型级 `///`，但字段文档并不一致。`DownloadOptions`、`AlignOptions` 较完整；`TranscribeOptions`、`CutOptions`、`PreviewTimelines`、`nf-source` args 基本靠字段名自解释。
- 影响: 对 Rust API 调用者影响中等；尤其 `jobs`、`margin_sec`、`start_sec/end_sec`、`clip-local milliseconds` 这类字段有边界语义，最好不要只靠名称。
- 建议: 先补会跨 crate 消费或落盘 schema 的字段，不必一次性补全所有 CLI args。

## 新人可读性

- 正面: `videocut-core` 的 schema 模块拆分清楚，`sentence / plan / cut_report / preview / time` 职责容易定位；`videocut-cut::cut_plan` 到 `CutReport` 的主路径也短。
- 负面: 新人入口现在不清楚。`nf-source --help`、`nf-guide clips`、`spec/bdd/clips` 给出的命令模型不同；README 级别没有一页把“当前可运行 CLI”和“待实现 spec”区分开。
- 结论: 源码本体 B，文档/contract 层 C-。维护风险不是复杂度，而是入口真相不唯一。

## 过时 spec/interfaces 引用

| 位置 | 问题 |
|---|---|
| `spec/bdd/clips/feature.json:16` | 声称 `nf-source` 有 `plan` 子命令，当前 CLI 无。 |
| `spec/bdd/clips/feature.json:20` | 声称支持 `--local-mp4`，当前 `DownloadArgs` 无。 |
| `spec/bdd/clips/feature.json:26` | 声称有 `nf-source verify`，当前 CLI 无。 |
| `spec/bdd/clips/feature.json:32` | 声称支持 `--transcript`，当前 `TranscribeArgs` 无。 |
| `spec/bdd/clips/scenarios/clips-01.bdd.json:21-29` | AI tool 命令串依赖 `--local-mp4`、`--transcript`、`plan`、`verify`。 |
| `spec/versions/v0.3.0/spec.json:92-94` | `T-BUILD-5` 仍把 verify 当待确认/补齐项，但 v0.4.2 当前代码未实现。 |
| `spec/versions/v0.3.0/spec.json:156-158` | `ai_tools_summary.key_cli` 列出当前不存在的 clips CLI。 |
| `crates/nf-guide/flows/clips/guide.md:63-74` | guide 仍描述 bare command path，与 `nf-source` wrapper 代码不一致。 |
| `crates/videocut-core/src/cut_report.rs:1` / `crates/videocut-core/src/srt.rs:1` | 旧 `splice` 名称残留。 |

`spec/contracts/interfaces.json` 未发现 clips / `nf-source` 接口定义；当前 clips contract 实际散落在 `nf-guide`、BDD 和 `spec/versions/v0.3.0/spec.json`。

## 跨模块调用一致性

- `nf-source` 到 `videocut-*` 的源码调用一致：每个 command adapter 只组装 options 后调用对应 crate，未发现同一字段跨层改名后语义反转。
- 不一致主要在源码外 contract：`nf-source::cli` 的 `out_dir` bundle 模型，与 BDD 的 `--out <file>` 单文件模型冲突。
- `Plan` 是 `videocut-core` schema，`cut` 消费 `plan_path`；但当前没有 `nf-source plan`，而 BDD 把 plan 作为 CLI 子命令。这需要在 contract 中明确“Agent 自写 JSON”还是“CLI 生成 plan”。

## 验证结果

- 已复跑 `pub fn` 文档覆盖率统计: `total=42 documented=37 coverage=88.1%`
- 已复跑 unsafe 注释率统计: `unsafe_lines=2 with_safety=2 rate=100.0%`
- 已复跑接口漂移检索: 仍命中 `--local-mp4`、`--transcript`、`nf-source plan`、`nf-source verify`、bare `yt-dlp/whisperx/ffmpeg` guide 路径。

复跑命令:

```bash
ruby -e 'items=[]; ARGV.each { |dir| Dir.glob(File.join(dir, "**/*.rs")).sort.each { |f| lines=File.readlines(f); lines.each_with_index { |line,i| next unless line =~ /^\s*pub\s+(?:async\s+)?fn\s+([A-Za-z0-9_]+)/; j=i-1; j-=1 while j>=0 && lines[j].strip.empty?; while j>=0 && lines[j].strip.start_with?("#"); j-=1; j-=1 while j>=0 && lines[j].strip.empty?; end; has=false; k=j; while k>=0 && lines[k].strip.start_with?("///"); has=true; k-=1; end; items << [f,i+1,$1,has] } } }; puts "total=#{items.length} documented=#{items.count{|x|x[3]}} coverage=#{(100.0*items.count{|x|x[3]}/items.length).round(1)}%"; items.reject{|x|x[3]}.each { |f,l,n,_| puts "MISS #{f}:#{l} #{n}" }' \
  crates/nf-source crates/videocut-core crates/videocut-download crates/videocut-transcribe crates/videocut-align crates/videocut-cut

ruby -e 'items=[]; ARGV.each { |dir| Dir.glob(File.join(dir, "**/*.rs")).sort.each { |f| lines=File.readlines(f); lines.each_with_index { |line,i| next unless line.include?("unsafe"); safety=(([i-3,0].max)..i).any? { |k| lines[k].include?("SAFETY") }; items << [f,i+1,safety,line.strip] } } }; puts "unsafe_lines=#{items.length} with_safety=#{items.count{|x|x[2]}} rate=#{items.empty? ? 100 : (100.0*items.count{|x|x[2]}/items.length).round(1)}%"; items.each { |f,l,s,t| puts "%s:%d %s %s" % [f,l,s ? "SAFETY" : "MISS",t] }' \
  crates/nf-source crates/videocut-core crates/videocut-download crates/videocut-transcribe crates/videocut-align crates/videocut-cut

rg -n "nf-source|local-mp4|transcript|verify|source-|videocut|yt-dlp|whisperx|ffmpeg|--out|--out-dir|--video|--url" \
  crates/nf-guide/flows/clips spec/bdd/clips spec/versions/v0.3.0 crates/nf-source/src crates/videocut-*
```

本次只审；未修改源码。
