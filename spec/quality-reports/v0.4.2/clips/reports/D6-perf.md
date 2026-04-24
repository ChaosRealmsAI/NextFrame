# D6 · clips pipeline 性能风险审查

## 总评(1 句)
clips pipeline 当前瓶颈不在 Rust CPU 算法本身，而在外部进程边界和全量内存物化：长视频转写会按 chunk 重复启动 Python/Whisper helper，输出阶段同时持有多份词表/句表，cut/preview 又用线性查找把大 plan 放大成可见延迟。

## Findings(按 P0/P1/P2 排)

### P0 · 长音频 transcribe 按 chunk 重复启动 Python helper，`jobs>1` 会并发加载大模型并放大到 OOM
- **位置**: `crates/videocut-transcribe/src/lib.rs:168-189`, `crates/videocut-transcribe/src/lib.rs:227-243`, `crates/videocut-transcribe/src/chunk.rs:36-44`, `crates/nf-source/src/cli.rs:38-43`
- **问题**: `transcribe_chunks` 对每个 chunk 调一次 `run_whisper_script()`，每次都是新的 Python 进程；默认模型是 `large-v3`。长视频按 20min chunk 切分后，单 job 会重复付 Python import/model load 冷启动，`--jobs N` 则会同时启动 N 个 helper 并各自加载模型/音频。对于 large-v3 这类模型，这不是普通启动开销，而是 GPU/CPU RAM 峰值乘以并发数，足以让 2h+ 视频或 jobs>1 直接 OOM/换页。
- **建议**: 把 helper 改成长驻 worker 或批量模式：一次加载模型，顺序/受控并发处理多个 chunk；`jobs` 应按模型内存预算设硬上限，必要时默认 1 且对 large-v3 + 多进程给出拒绝/警告。更进一步可让 Python 端直接做分块，Rust 只传一次 audio path。
- **代价**: 中-高。

### P0 · 转写输出阶段同时保留 `words`、`sentences[*].words` 和 `words.to_vec()` 临时副本，长视频内存峰值无上限
- **位置**: `crates/videocut-transcribe/src/lib.rs:107-135`, `crates/videocut-transcribe/src/lib.rs:262-272`, `crates/videocut-core/src/sentence.rs:118-172`, `crates/videocut-core/src/sentence.rs:70-73`, `crates/videocut-core/src/sentence.rs:105-112`
- **问题**: helper stdout 先完整反序列化成 `whisper_result.words`；`split_into_sentences()` 再把每个 `Word { String, f64, f64 }` clone 进 `Sentence.words`；写 `words.json` 时又 `words.to_vec()` 再 clone 一次；`sentences.json` / `words.json` 还分别 pretty serialize 成完整 `String` 后写盘。长视频词级数据会在峰值时至少出现原词表、句内词表、words sidecar 临时词表、两个 JSON 字符串这几类全量对象，内存随总词数线性乘倍增长。
- **建议**: 明确一个 ownership：要么 `sentences.json` 不嵌完整 words、只用 `words.json` + ranges；要么写 `words.json` 时借用 slice/stream serialize，避免 `to_vec()`。JSON 写盘改 `serde_json::to_writer_pretty(BufWriter<File>)`，避免先生成完整 `String`。
- **代价**: 中。

### P1 · `cut` 每个 clip 启动一次 ffmpeg 再启动一次 ffprobe，批量切片外部进程开销和 I/O 扫描随 clip 数线性放大
- **位置**: `crates/videocut-cut/src/lib.rs:61-94`, `crates/videocut-cut/src/lib.rs:100-143`, `crates/videocut-cut/src/lib.rs:186-199`, `crates/videocut-core/src/media.rs:37-62`
- **问题**: 每个 clip 都 `ffmpeg` re-encode 一次，成功后再 `ffprobe` 探测输出 duration。几十个 clip 时还能接受；上百个短 clip 时，进程启动、解复用、编码器初始化、写 mp4 trailer、再次读文件头/尾都会成为明显固定成本。当前是串行执行，也没有批量 probe 或 ffmpeg `filter_complex`/segment 级调度。
- **建议**: 保守优化是把 duration 校验从逐文件 `ffprobe` 改为批量 probe 或可配置关闭；中期设计 cut worker 池，按 CPU/磁盘预算限制并行；长期评估同源多 clip 的 ffmpeg filter graph/concat demuxer 方案，减少重复初始化。
- **代价**: 中。

### P1 · `sentence_by_id` 是线性查找，cut 和 preview 会把大 plan 放大成 O(clips * sentences)
- **位置**: `crates/videocut-core/src/sentence.rs:77-80`, `crates/videocut-cut/src/lib.rs:158-165`, `crates/videocut-core/src/preview.rs:74-89`, `crates/nf-source/src/cmd_preview.rs:10-32`
- **问题**: `sentence_by_id()` 每次从头 `iter().find()`。`cut_one()` 每个 clip 查 from/to 两次；`preview` 对每个成功 clip 的 `from_id..=to_id` 每个 sentence id 都查一次。大 episode 若有数千句、上百 clip、clip 覆盖区间较长，preview 会退化成大量重复线性扫描，且每个命中的 word 还会 clone text。
- **建议**: 加一次性 `HashMap<u32, usize>` 或利用 sentence id 连续递增的 `Vec` 索引表；preview/cut 在批处理开始构建 lookup，后续 O(1) 查询。若 id 保证连续，也可校验后直接 `id - 1` 索引。
- **代价**: 低。

### P1 · align 的文本重建在 mismatch 后可能退化为 repeated substring scan
- **位置**: `crates/videocut-align/src/text.rs:23-52`, `crates/videocut-align/src/text.rs:94-99`, `crates/videocut-align/src/text.rs:147-171`
- **问题**: `rebuild_words()` 对每个 align unit 从 `cursor` 开始 `rest.find(unit)`。正常命中时 cursor 前进，近似线性；但一旦 helper 返回的 token 与原文规范化不一致，cursor 不前进，后续 unit 会反复扫描同一段剩余文本。CJK char-level units 数量大，字幕中空格、全角/半角、大小写、特殊标点或 whisperX 丢 token 都可能触发退化。
- **建议**: 对 original text 和 unit 做统一 normalized cursor；连续 miss 超阈值后切到更便宜的对齐策略，或记录 miss 并推进 cursor 到下一个合理边界。至少为 miss 计数打 meta，避免性能退化不可观测。
- **代价**: 中。

### P1 · helper 子进程 stdout/stderr 全量收集到内存，JSON 解析失败路径还会把 stdout 再转成 String
- **位置**: `crates/videocut-transcribe/src/lib.rs:229-258`, `crates/videocut-align/src/script.rs:23-56`, `crates/videocut-download/src/lib.rs:123-147`
- **问题**: `Command::output()` / `wait_with_output()` 会把 stdout/stderr 全量放进内存。正常情况下 stdout 是 JSON，stderr 应较小；但 whisper/transformers/yt-dlp 一旦输出大量日志或异常 dump，Rust 侧会先完整缓存，失败时又 `String::from_utf8_lossy()` 构造错误文本。长视频 JSON 本身也必须一次性跨进程边界传输，无法 streaming。
- **建议**: 对 helper stdout 使用临时文件或 streaming JSON reader；stderr 设大小上限/ring buffer，只保留尾部用于报错。yt-dlp metadata stdout 可保留，但报错文本也应截断。
- **代价**: 中。

### P2 · download 先 `yt-dlp --dump-single-json` 再 `yt-dlp` 下载，固定付两次网络/进程启动成本
- **位置**: `crates/videocut-download/src/lib.rs:90-103`, `crates/videocut-download/src/lib.rs:123-148`, `crates/videocut-download/src/lib.rs:150-175`
- **问题**: download 阶段为了拿 title 先跑一次 metadata，再跑一次下载；两次都会启动 Python/yt-dlp 并可能访问同一页面/manifest。单次下载影响有限，但批量 episode 或网络慢时会让前置等待翻倍。
- **建议**: 让下载命令同时写 info json，例如使用 yt-dlp 的 info sidecar/print after move 能力；或把 metadata JSON 缓存在 out_dir，下载失败重试时复用。
- **代价**: 低。

### P2 · SRT/Sentence/TXT 渲染存在多处中等规模临时 Vec/String，短文本可接受，长字幕会增加 GC-like 峰值
- **位置**: `crates/videocut-core/src/srt.rs:9-55`, `crates/videocut-core/src/srt.rs:61-75`, `crates/videocut-core/src/sentence.rs:83-99`, `crates/videocut-align/src/text.rs:13-19`, `crates/videocut-align/src/text.rs:147-163`
- **问题**: `parse_srt()` 先 `replace()` 全文，再每个 block collect lines/text_lines；`parse_plain_text()` `blocks.join(" ").trim().to_string()` 再复制；`render_srt()` / `to_txt()` 用 `format!` 逐句追加；`build_sentence()` collect `Vec<&str>` 后 join。它们不是最大瓶颈，但在长字幕场景会叠加到输出阶段的内存峰值。
- **建议**: 仅在 P0/P1 处理后再优化：SRT parse/render 改 streaming push，`build_sentence()` 预估容量后直接 push_str，减少中间 Vec。
- **代价**: 低。

### P2 · cut 进度 NDJSON 每 clip 同步写 stdout，慢 consumer 会反压批量切片
- **位置**: `crates/nf-source/src/cmd_cut.rs:18-21`, `crates/videocut-cut/src/lib.rs:69-91`
- **问题**: 当前不是 per-frame 高频，所以风险远低于 recorder；但 stdout 如果接到慢 pipe，`println!` 仍在每个 clip 完成路径同步执行，会把 CLI consumer 纳入关键路径。
- **建议**: 保持 clip 粒度即可；若后续加更细粒度 ffmpeg progress，必须走限频/异步 drain，避免变成 hotpath I/O。
- **代价**: 低。

## hotpath 分配清单

| 热度 | 分配/拷贝点 | 位置 | 说明 |
|---|---|---|---|
| 每 chunk | `ffmpeg` slice 输出 chunk wav | `videocut-transcribe/src/chunk.rs:36-44`, `videocut-transcribe/src/audio.rs:9-28` | 长音频会写 N 个临时 WAV；磁盘 I/O 与源音频时长线性相关。 |
| 每 chunk | Python helper 进程 + stdout/stderr buffers | `videocut-transcribe/src/lib.rs:173-189`, `videocut-transcribe/src/lib.rs:227-243` | 重复 import/model load；`jobs>1` 并发放大内存。 |
| 每 chunk merge | `collect::<Vec<_>>()` shifted words | `videocut-transcribe/src/lib.rs:204-218` | 每个 chunk 先收集 shifted Vec，再 retain，再 extend；可直接 push 到 merged。 |
| 每 run | `split_into_sentences` clone word text | `videocut-core/src/sentence.rs:118-172` | `Sentence.words` 复制整份词流。 |
| 每 run output | `words.to_vec()` | `videocut-transcribe/src/lib.rs:268-272` | 写 `words.json` 前再次克隆整份词表。 |
| 每 artifact | `serde_json::to_string_pretty` / `to_vec_pretty` | `sentence.rs:70-73`, `sentence.rs:109-112`, `cut_report.rs:55-58`, `preview.rs:51-54`, `plan.rs:60-63` | 全量 JSON 先在内存成串/Vec，再写盘。 |
| 每 sentence | text join 临时 Vec | `videocut-core/src/sentence.rs:160-164`, `videocut-align/src/text.rs:150-162` | collect 后 join；可直接 push_str。 |
| 每 align unit | substring scan | `videocut-align/src/text.rs:28-35`, `videocut-align/src/text.rs:94-99` | 正常近似线性，miss 后可能重复扫描剩余文本。 |
| 每 clip | ffmpeg process + re-encode | `videocut-cut/src/lib.rs:100-143` | 固定启动成本 + 编码器初始化 + 输出 I/O。 |
| 每 clip | ffprobe process + output buffer | `videocut-cut/src/lib.rs:186-199`, `videocut-core/src/media.rs:37-62` | duration 校验再次读取输出媒体。 |
| 每 clip | title/file/error clone | `videocut-cut/src/lib.rs:69-91`, `videocut-cut/src/lib.rs:201-224`, `nf-source/src/cmd_preview.rs:14-18` | 低风险；数量随 clip 数线性。 |
| 每 preview word | `word.text.clone()` | `videocut-core/src/preview.rs:79-87` | timelines.json 自包含导致必须复制；可接受但需计入峰值。 |
| 每 sentence lookup | linear scan | `videocut-core/src/sentence.rs:77-80`, `preview.rs:74-77` | preview 的范围循环会放大。 |
| 每 SRT parse | full `replace` + per-block Vec | `videocut-core/src/srt.rs:9-55` | P2；长字幕有额外内存峰值。 |

## FFI / 外部生命周期审查

- **Rust native FFI**: 本 scope 未看到手写 unsafe/CF/FFI 生命周期；主要生命周期边界是 `Command` 子进程、pipe、临时目录和媒体文件。
- **Python helper 生命周期**: `run_whisper_script()` 每次 `Command::output()` 等待子进程退出，stdout/stderr 会被父进程 drain 到内存，通常不会 pipe deadlock，但会形成全量 buffer 峰值。`run_align_script()` 用 piped stdin/stdout/stderr，写完 stdin 后 `wait_with_output()`；如果 helper 在读取 stdin 前大量写 stderr，理论上可能互相阻塞，不过当前预期脚本是先读 stdin 再加载 whisperX，风险低于 transcribe 的内存峰值。
- **临时目录**: transcribe 用 `tempdir()` 保存 chunk wav，函数返回后清理；如果中途失败，tempdir drop 也会清理。风险不在泄漏，而在运行期间 chunk wav 的磁盘空间与时长线性增长。
- **外部工具生命周期**: `yt-dlp`、`ffmpeg`、`ffprobe` 都是同步等待；没有孤儿进程管理或 timeout。长时间卡住时会阻塞整个 CLI，性能上表现为不可取消/不可观测的等待。
- **helper script packaging**: `videocut-align` / `videocut-transcribe` 解析 `python/align_ffa.py` 与 `python/whisper_transcribe.py`，但当前 tree 未看到这些文件，只有 `crates/nf-tts/scripts/align_ffa.py`。这是功能/打包风险，不计入性能 P0；但若依赖 env var 指向外部脚本，性能特征也会随外部脚本变化，建议在后续质量维度单独收敛。

## I/O 瓶颈

- **下载**: yt-dlp metadata + download 两次访问远端，网络慢时固定放大等待。
- **转写**: 先抽整段 `audio.wav`，长视频再切 chunk wav，产生至少一份全量 WAV + N 份 chunk WAV 的临时磁盘写入。
- **输出**: sentences/words/srt/txt/meta 全量写盘；pretty JSON 可读性好，但文件体积和写入时间明显大于 compact JSON。
- **切片**: 每 clip 独立 mp4 写入 + ffprobe 读取；短 clip 很多时随机文件 I/O 与进程启动成为主因。

## 亮点(别改)

- `Command` 调用都使用参数数组，没有 shell 拼接；外部 proc 生命周期简单，注入风险低。
- `tempdir()` 管理 transcribe chunk 工作目录，比手动清理稳。
- cut 阶段失败按 clip 记录并继续处理，单个 ffmpeg 失败不会丢掉整个批次。
- preview timelines 自包含，牺牲部分 clone/JSON 体积换部署简单性；在 clip 数较小时是合理 tradeoff。

## 汇总

- P0 数: 2 / P1 数: 4 / P2 数: 3
- 整体分(1-10): 6.2
- 本次未跑 benchmark / cargo test；结论基于静态代码审查。
