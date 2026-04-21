//! cli args helpers
use clap::{Args, Parser, Subcommand};

use super::{play::PlayCommand, synth::SynthCommand};

#[derive(Parser)]
#[command(name = "vox", version, about = "Multi-backend TTS CLI, agent-friendly", long_about = super::LONG_ABOUT)]
pub struct Cli {
    /// Print one-line description and exit.
    #[arg(long)]
    pub brief: bool,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {
    /// Synthesize text to mp3 + word-level subtitles + karaoke HTML.
    #[command(long_about = SYNTH_LONG_ABOUT)]
    Synth(SynthArgs),
    /// Batch synthesize from JSON (file or stdin).
    #[command(long_about = BATCH_LONG_ABOUT)]
    Batch(BatchArgs),
    /// Synthesize and play immediately (no file saved).
    Play(PlayArgs),
    /// Preview a voice with a short sample.
    Preview {
        /// Voice name (e.g. zh-CN-XiaoxiaoNeural · see `nf-tts voices --lang zh`).
        #[arg(short, long)]
        voice: Option<String>,

        /// Custom preview text (default: a short sample).
        #[arg(short, long)]
        text: Option<String>,

        /// TTS backend: "edge" (free, default) or "volcengine" (paid).
        #[arg(short, long)]
        backend: Option<String>,
    },
    /// List available voices (edge: 322 across 74 langs · volcengine: catalog).
    #[command(long_about = VOICES_LONG_ABOUT)]
    Voices {
        /// Filter by language prefix (e.g. "zh" for zh-CN/zh-HK/zh-TW · "en" · "ja").
        #[arg(short, long)]
        lang: Option<String>,

        /// TTS backend: edge (default) or volcengine.
        #[arg(short, long)]
        backend: Option<String>,
    },
    /// Concatenate multiple mp3 files into one.
    Concat {
        /// Input MP3 files in order.
        files: Vec<String>,

        /// Output file path.
        #[arg(short = 'o', long, default_value = "combined.mp3")]
        output: String,
    },
    /// Manage configuration (voice aliases, defaults).
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
}

/// Long help for `synth` subcommand · surfaces the quality playbook.
const SYNTH_LONG_ABOUT: &str = r#"Synthesize text to audio + timing + subtitles + karaoke HTML.

DEFAULT OUTPUT (4 files · flat into -d):
  <stem>.mp3            audio (mp3, 24kHz · edge default voice: zh-CN-XiaoxiaoNeural)
  <stem>.timeline.json  word-level timing { duration_ms, voice, words[{text,start_ms,end_ms}], segments }
  <stem>.srt            SubRip subtitles (segment-level)
  <stem>.karaoke.html   self-contained player (open in browser, word-sync highlight)
  (disable with --no-sub for audio-only · --subdir for legacy nested layout)

QUALITY PLAYBOOK (Edge free backend):
  1. PUNCTUATION is the only pause control.
     "。" = long (~600ms) · "，" = medium (~250ms) · "、" = short (~100ms)
     Long sentences: insert "，" every 10-15 CJK chars.
     Lists: use "、" between items not "，".
  2. --rate  -10% for narration · +0% default · +15% for快消 · clamp ±30%.
  3. --pitch -2Hz sober male · +0Hz default · +2Hz youthful · range ±5Hz.
  4. --volume keep +0% · post-mix instead.

EDGE CAN'T DO (do not pass with -b edge · ignored silently):
  --emotion  --emotion-scale  --context-text  --dialect
  SSML <break>/<emphasis>/<style>  multi-talker
  → switch to -b volcengine for any of these.

VOICE RECOMMENDATIONS (zh-CN · edge · all free):
  XiaoxiaoNeural  亲和 · 讲解/客服 · DEFAULT
  YunxiNeural     稳 · 新闻/商务 (male)
  YunjianNeural   磁性 · 体育/纪录片 (male)
  XiaoyiNeural    活泼 · 快消/生活
  YunyangNeural   正式 · 播音员 (male)
  (preview: `nf-tts preview --voice zh-CN-YunxiNeural`)

EXAMPLES:
  # Default 4-product bundle
  nf-tts synth "这是一段，配好标点，的，中文演示。" -o demo.mp3

  # Narrator pace + male voice
  nf-tts synth "讲解文案。" --voice zh-CN-YunxiNeural --rate -10% -o vid.mp3

  # Audio only (no subtitles/karaoke)
  nf-tts synth "只要音频" -o only.mp3 --no-sub

  # Paid production with emotion
  nf-tts synth -b volcengine --emotion news "正式播报。" -o news.mp3

  # TTS 2.0 natural-language style (volcengine only)
  nf-tts synth -b volcengine --context-text "用特别开心的语气" \
    "今天真好！" -o happy.mp3

See `nf-tts --help` for voice catalog, long-text strategy, common mistakes.
"#;

/// Long help for `batch` subcommand · JSON schema + semantics.
const BATCH_LONG_ABOUT: &str = r#"Batch synthesize from JSON array (file or stdin `-`).

JSON SCHEMA (array of job objects):
  [
    {
      "text":       "必填 · 要合成的文字",
      "id":         1,                                      // optional, auto-assigned
      "voice":      "zh-CN-XiaoxiaoNeural",                 // optional, overrides --voice
      "filename":   "seg01",                                // optional, without extension
      "backend":    "edge" | "volcengine",                  // optional, overrides -b
      "rate":       "+0%", "volume": "+0%", "pitch": "+0Hz", // edge-only
      "emotion":    "happy",  "emotion_scale": 3,           // volcengine-only
      "speech_rate":0, "loudness_rate": 0, "volc_pitch": 0, // volcengine-only
      "context_text":"用新闻的语气",                          // volcengine-only
      "dialect":    "dongbei"                               // volcengine vivi only
    },
    ...
  ]

DEFAULTS:
  - Output files go into -d (same naming as `synth`)
  - Each job produces: {filename}.mp3 + .timeline.json + .srt + .karaoke.html
  - Subtitles ON by default · --no-sub to disable for ALL jobs
  - Concurrency: controlled by backend (edge=3, volcengine follows token limit)
  - Jobs are synthesized in parallel within concurrency limit · cache shared

USE CASES:
  - Long article split into paragraphs (preserves tone continuity per segment)
  - A/B test same text across 5 different voices
  - Multilingual video: one job per subtitle language track

EXAMPLES:
  # File input
  nf-tts batch jobs.json -d out

  # Stdin input
  echo '[{"text":"hello","voice":"en-US-AriaNeural"}]' | nf-tts batch -d out

  # Dry run (plan only, no synthesis)
  nf-tts batch jobs.json -d out --dry-run

  # Override default backend for the whole batch
  nf-tts batch jobs.json -d out -b volcengine
"#;

/// Long help for `voices` subcommand.
const VOICES_LONG_ABOUT: &str = r#"List available voices from the chosen backend.

OUTPUT:
  Default: human-readable table (name · gender · locale · sample rate).
  --format json emits one voice per line for piping.

EDGE (free · default):
  322 voices · 74 languages. Naming: {locale}-{Name}Neural.
  Popular zh-CN: Xiaoxiao / Yunxi / Yunjian / Xiaoyi / Yunyang
  Popular en-US: Aria / Guy / Jenny / Davis

VOLCENGINE (paid):
  Curated voice catalog · seed-tts-2.0 multi-style support.
  Voices: zh_female_*, zh_male_*, zh_vivi (dialect-capable).

EXAMPLES:
  nf-tts voices                        # all edge voices
  nf-tts voices --lang zh              # zh-CN/HK/TW only
  nf-tts voices --lang en              # en-* only
  nf-tts voices -b volcengine          # volcengine catalog
  nf-tts voices --lang ja -b edge      # Japanese edge voices
"#;

#[derive(Args)]
pub struct SynthArgs {
    /// Text to synthesize (omit to read from stdin).
    pub text: Option<String>,

    /// Read text from file.
    #[arg(short, long)]
    pub file: Option<String>,

    /// Voice name or alias (auto-detected if omitted).
    #[arg(short, long)]
    pub voice: Option<String>,

    /// Speech rate (e.g. "+20%", "-10%"). Edge only. Accepts leading `-` via `allow_hyphen_values`.
    #[arg(long, default_value = "+0%", allow_hyphen_values = true)]
    pub rate: String,

    /// Volume (e.g. "+0%"). Edge only. Accepts leading `-`.
    #[arg(long, default_value = "+0%", allow_hyphen_values = true)]
    pub volume: String,

    /// Pitch (e.g. "+0Hz", "-2Hz"). Edge only. Accepts leading `-`.
    #[arg(long, default_value = "+0Hz", allow_hyphen_values = true)]
    pub pitch: String,

    /// Output directory.
    #[arg(short = 'd', long, default_value = ".")]
    pub dir: String,

    /// Output filename (auto-generated if omitted).
    #[arg(short = 'o', long)]
    pub output: Option<String>,

    /// Skip subtitle generation (timeline.json + SRT are ON by default).
    #[arg(long)]
    pub no_sub: bool,

    /// Nest output under `{dir}/{stem}/` instead of writing flat into `-d`.
    /// Default is flat: `{dir}/{stem}.mp3` + `.timeline.json` + `.srt`.
    #[arg(long)]
    pub subdir: bool,

    /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
    #[arg(short, long)]
    pub backend: Option<String>,

    /// Emotion (volcengine). Available: happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story.
    #[arg(long)]
    pub emotion: Option<String>,

    /// Emotion intensity 1-5 (volcengine, requires --emotion).
    #[arg(long)]
    pub emotion_scale: Option<f32>,

    /// Speech speed -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
    #[arg(long)]
    pub speech_rate: Option<i32>,

    /// Volume -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
    #[arg(long)]
    pub loudness_rate: Option<i32>,

    /// Pitch shift -12 to 12 semitones. Volcengine only.
    #[arg(long)]
    pub volc_pitch: Option<i32>,

    /// TTS 2.0 emotional or style context hint (for example "speak in an especially cheerful tone"). Volcengine only.
    #[arg(long)]
    pub context_text: Option<String>,

    /// Dialect: dongbei/shaanxi/sichuan. Volcengine vivi voice only.
    #[arg(long)]
    pub dialect: Option<String>,
}

#[derive(Args)]
pub struct BatchArgs {
    /// Path to JSON file with jobs array. Use "-" for stdin.
    #[arg(default_value = "-")]
    pub input: String,

    /// Output directory.
    #[arg(short = 'd', long, default_value = ".")]
    pub dir: String,

    /// Default voice for jobs without explicit voice.
    #[arg(short, long)]
    pub voice: Option<String>,

    /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
    #[arg(short, long)]
    pub backend: Option<String>,

    /// Skip subtitle generation for each job (timeline.json + SRT are ON by default).
    #[arg(long)]
    pub no_sub: bool,

    /// Dry run: show plan without synthesizing.
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Args)]
pub struct PlayArgs {
    /// Text to synthesize and play.
    pub text: String,

    /// Voice name or alias (auto-detected if omitted).
    #[arg(short, long)]
    pub voice: Option<String>,

    /// Speech rate (e.g. "-10%"). Edge only.
    #[arg(long, default_value = "+0%", allow_hyphen_values = true)]
    pub rate: String,

    /// Volume. Edge only.
    #[arg(long, default_value = "+0%", allow_hyphen_values = true)]
    pub volume: String,

    /// Pitch (e.g. "-2Hz"). Edge only.
    #[arg(long, default_value = "+0Hz", allow_hyphen_values = true)]
    pub pitch: String,

    /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
    #[arg(short, long)]
    pub backend: Option<String>,

    /// Emotion (volcengine). Available: happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story.
    #[arg(long)]
    pub emotion: Option<String>,

    /// Emotion intensity 1-5 (volcengine, requires --emotion).
    #[arg(long)]
    pub emotion_scale: Option<f32>,

    /// Speech speed -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
    #[arg(long)]
    pub speech_rate: Option<i32>,

    /// Volume -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
    #[arg(long)]
    pub loudness_rate: Option<i32>,

    /// Pitch shift -12 to 12 semitones. Volcengine only.
    #[arg(long)]
    pub volc_pitch: Option<i32>,

    /// TTS 2.0 emotional/style context hint. Volcengine only.
    #[arg(long)]
    pub context_text: Option<String>,

    /// Dialect: dongbei/shaanxi/sichuan. Volcengine vivi voice only.
    #[arg(long)]
    pub dialect: Option<String>,
}

#[derive(Subcommand)]
pub enum ConfigAction {
    /// Set a config value.
    Set {
        /// Key: voice, dir, backend, alias.<name>
        key: String,
        /// Value to set.
        value: String,
    },
    /// Get a config value (or all if no key).
    Get {
        /// Key to get (omit for all).
        key: Option<String>,
    },
}

impl From<SynthArgs> for SynthCommand {
    fn from(args: SynthArgs) -> Self {
        Self {
            text: args.text,
            file: args.file,
            voice: args.voice,
            rate: args.rate,
            volume: args.volume,
            pitch: args.pitch,
            dir: args.dir,
            output: args.output,
            gen_srt: !args.no_sub,
            subdir: args.subdir,
            backend_name: args.backend,
            emotion: args.emotion,
            emotion_scale: args.emotion_scale,
            speech_rate: args.speech_rate,
            loudness_rate: args.loudness_rate,
            volc_pitch: args.volc_pitch,
            context_text: args.context_text,
            dialect: args.dialect,
        }
    }
}

impl From<PlayArgs> for PlayCommand {
    fn from(args: PlayArgs) -> Self {
        Self {
            text: args.text,
            voice: args.voice,
            rate: args.rate,
            volume: args.volume,
            pitch: args.pitch,
            backend_name: args.backend,
            emotion: args.emotion,
            emotion_scale: args.emotion_scale,
            speech_rate: args.speech_rate,
            loudness_rate: args.loudness_rate,
            volc_pitch: args.volc_pitch,
            context_text: args.context_text,
            dialect: args.dialect,
        }
    }
}
