# vox

`vox` is an agent-friendly text-to-speech CLI written in Rust. The codebase is structured around a backend trait so multiple TTS providers can be supported, while the current implementation ships with an `edge` backend.

The CLI is designed for both direct terminal use and automation:

- single-shot synthesis to MP3
- batch synthesis from JSON
- voice listing and preview
- subtitle generation from word boundaries
- JSON / NDJSON outputs for scripts and agents
- local content-addressed audio cache

## Status

The backend abstraction is in place, but this repository currently implements only the `edge` backend. Passing any other backend name now fails fast with a clear error instead of being silently ignored.

## Installation

`vox` is currently set up as a local Cargo project.

```bash
cargo build --release
```

Or install it into your Cargo bin directory:

```bash
cargo install --path .
```

Tested with Rust `1.88`.

### Subtitle alignment

Subtitles use [whisperX](https://github.com/m-bain/whisperX) forced alignment
(wav2vec2 CTC) instead of re-transcribing the audio. This keeps the original
text verbatim (punctuation preserved, no Whisper mis-hearing) and gives
acoustically-accurate per-character / per-word timestamps.

Requirements on the host:

```bash
pip install whisperx
```

The Python helper lives in `scripts/align_ffa.py`. The first run of each
language downloads the corresponding wav2vec2 model (~1.3 GB for Chinese) into
`~/.cache/huggingface/`. Set `HF_ENDPOINT=https://hf-mirror.com` to use a
mirror if the default host is slow. Override the script path with
`VOX_ALIGN_SCRIPT` when running from an installed binary outside the source
tree.

## Usage

Show command help:

```bash
cargo run -- --help
cargo run -- synth --help
```

Synthesize inline text:

```bash
cargo run -- synth "Hello from vox" -o hello.mp3
```

Synthesize from a file and emit subtitles when timing metadata is available:

```bash
cargo run -- synth --file notes.txt --voice zh-CN-YunxiNeural --srt -d out
```

List voices:

```bash
cargo run -- voices --lang zh
```

Preview a voice with sample text:

```bash
cargo run -- preview --voice ja-JP-NanamiNeural
```

Play synthesized speech without keeping a final output file:

```bash
cargo run -- play "Quick playback test"
```

Batch synthesize from JSON:

```json
[
  { "id": 0, "text": "Hello world" },
  { "id": 1, "text": "Batch jobs can choose their own voice", "voice": "en-US-AvaNeural" }
]
```

```bash
cargo run -- batch jobs.json -d out
```

Batch jobs without an explicit `filename` are written as sequential files such as `000.mp3`, `001.mp3`, and so on. Batch mode also writes `manifest.json` into the output directory.

Configuration examples:

```bash
cargo run -- config set voice zh-CN-YunxiNeural
cargo run -- config set alias.narrator en-US-EmmaMultilingualNeural
cargo run -- config get
```

## Output Model

`synth` and `batch` emit machine-readable status records:

- single synthesis emits JSON status lines such as `started` and `done`
- batch synthesis emits NDJSON events per job plus a final JSON summary
- cache hits still materialize the expected output file in the target directory

## Architecture

The project is intentionally split into a few small layers:

- `src/cli/`: command parsing and command entrypoints
- `src/backend/`: backend trait, shared synthesis types, and the Edge implementation
- `src/queue/`: batch job model and concurrency-aware scheduler
- `src/cache/`: content-addressed MP3 cache under `.vox-cache/`
- `src/output/`: event emission, manifest writing, file naming, and SRT generation
- `src/config.rs`: persisted defaults and voice aliases
- `src/lang.rs`: lightweight voice auto-selection heuristics

The main execution flow is:

1. Parse CLI input into a command.
2. Resolve backend and synthesis parameters.
3. Reuse cached audio when possible.
4. Synthesize audio and timing metadata from the backend.
5. Write files, emit JSON events, and update the manifest.

## Notes

- `preview` and `play` require a local audio player. On macOS the code uses `afplay`; on other systems it looks for `mpv`, `ffplay`, `aplay`, or `paplay`.
- `concat` performs a raw binary append of MP3 inputs. That is fast, but not a full audio re-mux step.
- There is no open-source license declared yet; `Cargo.toml` is currently marked as `UNLICENSED`.
