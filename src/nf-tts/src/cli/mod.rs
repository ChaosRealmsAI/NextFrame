//! cli module exports
pub(crate) mod args;
pub(crate) mod batch;
pub(crate) mod concat;
pub(crate) mod config_cmd;
pub(crate) mod play;
pub(crate) mod preview;
pub(crate) mod synth;
pub(crate) mod voices;

use anyhow::Result;

pub use args::{Cli, Command, ConfigAction};

pub(crate) const LONG_ABOUT: &str = r#"nf-tts · Multi-backend TTS CLI · agent-friendly · 中文原生.

═══ OUTPUT (default · 4 files · flat into -d) ═══════════════════════════════

  <stem>.mp3            audio
  <stem>.timeline.json  word-level timing (flat `words[]` + `segments` dual schema)
  <stem>.srt            SubRip subtitles
  <stem>.karaoke.html   self-contained word-highlight player (double-click to play)

Pass --no-sub to skip subtitles/karaoke (audio only).
Pass --subdir to nest under `{dir}/{stem}/` (legacy).

═══ BACKENDS ═══════════════════════════════════════════════════════════════

  edge        FREE · reverse-engineered Edge browser TTS · DEFAULT · debug/drafts
  volcengine  PAID (¥2/万字, seed-tts-2.0) · 豆包 · production · -b volcengine

═══ VOICE SELECTION · zh-CN 主力 5 (Edge free) ════════════════════════════

  zh-CN-XiaoxiaoNeural    年轻女 · 亲和 · DEFAULT · 讲解/客服/视频配音
  zh-CN-YunxiNeural       中年男 · 稳 · 新闻/教育/商务
  zh-CN-YunjianNeural     磁性男 · 低沉 · 体育/纪录片
  zh-CN-XiaoyiNeural      年轻女 · 活泼 · 生活向/快消
  zh-CN-YunyangNeural     播音员 · 正式 · 严肃场合

  Full list:  nf-tts voices --lang zh        (322 voices · 74 langs · edge)
              nf-tts voices -b volcengine    (volcengine voice catalog)
  Preview:    nf-tts preview --voice <name>  (hear a sample)

═══ QUALITY TIPS · Edge 免费接口 (唯一 3 个杠杆) ═══════════════════════════

1. PUNCTUATION is the ONLY pause control (Edge 无 SSML <break>/<emphasis>):

     。     long pause (sentence end)     ~500-800ms
     ！？   long pause + tone             ~500-800ms
     ，     medium pause (clause)         ~200-300ms
     ；     medium-long pause (semicolon) ~300-400ms
     ：     medium pause + preview (colon · implies continuation)
     、     short pause (list separator)  ~100ms
     space  ultra-short · nearly none

   WRITING RULES:
     - Long sentences MUST have "，" every 10-15 CJK chars (else robotic)
     - Lists use "、" not "，" (natural enumeration rhythm)
     - Stress a word by placing "，" after it:   "这个特别，重要"
     - Never dump 20+ chars without any punctuation

2. --rate  (Edge prosody rate · one of the only 3 tunables):

     -20%   老年讲故事 / 严肃新闻     (slow, grave)
     -10%   讲解稳  · RECOMMENDED     (calm narration)
     +0%    default                   (slightly fast)
     +15%   快消广告 / 年轻活力       (energetic)
     +30%   extreme · not recommended

3. --pitch  (Edge prosody pitch · range ~ -5Hz to +5Hz):

     +0Hz   default
     -2Hz   更沉稳 · male voice recommended
     +2Hz   更年轻 · livelier
     -5Hz   deep/authoritative        (extreme low)
     +5Hz   youthful/chirpy           (extreme high)

4. --volume  keep +0% usually · post-mixing handles loudness better

═══ EDGE 不能做的 · 常见误区 (DO NOT pass these expecting effect) ═════════

  ❌ 情感 style (cheerful/sad/empathy)    · only volcengine
  ❌ --emotion / --emotion-scale          · Edge ignores silently, no error
  ❌ SSML <break> / <emphasis> / <phoneme>· Microsoft blocks non-Edge SSML
  ❌ Multi-talker dialog                  · paid Azure only
  ❌ Custom dictionary / lexicon          · paid Azure only
  ❌ --context-text / --dialect           · volcengine-only TTS 2.0 features

  If you need style/emotion  →  switch to `-b volcengine`.

═══ DURATION ESTIMATION (char count → audio seconds) ══════════════════════

  Rule of thumb at default rate (+0%) · Edge zh-CN XiaoxiaoNeural:
    CJK char (含标点 · 自然节奏): ~220ms each  → N seconds = N × 4.5 chars
    Pure English word (avg 5 letters):  ~300-400ms each
    Heavy punctuation (every 8-10 chars): +10-15% total

  Quick targets (目标时长 → 写多少 CJK 字 · 含标点):
    10 s   →  40-50 chars
    15 s   →  60-75 chars
    20 s   →  85-100 chars
    25 s   →  110-130 chars
    30 s   →  135-160 chars
    60 s   →  270-320 chars (考虑断段)

  Rate effect:  --rate -10% ≈ 1.1× longer · +15% ≈ 0.87× shorter.
  If target shot is tight (e.g. 15s exactly) · write short, measure once,
  adjust char count by observed_ms / target_ms.

═══ LONG TEXT STRATEGY ════════════════════════════════════════════════════

  Edge:       stable 300-1000 chars single call
  Volcengine: stable 200-400 chars · 800+ chars = split into paragraphs
  超长 (2000+):
    1. Split by paragraph (200-400 chars each · NOT by sentence — loses tone)
    2. nf-tts batch jobs.json        (concurrent synth)
    3. nf-tts concat p1.mp3 p2.mp3 -o full.mp3

═══ COMMON MISTAKES ═══════════════════════════════════════════════════════

  1. 一口气塞 1500+ chars to Edge      → WS timeout risk · split it
  2. 中英混写无空格 "NextFramework"    → whisperX 逐字母切 · use "Next Framework"
  3. 长句无标点                         → mechanical tone · add "，" every 10-15 chars
  4. 期待 --emotion 在 Edge 生效       → silent ignore · use -b volcengine
  5. --rate +40% 超过 30%              → robotic · clamp within ±30%
  6. 用 --subdir 后 karaoke.html 仍 open 根目录 → layouts differ · check actual path
  7. 传 SSML 标签到 text (e.g. <break>) → Edge rejects · use punctuation instead
  8. 字符数随便估 → 时长不准            → use DURATION ESTIMATION table above

═══ EXAMPLES ══════════════════════════════════════════════════════════════

  # Default (4-product bundle · free Edge · flat output)
  nf-tts synth "这是一段，配好标点，的，中文 TTS 演示。" -o demo.mp3
  # → demo.mp3 · demo.timeline.json · demo.srt · demo.karaoke.html

  # Slower for narration + male voice
  nf-tts synth "讲解文案，慢一点。" --voice zh-CN-YunxiNeural --rate -10% -o vid.mp3

  # Quick listen (no files saved)
  nf-tts play "sample text" --voice zh-CN-XiaoyiNeural

  # List available zh voices
  nf-tts voices --lang zh

  # Long text split + concat
  echo '[{"text":"段1...","filename":"p1"},{"text":"段2...","filename":"p2"}]' \
    | nf-tts batch -d out
  nf-tts concat out/p1.mp3 out/p2.mp3 -o full.mp3

  # Paid production with emotion
  nf-tts synth -b volcengine --emotion news "正式播报内容。" -o news.mp3

  # TTS 2.0 context hint (volcengine only)
  nf-tts synth -b volcengine --context-text "用特别开心的语气" \
    "今天天气真好！" -o happy.mp3

  # Dialect (volcengine · vivi voice only)
  nf-tts play -b volcengine --dialect dongbei "整挺好"

═══ VERIFY (one-liner) ════════════════════════════════════════════════════

  jq '{duration_ms, voice, words: (.words|length)}' <stem>.timeline.json

═══ SEE ALSO ══════════════════════════════════════════════════════════════

  nf-tts synth --help     synth-specific flags
  nf-tts batch --help     batch JSON schema
  nf-tts voices --help    voice listing
  nf-tts concat --help    mp3 concatenation
"#;

pub async fn run(cli: Cli) -> Result<()> {
    if cli.brief {
        crate::output::write_stdout_line(format_args!(
            "vox — multi-backend TTS CLI, agent-friendly"
        ));
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
        Command::Concat { files, output } => concat::run(&files, &output),
        Command::Config { action } => match action {
            ConfigAction::Set { key, value } => config_cmd::run_set(&key, &value),
            ConfigAction::Get { key } => config_cmd::run_get(key),
        },
    }
}
