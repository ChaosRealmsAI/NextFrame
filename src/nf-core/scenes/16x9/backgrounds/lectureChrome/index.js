import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "lectureChrome",
  version: 1,
  ratio: "16:9",
  category: "backgrounds",
  label: "Lecture Chrome",
  description: "讲解视频静态底层 — 背景色+顶栏品牌+底部进度条+水印，全程不变",
  tech: "dom",
  duration_hint: 30,
  loopable: false,
  z_hint: "bottom",
  tags: ["backgrounds", "chrome", "lecture"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "lecture-warm",
  themes: { "lecture-warm": {} },
  params: {
    totalDur:  { type: "number", default: 30,  label: "总时长(秒)", group: "timing" },
    brand:     { type: "string", default: "NextFrame · Claude Code 源码讲解", label: "品牌文字", group: "content" },
    watermark: { type: "string", default: "OPC · 王宇轩", label: "水印", group: "content" },
    series:    { type: "string", default: "S01 E03", label: "系列号", group: "content" },
  },
  ai: {
    when: "讲解视频的最底层静态层，配合 headlineCenter/codeTerminal/flowDiagram 使用",
    how: "Add as layer: { scene: \"lectureChrome\", start: 0, dur: 30, params: { totalDur: 30 } }",
    example: { totalDur: 30, brand: "NextFrame · Claude Code 源码讲解" },
    avoid: "不要与 progressBar9x16 叠用（本组件已含进度条）",
    pairs_with: ["headlineCenter", "codeTerminal", "flowDiagram", "subtitleBar"],
  },
};

export function render(t, params, vp) {
  const preset = getPreset("lecture-warm");
  const { colors, layout } = preset;

  const W = vp.width;
  const H = vp.height;
  const bw = layout.baseW;
  const bh = layout.baseH;

  const brand    = params.brand    || "NextFrame · Claude Code 源码讲解";
  const watermark = params.watermark || "OPC · 王宇轩";
  const series   = params.series   || "S01 E03";
  const totalDur = params.totalDur  || 30;

  // Progress bar
  const prog = Math.max(0, Math.min(1, t / totalDur));
  const progW = Math.round(W * prog);
  const chromH = scaleH(vp, layout.chrome.height, bh);
  const chromTop = scaleH(vp, layout.chrome.top, bh);

  // Scale helpers
  const sp = scaleW(vp, layout.sidePad, bw);
  const brandSz = scaleW(vp, preset.type.chromeBrand.size, bw);

  return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:${colors.bg};overflow:hidden">
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 110%,rgba(212,180,131,0.08) 0%,transparent 60%)"></div>
  <!-- top chrome bar -->
  <div style="position:absolute;left:0;top:${chromTop}px;width:${W}px;height:${chromH}px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(212,180,131,0.12);display:flex;align-items:center;justify-content:space-between;padding:0 ${sp}px;box-sizing:border-box">
    <span style="font-family:${preset.type.chromeBrand.font};font-size:${brandSz}px;font-weight:${preset.type.chromeBrand.weight};letter-spacing:${preset.type.chromeBrand.spacing};color:${colors.primary};text-transform:uppercase">${esc(brand)}</span>
    <span style="font-family:${preset.type.chromeBrand.font};font-size:${brandSz}px;font-weight:500;color:${colors.textDim}">${esc(series)}</span>
  </div>
  <!-- bottom watermark -->
  <div style="position:absolute;right:${sp}px;bottom:${scaleH(vp, 12, bh)}px;font-family:${preset.type.chromeBrand.font};font-size:${scaleW(vp, 14, bw)}px;font-weight:500;color:${colors.textFaint};letter-spacing:0.06em">${esc(watermark)}</div>
  <!-- progress bar -->
  <div style="position:absolute;left:0;bottom:0;width:${W}px;height:${scaleH(vp, layout.progress.height, bh)}px;background:rgba(255,255,255,0.06)">
    <div style="position:absolute;left:0;top:0;height:100%;width:${progW}px;background:${colors.primary};transition:none"></div>
  </div>
</div>`;
}

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function screenshots() {
  return [
    { t: 0, label: "start" },
    { t: 15, label: "mid — progress 50%" },
    { t: 29, label: "end — progress full" },
  ];
}

export function lint(params) {
  const errors = [];
  if (params.totalDur !== undefined && params.totalDur <= 0) {
    errors.push("totalDur must be > 0");
  }
  return { ok: errors.length === 0, errors };
}
