import { getPreset, scaleW, scaleH, fadeIn } from "../../../shared/design.js";

export const meta = {
  id: "headlineCenter",
  version: 1,
  ratio: "16:9",
  category: "typography",
  label: "Headline Center",
  description: "全屏居中大标题 + 副标题，带淡入动画，适合视频开场 Phase 1",
  tech: "dom",
  duration_hint: 8,
  loopable: false,
  z_hint: "middle",
  tags: ["typography", "headline", "title"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "lecture-warm",
  themes: { "lecture-warm": {} },
  params: {
    headline: { type: "string", default: "Claude Code Hooks", label: "主标题", group: "content" },
    subtitle: { type: "string", default: "副标题文字", label: "副标题", group: "content" },
    eyebrow:  { type: "string", default: "", label: "眉题（可选）", group: "content" },
  },
  ai: {
    when: "Phase 1 标题段，全屏展示视频主题",
    how: "Add as layer: { scene: \"headlineCenter\", start: 0, dur: 8, params: { headline: \"...\", subtitle: \"...\" } }",
    example: { headline: "Claude Code Hooks", subtitle: "AI 工具的安检员 — 每次动手前先过一道检查" },
    avoid: "不要用在有大量内容的段落，只适合标题展示",
    pairs_with: ["lectureChrome", "subtitleBar"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }
function fi(t, start, dur) { return Math.min(1, ease3((t - start) / Math.max(dur, 0.001))); }

export function render(t, params, vp) {
  const preset = getPreset("lecture-warm");
  const { colors, layout } = preset;

  const W = vp.width;
  const H = vp.height;
  const bw = layout.baseW;
  const bh = layout.baseH;

  const headline = params.headline || "Claude Code Hooks";
  const subtitle = params.subtitle || "";
  const eyebrow  = params.eyebrow  || "";

  const alpha1 = fi(t, 0.1, 0.6);
  const alpha2 = fi(t, 0.5, 0.6);
  const slideY1 = Math.round(20 * (1 - alpha1));
  const slideY2 = Math.round(20 * (1 - alpha2));

  const padL = scaleW(vp, layout.headline.left, bw);
  const padR = scaleW(vp, layout.headline.right, bw);
  const hlSz = scaleW(vp, preset.type.headline.size, bw);
  const subSz = scaleW(vp, preset.type.subtitle.size, bw);
  const eyeSz = scaleW(vp, 22, bw);
  const lineW  = scaleW(vp, 80, bw);
  const mbLine = scaleH(vp, 28, bh);
  const mbSub  = scaleH(vp, 28, bh);

  return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  <div style="width:${W - padL - padR}px">
    ${eyebrow ? `<div style="font-family:${preset.type.chromeBrand.font};font-size:${eyeSz}px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${colors.accent};opacity:${alpha1};margin-bottom:${scaleH(vp, 16, bh)}px">${esc(eyebrow)}</div>` : ""}
    <div style="width:${lineW}px;height:3px;background:${colors.primary};margin:0 auto ${mbLine}px;opacity:${alpha1};border-radius:2px"></div>
    <div style="font-family:${preset.type.headline.font};font-size:${hlSz}px;font-weight:${preset.type.headline.weight};line-height:${preset.type.headline.lineHeight};color:${colors.text};opacity:${alpha1};transform:translateY(${slideY1}px)">${esc(headline)}</div>
    ${subtitle ? `<div style="font-family:${preset.type.subtitle.font};font-size:${subSz}px;font-weight:${preset.type.subtitle.weight};line-height:${preset.type.subtitle.lineHeight};color:${colors.textDim};margin-top:${mbSub}px;opacity:${alpha2};transform:translateY(${slideY2}px)">${esc(subtitle)}</div>` : ""}
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.2, label: "fade in start" },
    { t: 2, label: "fully visible" },
    { t: 7, label: "end" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.headline) errors.push("headline is required");
  return { ok: errors.length === 0, errors };
}
