import { getPreset, esc, scaleW, scaleH, decoLine } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

const SAMPLE_TAGS = [
  "Dwarkesh Podcast",
  "Dario Amodei",
  "原声 1:21",
];

function defaultTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function getPresetParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}

export const meta = {
  id: "interviewChrome",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Chrome",
  description: "Static portrait interview baseplate with background, title, metadata, brand, and decorative lines.",
  tech: "dom",
  duration_hint: 81,
  tags: ["interview", "portrait", "chrome"],
  mood: ["editorial"],
  theme: ["interview-dark"],
  default_theme: PRESET_NAME,
  themes: {
    "interview-dark": {},
    "interview-soft": {},
    "interview-contrast": {},
  },
  params: {
    seriesName: { type: "string", default: "速通硅谷访谈 · E01 · Dario Amodei", label: "系列名", group: "content" },
    title: { type: "string", default: "指数快到头了，大众浑然不知", label: "标题", group: "content" },
    clipLabel: { type: "string", default: "CLIP 01", label: "片段标签", group: "content" },
    origRange: { type: "string", default: "原片 2:22:19 ｜ 内容来源：00:00 — 01:21", label: "原片范围", group: "meta" },
    topicLabel: { type: "string", default: "正在聊", label: "话题标签", group: "meta" },
    topic: { type: "string", default: "Anthropic 的指数曲线为什么还没到头，以及社会为什么几乎没意识到这一点。", label: "话题", group: "meta" },
    tags: { type: "array", default: SAMPLE_TAGS, label: "标签", group: "meta" },
    brand: { type: "string", default: "NEXTFRAME", label: "品牌", group: "brand" },
    teamLine: { type: "string", default: "Produced by NextFrame AI-native video pipeline", label: "团队签名", group: "brand" },
  },
  ai: {
    when: "Use as the static chrome layer for a 9:16 interview clip.",
    how: "Pair with interviewVideoArea, interviewBiSub, and progressBar9x16 for a complete portrait interview timeline.",
    example: {},
    avoid: "Do not use for layouts that need changing title blocks or dynamic metadata over time.",
    pairs_with: ["interviewVideoArea", "interviewBiSub", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const { colors, layout, type } = getPresetParts();
  const sidePad = scaleW(vp, layout.sidePad, layout.baseW);
  const headerTop = scaleH(vp, layout.header.top, layout.baseH);
  const headerHeight = scaleH(vp, layout.header.height, layout.baseH);
  const topicTop = scaleH(vp, layout.topic.top, layout.baseH);
  const topicHeight = scaleH(vp, layout.topic.height, layout.baseH);
  const timeInfoTop = scaleH(vp, layout.timeInfo, layout.baseH);
  const brandTop = scaleH(vp, layout.brand, layout.baseH);
  const teamTop = scaleH(vp, layout.teamLine, layout.baseH);
  const titleSize = scaleW(vp, type.title.size, layout.baseW);
  const seriesSize = scaleW(vp, type.seriesName.size, layout.baseW);
  const topicLabelSize = scaleW(vp, type.topicLabel.size, layout.baseW);
  const topicTextSize = scaleW(vp, type.topicText.size, layout.baseW);
  const tagSize = scaleW(vp, type.tag.size, layout.baseW);
  const timeInfoSize = scaleW(vp, type.timeInfo.size, layout.baseW);
  const brandSize = scaleW(vp, type.brand.size, layout.baseW);
  const teamSize = scaleW(vp, type.teamLine.size, layout.baseW);
  const dotSize = Math.max(2, scaleW(vp, 2, layout.baseW));
  const gridSize = Math.max(16, scaleW(vp, 20, layout.baseW));
  const tagList = defaultTags(params.tags).slice(0, 3);

  return `
    <div style="position:absolute;inset:0;overflow:hidden;background:${colors.bg};">
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse at 50% 18%, ${colors.glowTop} 0%, transparent 58%),
        radial-gradient(ellipse at 50% 82%, ${colors.glowBottom} 0%, transparent 52%);
      "></div>
      <div style="position:absolute;inset:0;opacity:0.9;background:
        radial-gradient(ellipse at 50% 45%, transparent 38%, ${colors.vignette} 100%);
      "></div>
      <div style="position:absolute;inset:0;opacity:1;background-image:radial-gradient(${colors.gridDot} ${dotSize}px, transparent ${dotSize}px);background-size:${gridSize}px ${gridSize}px;"></div>

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${headerTop}px;height:${headerHeight}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-bottom:${scaleH(vp, 22, layout.baseH)}px;text-align:center;">
        <div style="font-family:${type.seriesName.font};font-size:${seriesSize}px;font-weight:${type.seriesName.weight};letter-spacing:${type.seriesName.spacing};color:${colors.primary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
          ${esc(params.seriesName)}
        </div>
        <div style="margin-top:${scaleH(vp, 12, layout.baseH)}px;font-family:${type.title.font};font-size:${titleSize}px;font-weight:${type.title.weight};letter-spacing:${type.title.spacing};line-height:${type.title.lineHeight};color:${colors.text};max-width:100%;">
          ${esc(params.title)}
        </div>
      </div>

      ${decoLine(vp, layout.decoLine1, colors, layout.baseW, layout.baseH)}
      ${decoLine(vp, layout.decoLine2, colors, layout.baseW, layout.baseH)}
      ${decoLine(vp, layout.decoLine3, colors, layout.baseW, layout.baseH)}

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${timeInfoTop}px;text-align:center;font-family:${type.timeInfo.font};font-size:${timeInfoSize}px;font-weight:${type.timeInfo.weight};letter-spacing:${type.timeInfo.spacing};color:${colors.primary};opacity:0.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(params.origRange)}
      </div>

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${topicTop}px;height:${topicHeight}px;">
        <div style="display:flex;align-items:center;gap:${scaleW(vp, 18, layout.baseW)}px;font-family:${type.topicLabel.font};font-size:${topicLabelSize}px;font-weight:${type.topicLabel.weight};letter-spacing:${type.topicLabel.spacing};color:${colors.primary};text-transform:uppercase;">
          <span>${esc(params.topicLabel)}</span>
          <span style="flex:1;height:1px;background:linear-gradient(90deg, ${colors.primary}, transparent);opacity:0.3;"></span>
        </div>
        <div style="margin-top:${scaleH(vp, 16, layout.baseH)}px;font-family:${type.topicText.font};font-size:${topicTextSize}px;font-weight:${type.topicText.weight};line-height:${type.topicText.lineHeight};color:${colors.textDim};">
          ${esc(params.topic)}
        </div>
        <div style="margin-top:${scaleH(vp, 22, layout.baseH)}px;display:flex;justify-content:center;gap:${scaleW(vp, 14, layout.baseW)}px;flex-wrap:nowrap;overflow:hidden;">
          ${tagList.map((tag) => `
            <span style="display:inline-flex;align-items:center;padding:${scaleH(vp, 9, layout.baseH)}px ${scaleW(vp, 18, layout.baseW)}px;border:1px solid ${colors.tagBorder};border-radius:${scaleW(vp, 10, layout.baseW)}px;background:${colors.tagBg};font-family:${type.tag.font};font-size:${tagSize}px;font-weight:${type.tag.weight};letter-spacing:${type.tag.spacing};color:${colors.tagText};white-space:nowrap;">
              ${esc(tag)}
            </span>
          `).join("")}
        </div>
      </div>

      <div style="position:absolute;left:${sidePad}px;top:${scaleH(vp, layout.video.top + 18, layout.baseH)}px;padding:${scaleH(vp, 6, layout.baseH)}px ${scaleW(vp, 12, layout.baseW)}px;border:1px solid ${colors.tagBorder};border-radius:${scaleW(vp, 8, layout.baseW)}px;background:${colors.tagBg};font-family:${type.clipLabel.font};font-size:${scaleW(vp, type.clipLabel.size, layout.baseW)}px;font-weight:${type.clipLabel.weight};letter-spacing:${type.clipLabel.spacing};color:${colors.primary};">
        ${esc(params.clipLabel)}
      </div>

      <div style="position:absolute;left:0;right:0;top:${brandTop}px;text-align:center;font-family:${type.brand.font};font-size:${brandSize}px;font-weight:${type.brand.weight};letter-spacing:${type.brand.spacing};color:${colors.primary};">
        ${esc(params.brand)}
      </div>
      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${teamTop}px;text-align:center;font-family:${type.teamLine.font};font-size:${teamSize}px;font-weight:${type.teamLine.weight};letter-spacing:${type.teamLine.spacing};color:${colors.textFaint};">
        ${esc(params.teamLine)}
      </div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5, label: "opening" },
    { t: 5, label: "title-and-meta" },
    { t: 40, label: "brand-zone" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.seriesName) errors.push("seriesName is required");
  if (!params.title) errors.push("title is required");
  if (!params.brand) errors.push("brand is required");
  if (!Array.isArray(params.tags) && typeof params.tags !== "string") {
    errors.push("tags must be an array or comma-separated string");
  }
  return { ok: errors.length === 0, errors };
}
