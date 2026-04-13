pub mod batch;
pub mod concat;
pub mod config_cmd;
pub mod play;
pub mod preview;
pub mod synth;
pub mod voices;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "vox", version, about = "Multi-backend TTS CLI, agent-friendly", long_about = "\
Multi-backend TTS CLI, agent-friendly.\n\n\
Workflow: use Edge (free) to debug text/timing/subtitles, then switch to\n\
volcengine (-b volcengine) for production. Same flags, same output.\n\n\
Backends:\n\
  edge        Free. Microsoft Edge TTS. Default. For debugging and drafts.\n\
  volcengine  Paid (¥2/万字, seed-tts-2.0). Production quality. Use -b volcengine.\n\n\
Common flags (both backends):\n\
  --no-sub           Skip subtitle generation (on by default)\n\
  -v, --voice        Voice name (auto-detected from text language if omitted)\n\
  -o, --output       Output filename\n\
  -d, --dir          Output directory\n\n\
Volcengine-only flags:\n\
  --speech-rate <-50~100>    Speech speed (-50=0.5x, 0=normal, 100=2x)\n\
  --loudness-rate <-50~100>  Volume (-50=0.5x, 0=normal, 100=2x)\n\
  --volc-pitch <-12~12>     Pitch shift in semitones\n\
  --emotion <TYPE>           happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story\n\
  --emotion-scale <1-5>     Emotion intensity (only with --emotion)\n\
  --context-text <TEXT>      TTS 2.0 style hint (e.g. \"用开心的语气说话\")\n\
  --dialect <TYPE>           dongbei/shaanxi/sichuan (vivi voice only)\n\n\
Edge-only flags (for debugging, volcengine does not use these):\n\
  --rate               Speech rate (e.g. \"+20%\", \"-10%\")\n\
  --volume             Volume (e.g. \"+0%\")\n\
  --pitch              Pitch (e.g. \"+0Hz\")\n\n\
Subtitle generation (default ON):\n\
  Subtitles use whisperX forced alignment (wav2vec2 CTC).\n\
  Original text is preserved verbatim; timestamps come from acoustic alignment.\n\
  Output: <name>.timeline.json (word-level, primary) + <name>.srt (segment-level).\n\
  Files are placed in a subdirectory named after the output file.\n\
  Use --no-sub to skip subtitle generation.\n\n\
Text length (volcengine):\n\
  Best:  200-400 chars per call. Natural tone, no timeout.\n\
  OK:    400-800 chars. May take 20-30s, still one coherent piece.\n\
  Long:  800+ chars → split into 200-400 char paragraphs, use batch + concat.\n\
  Limit: ~1000 chars per call. Beyond that → timeout risk.\n\
  Tip:   longer text = better tone continuity. Split by paragraph, not sentence.\n\n\
Examples:\n\
  # Synthesize with subtitles (default: MP3 + timeline.json + SRT)\n\
  vox synth \"测试文本\" -o test.mp3                  # → test/test.mp3 + .timeline.json + .srt\n\
  vox synth \"测试\" -o test.mp3 --no-sub             # audio only, no subtitles\n\
  vox play \"hello world\"                           # quick listen (no files saved)\n\n\
  # Production with volcengine (same workflow, add -b volcengine)\n\
  vox synth -b volcengine \"正式文本\" -o out.mp3\n\
  vox play -b volcengine \"你好世界\"\n\
  vox voices -b volcengine                          # list voices\n\n\
  # Emotion — only when explicitly requested, non-default\n\
  vox synth -b volcengine --emotion angry \"我很生气！\" -o angry.mp3\n\n\
  # TTS 2.0 context — guide tone/emotion via natural language\n\
  vox synth -b volcengine --context-text \"用特别开心的语气\" \"今天天气真好！\" -o happy.mp3\n\n\
  # Dialect — vivi voice only\n\
  vox play -b volcengine --dialect dongbei \"整挺好\"")]
pub struct Cli {
    /// Print one-line description and exit.
    #[arg(long)]
    pub brief: bool,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand)]
pub enum Command {
    /// Synthesize text to audio file.
    Synth {
        /// Text to synthesize (omit to read from stdin).
        text: Option<String>,

        /// Read text from file.
        #[arg(short, long)]
        file: Option<String>,

        /// Voice name or alias (auto-detected if omitted).
        #[arg(short, long)]
        voice: Option<String>,

        /// Speech rate (e.g. "+20%", "-10%"). Edge only.
        #[arg(long, default_value = "+0%")]
        rate: String,

        /// Volume (e.g. "+0%"). Edge only.
        #[arg(long, default_value = "+0%")]
        volume: String,

        /// Pitch (e.g. "+0Hz"). Edge only.
        #[arg(long, default_value = "+0Hz")]
        pitch: String,

        /// Output directory.
        #[arg(short = 'd', long, default_value = ".")]
        dir: String,

        /// Output filename (auto-generated if omitted).
        #[arg(short = 'o', long)]
        output: Option<String>,

        /// Skip subtitle generation (timeline.json + SRT are ON by default).
        #[arg(long)]
        no_sub: bool,

        /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
        #[arg(short, long)]
        backend: Option<String>,

        /// Emotion (volcengine). Available: happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story.
        #[arg(long)]
        emotion: Option<String>,

        /// Emotion intensity 1-5 (volcengine, requires --emotion).
        #[arg(long)]
        emotion_scale: Option<f32>,

        /// Speech speed -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
        #[arg(long)]
        speech_rate: Option<i32>,

        /// Volume -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
        #[arg(long)]
        loudness_rate: Option<i32>,

        /// Pitch shift -12 to 12 semitones. Volcengine only.
        #[arg(long)]
        volc_pitch: Option<i32>,

        /// TTS 2.0 emotional/style context hint (e.g. "用特别开心的语气说话"). Volcengine only.
        #[arg(long)]
        context_text: Option<String>,

        /// Dialect: dongbei/shaanxi/sichuan. Volcengine vivi voice only.
        #[arg(long)]
        dialect: Option<String>,
    },

    /// Batch synthesize from JSON (file or stdin). JSON fields: text (required), id, voice, filename, backend, rate, volume, pitch, emotion, emotion_scale, speech_rate, loudness_rate, volc_pitch, context_text, dialect.
    Batch {
        /// Path to JSON file with jobs array. Use "-" for stdin.
        #[arg(default_value = "-")]
        input: String,

        /// Output directory.
        #[arg(short = 'd', long, default_value = ".")]
        dir: String,

        /// Default voice for jobs without explicit voice.
        #[arg(short, long)]
        voice: Option<String>,

        /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
        #[arg(short, long)]
        backend: Option<String>,

        /// Skip subtitle generation for each job (timeline.json + SRT are ON by default).
        #[arg(long)]
        no_sub: bool,

        /// Dry run: show plan without synthesizing.
        #[arg(long)]
        dry_run: bool,
    },

    /// Synthesize and play immediately (no file saved).
    Play {
        /// Text to synthesize and play.
        text: String,

        /// Voice name or alias (auto-detected if omitted).
        #[arg(short, long)]
        voice: Option<String>,

        /// Speech rate. Edge only.
        #[arg(long, default_value = "+0%")]
        rate: String,

        /// Volume. Edge only.
        #[arg(long, default_value = "+0%")]
        volume: String,

        /// Pitch. Edge only.
        #[arg(long, default_value = "+0Hz")]
        pitch: String,

        /// TTS backend: "edge" (free, default, for debugging) or "volcengine" (paid, production quality).
        #[arg(short, long)]
        backend: Option<String>,

        /// Emotion (volcengine). Available: happy/angry/sad/surprise/fear/gentle/serious/excited/calm/news/story.
        #[arg(long)]
        emotion: Option<String>,

        /// Emotion intensity 1-5 (volcengine, requires --emotion).
        #[arg(long)]
        emotion_scale: Option<f32>,

        /// Speech speed -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
        #[arg(long)]
        speech_rate: Option<i32>,

        /// Volume -50 (0.5x) to 100 (2x), 0=normal. Volcengine only.
        #[arg(long)]
        loudness_rate: Option<i32>,

        /// Pitch shift -12 to 12 semitones. Volcengine only.
        #[arg(long)]
        volc_pitch: Option<i32>,

        /// TTS 2.0 emotional/style context hint. Volcengine only.
        #[arg(long)]
        context_text: Option<String>,

        /// Dialect: dongbei/shaanxi/sichuan. Volcengine vivi voice only.
        #[arg(long)]
        dialect: Option<String>,
    },

    /// Preview a voice with sample text.
    Preview {
        /// Voice name to preview.
        #[arg(short, long)]
        voice: Option<String>,

        /// Custom preview text.
        #[arg(short, long)]
        text: Option<String>,

        /// TTS backend: "edge" (free, default) or "volcengine" (paid, production quality).
        #[arg(short, long)]
        backend: Option<String>,
    },

    /// List available voices.
    Voices {
        /// Filter by language (e.g. "zh", "en", "ja").
        #[arg(short, long)]
        lang: Option<String>,

        /// TTS backend.
        #[arg(short, long)]
        backend: Option<String>,
    },

    /// Concatenate multiple audio files into one.
    Concat {
        /// Input MP3 files.
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

pub async fn run(cli: Cli) -> Result<()> {
    if cli.brief {
        println!("vox — multi-backend TTS CLI, agent-friendly");
        return Ok(());
    }

    let command = cli
        .command
        .ok_or_else(|| anyhow::anyhow!("no command given. Try 'vox --help'"))?;

    match command {
        Command::Synth {
            text,
            file,
            voice,
            rate,
            volume,
            pitch,
            dir,
            output,
            no_sub,
            backend,
            emotion,
            emotion_scale,
            speech_rate,
            loudness_rate,
            volc_pitch,
            context_text,
            dialect,
        } => {
            synth::run(synth::SynthCommand {
                text,
                file,
                voice,
                rate,
                volume,
                pitch,
                dir,
                output,
                gen_srt: !no_sub,
                backend_name: backend,
                emotion,
                emotion_scale,
                speech_rate,
                loudness_rate,
                volc_pitch,
                context_text,
                dialect,
            })
            .await
        }
        Command::Batch {
            input,
            dir,
            voice,
            backend,
            no_sub,
            dry_run,
        } => batch::run(input, dir, voice, backend, !no_sub, dry_run).await,
        Command::Play {
            text,
            voice,
            rate,
            volume,
            pitch,
            backend,
            emotion,
            emotion_scale,
            speech_rate,
            loudness_rate,
            volc_pitch,
            context_text,
            dialect,
        } => {
            play::run(play::PlayCommand {
                text,
                voice,
                rate,
                volume,
                pitch,
                backend_name: backend,
                emotion,
                emotion_scale,
                speech_rate,
                loudness_rate,
                volc_pitch,
                context_text,
                dialect,
            })
            .await
        }
        Command::Preview { voice, text, backend } => preview::run(voice, text, backend).await,
        Command::Voices { lang, backend } => voices::run(lang, backend).await,
        Command::Concat { files, output } => concat::run(files, output),
        Command::Config { action } => match action {
            ConfigAction::Set { key, value } => config_cmd::run_set(key, value),
            ConfigAction::Get { key } => config_cmd::run_get(key),
        },
    }
}
