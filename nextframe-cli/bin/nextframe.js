#!/usr/bin/env node

const SUBCOMMANDS = {
  new: () => import("../src/cli/new.js"),
  validate: () => import("../src/cli/validate.js"),
  build: () => import("../src/cli/build.js"),
  "lint-scenes": () => import("../src/cli/lint-scenes.js"),
  scenes: () => import("../src/cli/scenes.js"),
  preview: () => import("../src/cli/preview.js"),
  frame: () => import("../src/cli/frame.js"),
  render: () => import("../src/cli/render.js"),
  "project-new": () => import("../src/cli/project-new.js"),
  "project-list": () => import("../src/cli/project-list.js"),
  "project-config": () => import("../src/cli/project-config.js"),
  "episode-new": () => import("../src/cli/episode-new.js"),
  "episode-list": () => import("../src/cli/episode-list.js"),
  "pipeline-get": () => import("../src/cli/pipeline-get.js"),
  "script-set": () => import("../src/cli/script-set.js"),
  "script-get": () => import("../src/cli/script-get.js"),
  "audio-set": () => import("../src/cli/audio-set.js"),
  "audio-get": () => import("../src/cli/audio-get.js"),
  "atom-add": () => import("../src/cli/atom-add.js"),
  "atom-list": () => import("../src/cli/atom-list.js"),
  "atom-remove": () => import("../src/cli/atom-remove.js"),
  "output-add": () => import("../src/cli/output-add.js"),
  "output-list": () => import("../src/cli/output-list.js"),
  "output-publish": () => import("../src/cli/output-publish.js"),
  "segment-new": () => import("../src/cli/segment-new.js"),
  "segment-list": () => import("../src/cli/segment-list.js"),
  "layer-add": () => import("../src/cli/layers.js"),
  "layer-move": () => import("../src/cli/layers.js"),
  "layer-resize": () => import("../src/cli/layers.js"),
  "layer-remove": () => import("../src/cli/layers.js"),
  "layer-set": () => import("../src/cli/layers.js"),
  "layer-list": () => import("../src/cli/layers.js"),
  app: () => import("../src/cli/app.js"),
  "app-pipeline": () => import("../src/cli/app-pipeline.js"),
  "app-eval": () => import("../src/cli/app-eval.js"),
  "app-screenshot": () => import("../src/cli/app-screenshot.js"),
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
  1. nextframe project-new <name>                   创建项目
  2. nextframe episode-new <project> <name>          创建集
  3. nextframe segment-new <project> <episode> <name> 创建段（生成 timeline JSON）
  4. nextframe scenes / scenes <id>                  查看组件 + 参数
  5. 设计轨道：列出每个视觉元素，每个一层
  6. 编辑 ~/NextFrame/projects/<project>/<episode>/<segment>.json
  7. nextframe validate <project> <episode> <segment> 检查格式 + 重叠
  8. nextframe build <project> <episode> <segment>    生成 HTML（输出到同目录）
  9. nextframe preview <project> <episode> <segment>  截图 + 布局检查
  10. 看 preview 输出，调整 → 回到 7
  11. 没有合适组件？自己写 scene → 注册到 index.js

  存储路径：~/NextFrame/projects/{project}/{episode}/{segment}.json
  桌面端自动扫描此目录，CLI 创建的内容桌面端立即可见

  也支持直接文件路径：nextframe build path/to/file.json -o out.html

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
  完整规范：runtime/web/src/scenes-v2/SCENE_SPEC.md（含模板、规则、检查清单）
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
