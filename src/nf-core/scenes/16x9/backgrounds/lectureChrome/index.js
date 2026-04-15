import { getPreset, esc, scaleW, scaleH, clamp01, easeOutCubic } from "../../../shared/design.js";

const PRESET_NAME = "lecture-warm";

function getParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}

function progressPercent(t, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp01(t / duration);
}

export const meta = {
  id: "lectureChrome",
  version: 1,
  ratio: "16:9",
  category: "backgrounds",
  label: "Lecture Chrome",
  description: "讲解视频底板，提供暖棕暗色背景、顶部 chrome 栏、内容安全区和底部进度条。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "bottom",
  tags: ["lecture", "chrome", "background", "16x9"],
  mood: ["technical", "warm", "editorial"],
  theme: ["lecture-warm"],
  default_theme: PRESET_NAME,
  themes: {
    "lecture-warm": {},
    "lecture-soft": {},
    "lecture-contrast": {},
  },
  params: {
    seriesName: { type: "string", default: "CLAUDE CODE // SOURCE WALKTHROUGH", label: "系列名", group: "content" },
    chapter: { type: "string", default: "ARCHITECTURE", label: "章节标签", group: "content" },
    title: { type: "string", default: "How Claude Code Packs Context Before It Thinks", label: "标题", group: "content" },
    brand: { type: "string", default: "NEXTFRAME", label: "品牌", group: "brand" },
    duration: { type: "number", default: 30, label: "总时长", group: "timing", range: [1, 600], step: 1 },
  },
  ai: {
    when: "用作 16:9 讲解视频的全程底板层，给标题、代码区和字幕提供统一基底。",
    how: "整段时间全程铺底，duration 传入总时长后会自动驱动底部进度条。",
    example: {
      seriesName: "CLAUDE CODE // SOURCE WALKTHROUGH",
      chapter: "ARCHITECTURE",
      title: "How Claude Code Packs Context Before It Thinks",
      duration: 30,
    },
    avoid: "不要再叠加第二个全屏背景层；如果是纯静态封面而不需要进度条，用更简单的背景 scene。",
    pairs_with: ["headlineCenter", "codeTerminal", "subtitleBar"],
  },
};

export function render(t, params, vp) {
  const { colors, layout, type } = getParts();
  const baseW = layout.baseW || 1920;
  const baseH = layout.baseH || 1080;
  const chromeHeight = scaleH(vp, layout.chrome?.height || 48, baseH);
  const contentTop = scaleH(vp, layout.content?.top || 80, baseH);
  const contentLeft = scaleW(vp, layout.content?.left || 60, baseW);
  const contentRight = scaleW(vp, layout.content?.right || 60, baseW);
  const contentHeight = scaleH(vp, layout.content?.height || 860, baseH);
  const codeLeft = scaleW(vp, layout.codeArea?.left || 60, baseW);
  const codeTop = scaleH(vp, layout.codeArea?.top || 100, baseH);
  const codeWidth = scaleW(vp, layout.codeArea?.width || 900, baseW);
  const codeHeight = scaleH(vp, layout.codeArea?.height || 820, baseH);
  const panelLeft = scaleW(vp, layout.panelArea?.left || 1000, baseW);
  const panelWidth = scaleW(vp, layout.panelArea?.width || 860, baseW);
  const panelHeight = scaleH(vp, layout.panelArea?.height || 820, baseH);
  const subtitleBottom = scaleH(vp, layout.subtitle?.bottom || 60, baseH);
  const subtitleHeight = scaleH(vp, layout.subtitle?.height || 80, baseH);
  const progressHeight = Math.max(2, scaleH(vp, layout.progress?.height || 4, baseH));
  const progress = progressPercent(t, params.duration);
  const glowPulse = 0.88 + easeOutCubic(((t % 6) / 6)) * 0.18;

  return `
    <div style="position:absolute;inset:0;overflow:hidden;background:${colors.bg};">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 22% 18%, ${colors.accent} 0%, transparent 35%);opacity:${(0.14 * glowPulse).toFixed(3)};"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 78% 72%, ${colors.primary} 0%, transparent 34%);opacity:${(0.12 * glowPulse).toFixed(3)};"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(180deg, transparent, ${colors.bg});opacity:0.28;"></div>

      <div style="position:absolute;left:0;right:0;top:0;height:${chromeHeight}px;background:${colors.bg};opacity:0.86;"></div>
      <div style="position:absolute;left:0;right:0;top:0;height:${chromeHeight}px;border-bottom:1px solid ${colors.textFaint};backdrop-filter:blur(${scaleW(vp, 12, baseW)}px);">
        <div style="position:absolute;left:${scaleW(vp, 22, baseW)}px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:${scaleW(vp, 10, baseW)}px;">
          <span style="display:inline-block;width:${scaleW(vp, 10, baseW)}px;height:${scaleW(vp, 10, baseW)}px;border-radius:50%;background:${colors.red};opacity:0.95;"></span>
          <span style="display:inline-block;width:${scaleW(vp, 10, baseW)}px;height:${scaleW(vp, 10, baseW)}px;border-radius:50%;background:${colors.primary};opacity:0.88;"></span>
          <span style="display:inline-block;width:${scaleW(vp, 10, baseW)}px;height:${scaleW(vp, 10, baseW)}px;border-radius:50%;background:${colors.green};opacity:0.92;"></span>
        </div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, type.chromeBrand?.size || 16, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:${type.chromeBrand?.spacing || "0.04em"};color:${colors.textDim};text-transform:uppercase;">
          ${esc(params.seriesName)}
        </div>
        <div style="position:absolute;right:${scaleW(vp, 28, baseW)}px;top:50%;transform:translateY(-50%);font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 14, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.12em;color:${colors.primary};text-transform:uppercase;">
          ${esc(params.brand)} / ${esc(params.chapter)}
        </div>
      </div>

      <div style="position:absolute;left:${contentLeft}px;right:${contentRight}px;top:${contentTop}px;height:${contentHeight}px;border:1px solid ${colors.textFaint};border-radius:${scaleW(vp, 22, baseW)}px;background:${colors.bg};opacity:0.3;"></div>

      <div style="position:absolute;left:${codeLeft}px;top:${codeTop}px;width:${codeWidth}px;height:${codeHeight}px;border-radius:${scaleW(vp, 18, baseW)}px;border:1px dashed ${colors.textFaint};opacity:0.5;"></div>
      <div style="position:absolute;left:${panelLeft}px;top:${codeTop}px;width:${panelWidth}px;height:${panelHeight}px;border-radius:${scaleW(vp, 18, baseW)}px;border:1px dashed ${colors.textFaint};opacity:0.42;"></div>

      <div style="position:absolute;left:${scaleW(vp, 92, baseW)}px;top:${scaleH(vp, 108, baseH)}px;max-width:${scaleW(vp, 760, baseW)}px;">
        <div style="font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 14, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.14em;color:${colors.primary};text-transform:uppercase;">
          ${esc(params.chapter)}
        </div>
        <div style="margin-top:${scaleH(vp, 16, baseH)}px;font-family:${type.headline?.font};font-size:${scaleW(vp, 34, baseW)}px;font-weight:${type.headline?.weight || 800};line-height:1.2;color:${colors.text};">
          ${esc(params.title)}
        </div>
      </div>

      <div style="position:absolute;left:${scaleW(vp, 94, baseW)}px;bottom:${subtitleBottom + subtitleHeight + scaleH(vp, 22, baseH)}px;font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 13, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.12em;color:${colors.textFaint};text-transform:uppercase;">
        LAYOUT: TERMINAL LEFT / COMMENTARY RIGHT / SUBTITLE SAFE ZONE
      </div>

      <div style="position:absolute;left:0;right:0;bottom:0;height:${progressHeight}px;background:${colors.textFaint};overflow:hidden;">
        <div style="width:${(progress * 100).toFixed(3)}%;height:100%;background:linear-gradient(90deg, ${colors.accent}, ${colors.primary});box-shadow:0 0 ${scaleW(vp, 18, baseW)}px ${colors.accent};"></div>
      </div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5, label: "opening" },
    { t: 14, label: "mid-progress" },
    { t: 29, label: "near-end" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.seriesName) errors.push("seriesName is required");
  if (!params.chapter) errors.push("chapter is required");
  if (!params.title) errors.push("title is required");
  if (!params.brand) errors.push("brand is required");
  if (!Number.isFinite(params.duration) || params.duration <= 0) {
    errors.push("duration must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}
