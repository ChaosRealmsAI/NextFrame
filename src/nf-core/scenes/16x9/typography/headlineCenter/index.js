import { getPreset, esc, scaleW, scaleH, fadeIn } from "../../../shared/design.js";

const PRESET_NAME = "lecture-warm";

function getParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}

export const meta = {
  id: "headlineCenter",
  version: 1,
  ratio: "16:9",
  category: "typography",
  label: "Headline Center",
  description: "居中章节标题卡，支持主标题、副标题和小标签，用于讲解视频转场。",
  tech: "dom",
  duration_hint: 8,
  loopable: false,
  z_hint: "middle",
  tags: ["headline", "title-card", "lecture", "transition"],
  mood: ["cinematic", "warm", "focused"],
  theme: ["lecture-warm"],
  default_theme: PRESET_NAME,
  themes: {
    "lecture-warm": {},
    "lecture-soft": {},
    "lecture-contrast": {},
  },
  params: {
    kicker: { type: "string", default: "CLAUDE CODE", label: "上方标签", group: "content" },
    title: { type: "string", default: "Architecture in Four Layers", label: "主标题", group: "content" },
    subtitle: { type: "string", default: "System prompt, context packing, tools, and execution loop.", label: "副标题", group: "content" },
    enterDelay: { type: "number", default: 0.1, label: "淡入延迟", group: "timing", range: [0, 10], step: 0.1 },
  },
  ai: {
    when: "在章节切换或开场主题句出现时使用，占据画面中央并与底板形成明显转场。",
    how: "建议持续 4 到 8 秒，title 用一句话概括章节，subtitle 补一行英文或解释。",
    example: {
      kicker: "CLAUDE CODE",
      title: "Architecture in Four Layers",
      subtitle: "System prompt, context packing, tools, and execution loop.",
    },
    avoid: "不要同时和其他全屏内容层长时间重叠；多段正文说明应交给 codeTerminal 右侧面板。",
    pairs_with: ["lectureChrome", "subtitleBar"],
  },
};

export function render(t, params, vp) {
  const { colors, layout, type } = getParts();
  const baseW = layout.baseW || 1920;
  const baseH = layout.baseH || 1080;
  const shellLeft = scaleW(vp, layout.headline?.left || 120, baseW);
  const shellRight = scaleW(vp, layout.headline?.right || 120, baseW);
  const shellTop = scaleH(vp, layout.headline?.top || 340, baseH);
  const opacity = fadeIn(t, params.enterDelay, 0.6);
  const translateY = Math.round((1 - opacity) * scaleH(vp, 28, baseH));

  return `
    <div style="position:absolute;left:${shellLeft}px;right:${shellRight}px;top:${shellTop}px;transform:translateY(${translateY}px);opacity:${opacity};text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:${scaleW(vp, 14, baseW)}px;padding:${scaleH(vp, 10, baseH)}px ${scaleW(vp, 18, baseW)}px;border:1px solid ${colors.textFaint};border-radius:${scaleW(vp, 999, baseW)}px;background:${colors.bg};font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 14, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.14em;color:${colors.primary};text-transform:uppercase;">
        <span style="display:inline-block;width:${scaleW(vp, 8, baseW)}px;height:${scaleW(vp, 8, baseW)}px;border-radius:50%;background:${colors.accent};"></span>
        ${esc(params.kicker)}
      </div>
      <div style="margin-top:${scaleH(vp, 26, baseH)}px;font-family:${type.headline?.font};font-size:${scaleW(vp, type.headline?.size || 72, baseW)}px;font-weight:${type.headline?.weight || 800};line-height:${type.headline?.lineHeight || 1.15};color:${colors.text};text-wrap:balance;">
        ${esc(params.title)}
      </div>
      <div style="margin:${scaleH(vp, 22, baseH)}px auto 0;width:${scaleW(vp, 120, baseW)}px;height:1px;background:linear-gradient(90deg, transparent, ${colors.primary}, transparent);opacity:0.7;"></div>
      <div style="margin-top:${scaleH(vp, 22, baseH)}px;font-family:${type.subtitle?.font};font-size:${scaleW(vp, type.subtitle?.size || 32, baseW)}px;font-weight:${type.subtitle?.weight || 500};line-height:${type.subtitle?.lineHeight || 1.5};color:${colors.textDim};max-width:${scaleW(vp, 980, baseW)}px;margin-left:auto;margin-right:auto;">
        ${esc(params.subtitle)}
      </div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5, label: "fade-in" },
    { t: 2.5, label: "title-card" },
    { t: 6, label: "steady" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.kicker) errors.push("kicker is required");
  if (!params.title) errors.push("title is required");
  if (!params.subtitle) errors.push("subtitle is required");
  if (!Number.isFinite(params.enterDelay) || params.enterDelay < 0) {
    errors.push("enterDelay must be a non-negative number");
  }
  return { ok: errors.length === 0, errors };
}
