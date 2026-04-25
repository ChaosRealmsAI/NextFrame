export const checks = [
  ["Feature", "clip-first-export 是验收单位，不是 recorder 模块名。"],
  ["Expectation", "先看动画、语音、关键帧，再确认要不要开工。"],
  ["BDD", "每个验收点都有 given / when / then 和 ai_tools。"],
  ["Contract", "recorder 只吃 render_source.json，不能读桌面端状态。"],
  ["Visual E2E", "导出后抽每个 clip 中段和边界帧，检查不能粉屏。"]
];

export const contracts = [
  ["AI / Editor", "composition.json"],
  ["Compiler", "composition -> render_source"],
  ["Recorder", "render_source -> mp4 + diagnostics"],
  ["Verifier", "source + mp4 -> report"]
];

export const tracks = [
  { id: "intro", label: "intro", left: 0, width: 32, kind: "scene" },
  { id: "proof", label: "proof", left: 32, width: 38, kind: "component" },
  { id: "outro", label: "outro", left: 70, width: 30, kind: "text" },
  { id: "voice", label: "voice walkthrough", left: 4, width: 88, kind: "audio" }
];

export const slides = [
  {
    tag: "FEATURE FIRST",
    title: "先看到终点，再开始写代码。",
    caption: "功能是组织单位。模块只是实现手段。",
    activeCheck: 0,
    activeContract: 0
  },
  {
    tag: "EXPECTATION PACK",
    title: "动画、语音、关键帧先给你看。",
    caption: "你确认最终效果后，BDD 才变成开发入口。",
    activeCheck: 1,
    activeContract: 1
  },
  {
    tag: "RECORDER CONTRACT",
    title: "recorder 只接受 render_source.json。",
    caption: "不读桌面端状态，不理解创作层 anchors。",
    activeCheck: 3,
    activeContract: 2
  },
  {
    tag: "VISUAL E2E",
    title: "导出后抽帧，机器先挡明显错误。",
    caption: "intro / proof / outro 都要不粉屏、不空画面。",
    activeCheck: 4,
    activeContract: 3
  }
];
