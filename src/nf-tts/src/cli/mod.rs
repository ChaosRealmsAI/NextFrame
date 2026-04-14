pub mod args;
pub mod batch;
pub mod concat;
pub mod config_cmd;
pub mod play;
pub mod preview;
pub mod synth;
pub mod voices;

use anyhow::Result;

pub use args::{Cli, Command, ConfigAction};

pub(crate) const LONG_ABOUT: &str = "\
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
  Long:  800+ chars -> split into 200-400 char paragraphs, use batch + concat.\n\
  Limit: ~1000 chars per call. Beyond that -> timeout risk.\n\
  Tip:   longer text = better tone continuity. Split by paragraph, not sentence.\n\n\
Examples:\n\
  # Synthesize with subtitles (default: MP3 + timeline.json + SRT)\n\
  vox synth \"测试文本\" -o test.mp3                  # -> test/test.mp3 + .timeline.json + .srt\n\
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
  vox play -b volcengine --dialect dongbei \"整挺好\"";

pub async fn run(cli: Cli) -> Result<()> {
    if cli.brief {
        println!("vox — multi-backend TTS CLI, agent-friendly");
        return Ok(());
    }

    let command = cli
        .command
        .ok_or_else(|| anyhow::anyhow!("no command given. Try 'vox --help'"))?;

    match command {
        Command::Synth(args) => synth::run(args.into()).await,
        Command::Batch(args) => {
            batch::run(
                args.input,
                args.dir,
                args.voice,
                args.backend,
                !args.no_sub,
                args.dry_run,
            )
            .await
        }
        Command::Play(args) => play::run(args.into()).await,
        Command::Preview {
            voice,
            text,
            backend,
        } => preview::run(voice, text, backend).await,
        Command::Voices { lang, backend } => voices::run(lang, backend).await,
        Command::Concat { files, output } => concat::run(files, output),
        Command::Config { action } => match action {
            ConfigAction::Set { key, value } => config_cmd::run_set(key, value),
            ConfigAction::Get { key } => config_cmd::run_get(key),
        },
    }
}
