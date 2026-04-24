# D1 · clips pipeline 模块拆分审查

## 总评(1 句)
整体分层方向清楚且未见 crate 级循环依赖，但 `videocut-core` 存在模块双向依赖且导出面过宽、CLI 承担 preview 领域拼装、转写/对齐的句子与输出 bundle 合约分散，继续加阶段时会放大 API 漂移和重复维护成本。

## Findings(按 P0/P1/P2 排)

（无 P0。）

### P1 · `videocut-core` 把 schema、I/O、外部进程 helper 全部作为公共 API 暴露
- **位置**: crates/videocut-core/src/lib.rs:3-23; crates/videocut-core/src/media.rs:9-61; crates/videocut-core/src/python.rs:6-15; crates/videocut-core/src/fs.rs:9-21
- **问题**: `lib.rs` 既 `pub mod` 所有实现模块，又 re-export `extract_audio_to_wav` / `probe_duration` / `python_bin` / `remove_existing_path` / 时间格式化等低层 helper。结果是核心 schema crate 同时变成 ffmpeg/ffprobe/Python/文件系统工具箱，外部 crate 可以绕过 stage crate 直接依赖实现细节，后续想替换 helper 或收窄层级会成为破坏性 API 变更。
- **建议**: 将 `videocut-core` 收敛为 artifact schema + 纯函数层：保留 `Plan` / `Sentences` / `CutReport` / `PreviewTimelines` 等稳定类型和少量纯转换；把 `media` / `python` / `fs` 这类 process/OS helper 改为 `pub(crate)` 或移动到对应 stage crate/共享 internal crate。`lib.rs` 只 re-export 稳定契约，模块本身默认 `mod`。
- **代价**: 中(需要调整 stage crate import 路径并明确公共 API 边界)

### P1 · `sentence` 与 `srt` 模块形成双向依赖
- **位置**: crates/videocut-core/src/sentence.rs:9; crates/videocut-core/src/sentence.rs:82-85; crates/videocut-core/src/srt.rs:5; crates/videocut-core/src/srt.rs:60-76
- **问题**: `sentence` 为了 `Sentences::to_srt()` 调用 `srt::render_srt`，而 `srt` 又依赖 `sentence::Sentence` 渲染单条记录，形成 `sentence -> srt -> sentence` 的模块级环。当前 Rust 能编译，但这会让 schema 类型和格式渲染互相知道，后续新增 VTT/TXT/JSONL 等渲染时容易继续把输出格式塞回 schema 模块。
- **建议**: 打破方向：要么删除/迁移 `Sentences::to_srt()`，让调用方直接用 `srt::render_srt(&sentences.sentences)`；要么新增 `render`/`sentence_format` 模块同时拥有 SRT/TXT 渲染，`sentence` 只定义数据结构和查找/读写 JSON。
- **代价**: 低/中(需要改 transcribe/align 两处 `to_srt` 调用，API 若对外稳定则需兼容过渡)

### P1 · `nf-source` 的 preview 命令包含领域拼装逻辑，CLI 层不再只是适配器
- **位置**: crates/nf-source/src/cmd_preview.rs:8-42; crates/videocut-core/src/preview.rs:45-91
- **问题**: `cmd_preview` 直接读取 `Sentences` / `CutReport`、遍历成功 clip、构造 `PreviewClip`、调用 `remap_words_to_clip_ms` 并写 `PreviewTimelines`。这些是 preview artifact 的业务转换，不是 CLI 参数适配；同时 `videocut-core::preview` 只提供模型和局部 remap，导致 preview 阶段没有和 download/transcribe/align/cut 对齐的可复用入口。
- **建议**: 抽出 `build_preview_timelines(sentences, report, options)` 到 `videocut-core::preview`，或新增独立 `videocut-preview` stage crate；`nf-source::cmd_preview` 只负责 args -> options、调用入口、打印 summary。
- **代价**: 低/中(主要移动现有逻辑并补一个窄入口)

### P1 · transcribe 与 align 重复实现 canonical sentence bundle 写出流程
- **位置**: crates/videocut-transcribe/src/lib.rs:262-278; crates/videocut-align/src/lib.rs:172-183; crates/videocut-core/src/sentence.rs:66-99
- **问题**: 两个 stage 都手写同一组输出：`sentences.json`、`sentences.srt`、`sentences.txt`、`meta.json`；transcribe 额外写 `words.json`。文件命名、SRT/TXT 渲染和 meta 序列化散落在各 stage，`Sentences` 类型还直接携带 `to_srt` / `to_txt`，使 artifact bundle 合约没有单一模块所有权。
- **建议**: 在 core 中抽 `sentence_bundle`/`artifacts` 模块，提供 `write_sentence_bundle(out_dir, sentences, meta, words?)` 或明确的 writer 类型；stage 只负责产出 `Sentences`/meta 数据，bundle 文件布局和格式由一个模块维护。
- **代价**: 低/中(移动重复写文件逻辑，需保持输出路径兼容)

### P1 · 句子切分与结束符规则在 core 和 align 各自实现，规则所有权不清
- **位置**: crates/videocut-core/src/sentence.rs:117-187; crates/videocut-align/src/text.rs:55-81; crates/videocut-align/src/text.rs:147-212
- **问题**: transcribe 使用 `videocut_core::split_into_sentences`，align 使用自己的 `build_sentences` / `ends_sentence`，两边都维护标点结束规则、句子 id 分配和 text 拼接，只是 align 额外处理 CJK 不加空格。这样 canonical `sentences.json` 的 sentence boundary 实际由两个模块决定，后续修一个语言/标点规则容易漏掉另一个路径。
- **建议**: 把句子构造策略下沉到 core，例如 `SentenceBuildOptions { spacing: WordSpacing }` 或 `split_words_into_sentences(words, language)`；align 只负责重建 words，transcribe/align 共用同一个句子 boundary 实现。
- **代价**: 中(需要合并规则并回归 English/CJK 用例)

### P2 · `videocut-transcribe::lib.rs` 同时承担 public API、编排、并发 merge、Python helper 和输出写入
- **位置**: crates/videocut-transcribe/src/lib.rs:67-149; crates/videocut-transcribe/src/lib.rs:161-225; crates/videocut-transcribe/src/lib.rs:227-308
- **问题**: 虽然已有 `audio` / `chunk` / `logger` 子模块，但 `lib.rs` 仍包含主流程、chunk 并发执行、overlap 去重、Python 脚本路径解析、helper 进程调用和 bundle 写出。公共入口文件过重，后续修改模型调用、merge 策略或输出格式都会集中改同一个文件。
- **建议**: 保留 `TranscribeOptions` / `TranscribeSummary` / `transcribe` 在 `lib.rs`，把 helper 调用拆到 `whisper.rs`，chunk 结果合并拆到 `merge.rs`，输出写入复用 core artifact writer；`lib.rs` 只做阶段编排。
- **代价**: 中(纯内部拆分为主，需移动测试覆盖)

### P2 · `videocut-cut` 单文件混合 plan 解释、ffmpeg command、校验和 report 映射
- **位置**: crates/videocut-cut/src/lib.rs:47-97; crates/videocut-cut/src/lib.rs:100-149; crates/videocut-cut/src/lib.rs:151-240
- **问题**: `lib.rs` 同时是 public API、batch 编排、单 clip 计划解析、ffmpeg 参数构造、ffprobe duration 校验、failure/report 映射和 preview 文本摘要。职责都服务 cut 阶段，但放在单文件会让 ffmpeg 参数调整、plan validation 和 report schema 互相干扰。
- **建议**: 拆成 crate-private `plan_resolver`(sentence id -> time range)、`ffmpeg_cut`(命令构造/执行)、`reporting`(failure/result/preview text)；`lib.rs` 保留 options、progress event 和 `cut_plan`。
- **代价**: 低/中(内部移动函数，外部 API 可不变)

### P2 · `videocut-download` 单文件包含下载流程、yt-dlp 适配、metadata schema 和 UTC 日期算法
- **位置**: crates/videocut-download/src/lib.rs:27-51; crates/videocut-download/src/lib.rs:81-148; crates/videocut-download/src/lib.rs:150-187; crates/videocut-download/src/lib.rs:189-229
- **问题**: 一个文件同时定义用户可见 metadata、执行 `yt-dlp --dump-single-json`、执行下载、处理 stderr、写 `meta.json`，还内嵌 `civil_from_days` UTC 格式化。模块职责边界过宽，尤其时间格式算法与下载适配无直接关系。
- **建议**: 拆 `yt_dlp.rs`(metadata/download command)、`metadata.rs`(schema + write)、`time.rs` 或直接引入/复用统一时间 formatter；`download()` 只串联步骤。
- **代价**: 低(内部拆文件，行为保持)

### P2 · `chunk` 模块把纯 chunk planning 和 ffmpeg 切片副作用绑在一起
- **位置**: crates/videocut-transcribe/src/chunk.rs:17-57; crates/videocut-transcribe/src/audio.rs:9-33
- **问题**: `build_chunks` 的名字像 planner，但在循环内直接调用 `slice_wav` 生成文件。这样 chunk 边界计算无法独立复用/测试，短音频测试也绕开了实际多 chunk 分支中的 ffmpeg 副作用。
- **建议**: 拆 `plan_chunks(total_duration, chunk_minutes, overlap_seconds) -> Vec<ChunkSpec>` 纯函数，再由 `materialize_chunks(wav_path, workdir, specs)` 调用 `slice_wav`；单测覆盖边界规划，集成测试再覆盖 ffmpeg。
- **代价**: 低(局部拆分，调用点少)

### P2 · transcribe 暴露了重复的 core media wrapper，API 语义不清
- **位置**: crates/videocut-transcribe/src/lib.rs:151-159; crates/videocut-core/src/lib.rs:15
- **问题**: `extract_audio` / `duration_seconds` 只是 `videocut_core::extract_audio_to_wav` / `probe_duration` 的薄包装，但它们挂在 `videocut-transcribe` 公共 API 上，容易让外部把 transcribe crate 当通用 media 工具用，和 core 当前已过宽的 helper 导出叠加。
- **建议**: 如果这些函数只为兼容历史调用，标注 deprecated 并在下个窗口移除；如果确实要提供 media API，放到独立 media/helper crate，而不是 transcribe stage。
- **代价**: 低(若无外部依赖可直接收窄；若有兼容窗口则低/中)

### P2 · align 子模块反向依赖 root 私有类型，模块层级不够干净
- **位置**: crates/videocut-align/src/lib.rs:48-60; crates/videocut-align/src/lib.rs:15-16; crates/videocut-align/src/script.rs:10-17; crates/videocut-align/src/text.rs:8-23
- **问题**: `lib.rs` 定义 `AlignOutput` / `AlignUnit`，再调用 `script::run_align_script` 和 `text::{rebuild_words,...}`；但 `script` 又 `use crate::AlignOutput`，`text` 又 `use crate::AlignUnit`。这让 root 既是编排层又是数据模型层，子模块不能独立表达自己的输入/输出契约。
- **建议**: 新增 `types.rs` 或 `model.rs`，放置 `AlignOutput` / `AlignUnit` 和验证相关类型；`lib.rs`、`script.rs`、`text.rs` 都依赖该低层模块，避免 child -> root 的反向引用。
- **代价**: 低(类型移动和 import 调整)

## 亮点(好的拆分 · 别改)
- `nf-source/src/main.rs:13-22` 只做 subcommand dispatch，`cmd_download` / `cmd_transcribe` / `cmd_align` / `cmd_cut` 基本是薄适配层。
- crate 级依赖方向清楚：`nf-source -> videocut-{download,transcribe,align,cut} -> videocut-core`，`cargo tree -p nf-source --depth 2` 未见反向依赖或 crate 级循环。
- `videocut-align` 已经把 helper process 调用和文本重建拆到 `script` / `text`，方向比单文件 stage 更清楚。
- `videocut-core` 的 schema 文件按 artifact 拆分为 `plan` / `sentence` / `cut_report` / `preview`，领域名基本直观。

## 汇总
- P0 数: 0 / P1 数: 5 / P2 数: 5
- 依赖检查: 未见 crate 级循环依赖；模块级发现 `core::sentence <-> core::srt` 双向依赖，另有 `align::script/text -> align::lib types` 的 root 反向依赖气味。
