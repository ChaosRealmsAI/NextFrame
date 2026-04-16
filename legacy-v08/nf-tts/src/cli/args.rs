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
    /// Synthesize text to audio file.
    Synth(SynthArgs),
    /// Batch synthesize from JSON (file or stdin). JSON fields: text (required), id, voice, filename, backend, rate, volume, pitch, emotion, emotion_scale, speech_rate, loudness_rate, volc_pitch, context_text, dialect.
    Batch(BatchArgs),
    /// Synthesize and play immediately (no file saved).
    Play(PlayArgs),
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

    /// Speech rate (e.g. "+20%", "-10%"). Edge only.
    #[arg(long, default_value = "+0%")]
    pub rate: String,

    /// Volume (e.g. "+0%"). Edge only.
    #[arg(long, default_value = "+0%")]
    pub volume: String,

    /// Pitch (e.g. "+0Hz"). Edge only.
    #[arg(long, default_value = "+0Hz")]
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

    /// Speech rate. Edge only.
    #[arg(long, default_value = "+0%")]
    pub rate: String,

    /// Volume. Edge only.
    #[arg(long, default_value = "+0%")]
    pub volume: String,

    /// Pitch. Edge only.
    #[arg(long, default_value = "+0Hz")]
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
