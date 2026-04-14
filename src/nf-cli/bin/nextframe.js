#!/usr/bin/env node

const SUBCOMMANDS = {
  new: () => import("../src/commands/timeline/new.js"),
  validate: () => import("../src/commands/timeline/validate.js"),
  build: () => import("../src/commands/timeline/build.js"),
  "lint-scenes": () => import("../src/commands/render/lint-scenes.js"),
  scenes: () => import("../src/commands/render/scenes.js"),
  preview: () => import("../src/commands/render/preview.js"),
  frame: () => import("../src/commands/render/frame.js"),
  render: () => import("../src/commands/render/render.js"),
  "project-new": () => import("../src/commands/project/project-new.js"),
  "project-list": () => import("../src/commands/project/project-list.js"),
  "project-config": () => import("../src/commands/project/project-config.js"),
  "episode-new": () => import("../src/commands/project/episode-new.js"),
  "episode-list": () => import("../src/commands/project/episode-list.js"),
  "pipeline-get": () => import("../src/commands/pipeline/pipeline-get.js"),
  "script-set": () => import("../src/commands/pipeline/script-set.js"),
  "script-get": () => import("../src/commands/pipeline/script-get.js"),
  "audio-set": () => import("../src/commands/pipeline/audio-set.js"),
  "audio-get": () => import("../src/commands/pipeline/audio-get.js"),
  "atom-add": () => import("../src/commands/pipeline/atom-add.js"),
  "atom-list": () => import("../src/commands/pipeline/atom-list.js"),
  "atom-remove": () => import("../src/commands/pipeline/atom-remove.js"),
  "output-add": () => import("../src/commands/pipeline/output-add.js"),
  "output-list": () => import("../src/commands/pipeline/output-list.js"),
  "output-publish": () => import("../src/commands/pipeline/output-publish.js"),
  "segment-new": () => import("../src/commands/project/segment-new.js"),
  "segment-list": () => import("../src/commands/project/segment-list.js"),
  "source-download": () => import("../src/commands/pipeline/source-download.js"),
  "source-transcribe": () => import("../src/commands/pipeline/source-transcribe.js"),
  "source-align": () => import("../src/commands/pipeline/source-align.js"),
  "source-cut": () => import("../src/commands/pipeline/source-cut.js"),
  "source-list": () => import("../src/commands/pipeline/source-list.js"),
  "source-link": () => import("../src/commands/pipeline/source-link.js"),
  "layer-add": () => import("../src/commands/timeline/layers.js"),
  "layer-move": () => import("../src/commands/timeline/layers.js"),
  "layer-resize": () => import("../src/commands/timeline/layers.js"),
  "layer-remove": () => import("../src/commands/timeline/layers.js"),
  "layer-set": () => import("../src/commands/timeline/layers.js"),
  "layer-list": () => import("../src/commands/timeline/layers.js"),
  app: () => import("../src/commands/app/app.js"),
  "app-pipeline": () => import("../src/commands/app/app-pipeline.js"),
  "app-eval": () => import("../src/commands/app/app-eval.js"),
  "app-screenshot": () => import("../src/commands/app/app-screenshot.js"),
  help: null,
};

const HELP = `nextframe v0.3 — AI video editor CLI

  Timeline JSON → multi-layer HTML → browser playback

CORE PRINCIPLE: 一个视觉元素 = 一个 layer（轨道）
  ✗ 错误：把整屏内容塞进一个 scene 组件
  ✓ 正确：拆成多个 layer，每个 layer 放一个 scene 组件

  示例 — 一个讲解 slide 应该拆成：
    z0  slideFrame      框架（品牌栏+进度条）    start=0 dur=30  全屏
    z1  codeBlock        代码窗口                start=0 dur=12  x=8% y=22% w=84% h=55%
    z2  bulletList       要点列表                start=12 dur=10 x=8% y=22% w=84% h=55%
    z3  calloutCard      说明卡片                start=12 dur=10 x=60% y=22% w=35% h=40%
    z4  numberCounter    大数字                  start=22 dur=8  全屏
    z5  syncSubs         字幕                    start=0 dur=30  全屏

  每个 layer 独立控制：位置(x/y/w/h)、时间(start/dur)、动画(enter/exit/keyframes)
  桌面端可看到每条轨道，单独调整

WORKFLOW（必须走项目三级结构）
  1. 选比例（第一步！决定用哪套组件）：
     --width=1920 --height=1080  → 16:9 横屏 → 用默认组件（headline, barChart...）
     --width=1080 --height=1920  → 9:16 竖屏 → 用 _portrait 组件（headline_portrait...）
     --width=1440 --height=1080  → 4:3 PPT   → 用 _43 组件（headline_43...）
  2. nextframe project-new <name>
  3. nextframe episode-new <project> <name>
  4. nextframe segment-new <project> <ep> <name> --width=W --height=H
  5. nextframe scenes → 只用匹配比例的组件！
     validate 会 ERROR 如果组件比例不匹配 timeline
  6. 设计轨道：每个视觉元素一层
  7. 编辑 JSON → validate → build → preview → Read 截图验证
  8. 没有合适组件？按 SCENE_SPEC.md 写，加正确的 ratio 字段

  存储路径：~/NextFrame/projects/{project}/{episode}/{segment}.json
  桌面端自动扫描此目录，CLI 创建的内容桌面端立即可见

  也支持直接文件路径：nextframe build path/to/file.json -o out.html

RECORDING (HTML → MP4)
  录制用 nextframe-recorder（Rust binary），不是 CLI 的 render 命令。

  基本用法：
    nextframe-recorder slide <html> --out <mp4> --width W --height H --fps 30

  推荐用法（默认开并行 8 进程）：
    nextframe-recorder slide video.html --out video.mp4 --width 1920 --height 1080 --dpr 1 --fps 30 --parallel 8

  三种比例录制：
    # 16:9 横屏 1080p
    nextframe-recorder slide wide.html -o wide.mp4 --width 1920 --height 1080 --dpr 1 --fps 30 --parallel 8

    # 9:16 竖屏 1080p
    nextframe-recorder slide tall.html -o tall.mp4 --width 1080 --height 1920 --dpr 1 --fps 30 --parallel 8

    # 4:3 PPT
    nextframe-recorder slide ppt.html -o ppt.mp4 --width 1440 --height 1080 --dpr 1 --fps 30 --parallel 8

    # 4K（加 --dpr 2）
    nextframe-recorder slide wide.html -o wide-4k.mp4 --width 1920 --height 1080 --dpr 2 --fps 30 --parallel 4

  参数说明：
    --parallel N    并行 WebView 数（推荐 8，4K 用 4）
    --dpr N         设备像素比（1=1080p, 2=4K）
    --fps N         帧率（30 或 60）
    --crf N         质量（默认 14，越小越清晰，文件越大）

  完整流程：build HTML → recorder 录制 → 得到 MP4
    nextframe build myproject ep01 main
    nextframe-recorder slide ~/NextFrame/projects/myproject/ep01/main.html \\
      -o ~/NextFrame/projects/myproject/ep01/main.mp4 \\
      --width 1920 --height 1080 --dpr 1 --fps 30 --parallel 8

COMMANDS
  new <out.json>                         create v0.3 timeline
  validate <timeline>                    6 gates + overlap check
  build <timeline> [--output=out.html]   bundle → playable HTML
  lint-scenes                            audit scene component metadata + sizing
  scenes [id]                            list/inspect components
  preview <timeline> [--times=0,3,5]     screenshot + layout map
  frame <timeline> <t> <out.png>         render one frame
  render <timeline> <out.mp4>            render MP4

Project (三级存储)
  project-new / episode-new / segment-new
  project-list / episode-list / segment-list / project-config

Pipeline (v0.4)
  pipeline-get
  script-set / script-get
  audio-set / audio-get
  atom-add / atom-list / atom-remove
  output-add / output-list / output-publish

Source Library (视频素材全链路)
  source-download <url> --library <path>     download YouTube video via yt-dlp
  source-transcribe <source-dir>             Whisper ASR → sentences.json (no subtitles)
  source-align <source-dir> --srt <file>     whisperX align → sentences.json (have subtitles, better)
  source-cut <source-dir> --plan <file>      cut clips by sentence-id ranges
  source-list --library <path>               list all sources with status
  source-link <source-dir> --project X --episode Y   link clips to pipeline atoms

  DECISION: have SRT → source-align (~20ms). No SRT → source-transcribe (~200ms).
  FLOW: source-download → source-transcribe/align → source-cut → source-link → 素材tab可见
  source.json per source dir is the single truth. pipeline.json atoms reference it.

Layer CRUD
  layer-list / layer-add / layer-move / layer-resize / layer-set / layer-remove

VIDEO SIZE PRESETS (写在 timeline JSON 顶层)
  横屏 16:9    width: 1920, height: 1080   — 默认，YouTube/演示
  竖屏 9:16    width: 1080, height: 1920   — 抖音/Reels/短视频
  方形 1:1     width: 1080, height: 1080   — Instagram/朋友圈
  超宽 21:9    width: 2560, height: 1080   — 电影感
  4K 16:9      width: 3840, height: 2160   — 高清

CONTENT SAFETY RULES (validate 会检查)
  ★ 文字最小 18px（横屏）/ 24px（竖屏）
  ★ 文字最大：标题 ≤ width/20, 正文 ≤ width/40
    横屏 1920: 标题 ≤ 96px, 正文 ≤ 48px
    竖屏 1080: 标题 ≤ 54px, 正文 ≤ 27px — 超了会被裁切！
    方形 1080: 标题 ≤ 54px, 正文 ≤ 27px
  ★ 内容不超出 stage — x+w ≤ 100%, y+h ≤ 100%
  ★ 竖屏安全区：上留 15%, 下留 10%, 左右各留 5%
  ★ 横屏安全区：上下各留 5%, 左右各留 3%

LAYER PROPERTIES (= CSS)
  必填：id, scene, start, dur, params
  位置：x, y, w, h (% 或 px)
  样式：opacity, rotation, scale, blend, filter, borderRadius, shadow, border, padding
  动画：enter(fadeIn/slideUp/scaleIn), exit(fadeOut/scaleOut), transition(dissolve/wipeLeft/zoomIn)
  关键帧：{"keys":[[t,v],...], "ease":"easeOut"} — 任意属性可动画

LAYOUT（同时多个内容层必须用 x/y/w/h 分区）
  左右分栏：左 x=5% w=45%, 右 x=52% w=45%
  上下分栏：上 y=5% h=45%, 下 y=52% h=45%
  画中画：  主 全屏, 小窗 x=65% y=5% w=30% h=30%

SCENE TYPES
  dom=文字/布局  canvas=特效/背景  svg=图表  media=视频/音频

CREATING SCENES（必须遵守 SCENE_SPEC.md）
  完整规范：src/nf-runtime/web/src/components/SCENE_SPEC.md（含模板、规则、检查清单）
  核心规则：
    1. id = 文件名
    2. 字号用 resolveSize(params.fontSize, S, fallback) — S 基于 stage 短边
    3. 不准硬编码 1920/1080
    4. fontSize 参数用比例值（0.05 = 短边5%）— 也接受 px 和关键字("large")
    5. 写完跑 nextframe lint-scenes 检查
    6. 在 3 种比例下 preview 截图验证
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const subcommand = argv[0];
  const loader = SUBCOMMANDS[subcommand];
  if (!loader) {
    process.stderr.write(`unknown subcommand: ${subcommand}\n\n${HELP}`);
    process.exit(3);
  }

  try {
    const mod = await loader();
    const code = await mod.run(argv.slice(1), { subcommand });
    process.exit(typeof code === "number" ? code : 0);
  } catch (error) {
    process.stderr.write(`uncaught: ${error.stack || error.message}\n`);
    process.exit(2);
  }
}

main();
