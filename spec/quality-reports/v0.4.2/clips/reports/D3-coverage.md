# D3 Coverage Audit: Clips Pipeline

Scope: `nf-source` + `videocut-*` crates for clips `download / transcribe / align / cut`.

Date: 2026-04-21

## Verdict

当前 clips pipeline 测试覆盖不达 D3：`videocut-core` 的纯函数覆盖尚可，但四条关键路径里只有 `align` 覆盖了一部分文本重建逻辑；`download / transcribe / cut` 基本没有真实路径测试。严格按 `tests/` 目录看，clips 没有可执行集成测试，只有 fixtures。

阻塞项是测试本身不绿：`videocut-align` 和 `videocut-transcribe` 各有一个 helper script path 测试失败，且没有 `#[ignore]` 标记。

## Coverage Numbers

统计口径：Rust 源码行按 `src/**/*.rs` 计；测试行包括 inline `#[cfg(test)]` 模块和 `src/tests.rs`。`tests/` 目录单独说明。

| Crate | Source LOC | Test LOC | Test/Source | Tests |
|---|---:|---:|---:|---:|
| `nf-source` | 278 | 0 | 0.0% | 0 |
| `videocut-download` | 230 | 23 | 10.0% | 3 |
| `videocut-transcribe` | 451 | 30 | 6.7% | 2 |
| `videocut-align` | 484 | 82 | 16.9% | 5 |
| `videocut-cut` | 241 | 23 | 9.5% | 2 |
| `videocut-core` | 682 | 400 | 58.7% | 23 |
| **Total** | **2366** | **558** | **23.6%** | **35** |

Strict `tests/` 口径：`tests/fixtures/clips/demo.srt` 只有 15 行 fixture；没有 `tests/**/*.rs` clips 集成测试。因此严格 `tests/` executable coverage = **0%**。

## Test Run

Commands audited:

```bash
cargo test -p videocut-core -p videocut-download -p videocut-transcribe -p videocut-align -p videocut-cut -p nf-source -- --list
cargo test -p videocut-core -p videocut-download -p videocut-transcribe -p videocut-align -p videocut-cut -p nf-source
cargo test --no-fail-fast -p videocut-core -p videocut-download -p videocut-transcribe -p videocut-align -p videocut-cut -p nf-source
```

Result:

| Package | Result | Notes |
|---|---|---|
| `nf-source` | green | 0 tests |
| `videocut-core` | green | 23 passed |
| `videocut-download` | green | 3 passed |
| `videocut-cut` | green | 2 passed |
| `videocut-align` | red | `align_script_resolves_from_source_tree` fails: `python/align_ffa.py not found` |
| `videocut-transcribe` | red | `whisper_script_resolves_from_source_tree` fails: `python/whisper_transcribe.py not found`; error text says `SPLICE_WHISPER_SCRIPT` while code reads `VIDEOCUT_WHISPER_SCRIPT` |

Final `--no-fail-fast` verification failed with 2 targets: `-p videocut-align --lib` and `-p videocut-transcribe --lib`.

Ignored/skipped tests: `rg "#\[ignore\]"` found **0** ignored tests.

## Priority Backlog

### P0

1. Make the current clips test set green and hermetic.
   - `videocut-align` must not depend on a missing repo-level `python/align_ffa.py`.
   - `videocut-transcribe` must not depend on a missing repo-level `python/whisper_transcribe.py`.
   - Either commit the helper scripts, or rewrite these tests to use temp helper fixtures through env overrides.
   - Fix transcribe error hint from `SPLICE_WHISPER_SCRIPT` to `VIDEOCUT_WHISPER_SCRIPT`.

2. Add one hermetic smoke test for each critical command path.
   - `download`: fake `yt-dlp` + fake `ffprobe`, assert `source.mp4`, `meta.json`, missing-title failure, non-zero exit.
   - `transcribe`: fake `ffmpeg`, fake `ffprobe`, fake Python helper, assert `audio.wav`, `words.json`, `sentences.json`, `sentences.srt`, `meta.json`.
   - `align`: fake `ffmpeg` + fake align helper, assert SRT -> aligned sentence bundle and output metadata.
   - `cut`: fake or generated media path with controlled `ffmpeg/ffprobe`, assert clips, `cut_report.json`, progress events, failed clip reporting.

3. Cover `cut_plan` behavior beyond preview text.
   - Missing sentence id, `from > to`, invalid sentence span, margin clamping at 0/end, ffmpeg failure, ffprobe failure, duration mismatch.

### P1

1. Add `nf-source` CLI integration tests with `assert_cmd` or equivalent.
   - Parse required args/defaults for `download/transcribe/align/cut`.
   - Assert JSON stdout shape and NDJSON progress for `cut`.
   - Assert failures bubble with useful context.

2. Add transcribe edge tests.
   - Multi-chunk planning at boundary `chunk_duration + 1s`.
   - Overlap duplicate removal in `transcribe_chunks`.
   - Empty/invalid helper JSON, helper stderr, language fallback, `jobs=0` clamp.

3. Add align data validation tests.
   - Empty units, empty unit text, reversed span, empty helper language fallback, invalid SRT block.
   - Punctuation reconstruction for unmatched tokens, repeated words, quotes/brackets, mixed CJK/Latin.

4. Automate clips fixtures.
   - `tests/fixtures/README.md` documents generating `demo.mp4`, but `Makefile` has no `fixtures` target.
   - Add a small generated mp4 fixture path or a test-local generator so media-path tests can run in CI.

### P2

1. Add schema round-trip/snapshot tests for output artifacts.
   - `DownloadMetadata`, `Sentences`, `WordsFile`, `CutReport`, preview timelines.

2. Add property-style tests for pure helpers.
   - Time clamp/format invariants.
   - Sentence id lookup uniqueness assumptions.
   - SRT render/parse compatibility where applicable.

3. Add docs/guide consistency checks.
   - `nf-guide/flows/clips/guide.md` says clips code steps use bare CLI and not `nf-source`; current audit scope includes `nf-source` wrappers. A small doc-contract test would catch drift.

## Path Table

| Path | Existing test | Quality | Missing |
|---|---|---|---|
| `tests/fixtures/clips/` | `demo.srt`; README documents untracked `demo.mp4` generation | Fixture only; no executable test | No `tests/**/*.rs`; no automated fixture generation; no CI media smoke |
| `crates/nf-source/src/cli.rs` | none | none | CLI parse/default tests; required arg errors; command enum coverage |
| `crates/nf-source/src/cmd_download.rs` | none | none | JSON stdout contract; arg mapping to `DownloadOptions`; failure propagation |
| `crates/nf-source/src/cmd_transcribe.rs` | none | none | JSON stdout contract; arg mapping; `jobs` default/zero behavior through library |
| `crates/nf-source/src/cmd_align.rs` | none | none | JSON stdout contract; arg mapping; language default |
| `crates/nf-source/src/cmd_cut.rs` | none | none | NDJSON progress contract; `cut_report.json` write; summary stderr; partial failure behavior |
| `crates/videocut-download/src/lib.rs` | 3 pure helper tests: format selector, empty stderr text, epoch date conversion | Low | No fake `yt-dlp`; no `download()` success/failure; no missing title/output; no metadata JSON assertion; no cleanup/idempotency |
| `crates/videocut-transcribe/src/chunk.rs` | short audio remains single chunk | Low | No long chunk splitting, overlap boundaries, zero/non-finite duration, `slice_wav` failure |
| `crates/videocut-transcribe/src/lib.rs` | helper script path resolution test, currently failing | Very low/red | No `transcribe()` smoke; no fake Python helper; no chunk merge overlap tests; no output artifact tests; no helper JSON/error tests |
| `crates/videocut-transcribe/src/audio.rs` | none | none | No `ffmpeg` slice command tests; no failure path |
| `crates/videocut-transcribe/src/logger.rs` | none | none | No append/flush/error behavior |
| `crates/videocut-align/src/lib.rs` | indirect through `src/tests.rs`; script path test currently failing | Medium for text logic, red for helper path | No full `align()` smoke; no output artifact assertions; no `validate_output` negative cases |
| `crates/videocut-align/src/text.rs` | English punctuation, CJK char units, empty SRT, `auto` normalization | Medium | Repeated tokens, unmatched align units, mixed language spacing, invalid SRT timestamp, quote/bracket edge cases |
| `crates/videocut-align/src/script.rs` | path resolution only, currently failing | Very low/red | No fake helper process; no stdin payload assertion; no stderr/non-zero/invalid JSON |
| `crates/videocut-cut/src/lib.rs` | 2 text-preview tests | Very low | No `cut_plan`; no missing/invalid sentence range; no margin clamp; no ffmpeg/ffprobe failures; no duration mismatch; no progress events |
| `crates/videocut-core/src/sentence.rs` | split, path resolve file/dir, lookup | Medium | No read/write round trip; no malformed JSON; no `total_sentences` invariant; duplicate ids |
| `crates/videocut-core/src/srt.rs` | multiline blocks, missing indexes | Medium-low | No invalid timestamp format; no CRLF rendering round trip; no empty text-only edge |
| `crates/videocut-core/src/plan.rs` | JSON round trip with optional sections | Low | No invalid ranges/duplicate ids/schema validation because none exists |
| `crates/videocut-core/src/media.rs` | stderr formatting only | Very low | No fake `ffmpeg/ffprobe`; no duration parse errors; no command status failures |
| `crates/videocut-core/src/fs.rs` | missing/file/dir removal | Good | Symlink behavior and permission errors not covered |
| `crates/videocut-core/src/time.rs` | timestamp, clamp, invalid seconds, HMS | Good | Extreme overflow and precision edge cases only partially covered |
| `crates/videocut-core/src/preview.rs` | word remap, missing sentence, clamp | Medium | No preview manifest write/read; no duplicate/missing clip report integration |
| `crates/videocut-core/src/cut_report.rs` | minimal serialization | Low | No read/write round trip; no failed clip serialization; no schema snapshots |
| `crates/videocut-core/src/python.rs` | env/preferred/fallback resolution | Good | Env mutation is serialized; no invalid path/executable check by design |

## D3 Gate Assessment

Fail for D3.

Reasons:

- Current relevant `cargo test` is red.
- Strict `tests/` executable coverage is 0%.
- `nf-source` has no tests.
- Critical paths mostly test helper string logic, not pipeline behavior or external tool failure handling.
- Edge cases most likely to break real clips jobs, especially helper-process errors, media command failures, and cut plan mismatches, are not covered.
