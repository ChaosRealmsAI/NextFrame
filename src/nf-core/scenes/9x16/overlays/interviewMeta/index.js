import { getPreset, esc, scaleW, scaleH, decoLine } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewMeta",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Meta Info",
  description: "9:16 访谈视频元信息区：原片时间范围、主题摘要、话题标签。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "meta", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    origRange: { type: "string", default: "", label: "原片时间范围", group: "content" },
    topic:     { type: "string", default: "", label: "主题摘要",    group: "content" },
    tags:      { type: "string", default: "", label: "话题标签（逗号分隔）", group: "content" },
  },
  ai: {
    when: "9:16 访谈视频中展示元信息区块（字幕区下方到进度条之间的区域）。",
    how: "origRange 写原片时间戳，topic 写一句话摘要，tags 逗号分隔话题标签。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const type   = preset.type || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const sidePad    = scaleW(vp, layout.sidePad || 80, baseW);
  const timeInfoY  = scaleH(vp, layout.timeInfo || 1186, baseH);
  const topicTop   = scaleH(vp, layout.topic?.top || 1224, baseH);

  const tagsArr = (params.tags || "").split(",").map((s) => s.trim()).filter(Boolean);

  return `
    <div>
      ${decoLine(vp, layout.decoLine2 || 820, colors, baseW, baseH)}

      <div style="position:absolute;left:${sidePad}px;top:${timeInfoY}px;font-family:${type.timeInfo?.font || "'SF Mono',monospace"};font-size:${scaleW(vp, type.timeInfo?.size || 22, baseW)}px;font-weight:${type.timeInfo?.weight || 500};letter-spacing:${type.timeInfo?.spacing || "0.05em"};color:${colors.textFaint || "rgba(255,255,255,0.3)"};text-transform:uppercase;">
        ${esc(params.origRange || "")}
      </div>

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${topicTop}px;">
        <div style="font-family:${type.topicLabel?.font || "system-ui,sans-serif"};font-size:${scaleW(vp, type.topicLabel?.size || 20, baseW)}px;font-weight:${type.topicLabel?.weight || 600};letter-spacing:${type.topicLabel?.spacing || "0.1em"};color:${colors.primary || "#e8c47a"};text-transform:uppercase;margin-bottom:${scaleH(vp, 16, baseH)}px;">
          TOPIC
        </div>
        <div style="font-family:${type.topicText?.font || "system-ui,sans-serif"};font-size:${scaleW(vp, type.topicText?.size || 24, baseW)}px;font-weight:${type.topicText?.weight || 500};line-height:${type.topicText?.lineHeight || 1.65};color:${colors.textDim || "rgba(255,255,255,0.7)"};">
          ${esc(params.topic || "")}
        </div>
        ${tagsArr.length > 0 ? `
        <div style="margin-top:${scaleH(vp, 24, baseH)}px;display:flex;flex-wrap:wrap;gap:${scaleH(vp, 10, baseH)}px;">
          ${tagsArr.map((tag) => `<span style="display:inline-block;padding:${scaleH(vp, 6, baseH)}px ${scaleW(vp, 14, baseW)}px;border:1px solid ${colors.tagBorder || "rgba(126,200,227,0.15)"};background:${colors.tagBg || "rgba(126,200,227,0.06)"};border-radius:${scaleW(vp, 100, baseW)}px;font-family:${type.tag?.font || "monospace"};font-size:${scaleW(vp, type.tag?.size || 22, baseW)}px;font-weight:${type.tag?.weight || 500};letter-spacing:${type.tag?.spacing || "0.03em"};color:${colors.tagText || "#7ec8e3"};">${esc(tag)}</span>`).join("")}
        </div>` : ""}
      </div>
    </div>
  `;
}

export function screenshots() {
  return [{ t: 0.5, label: "meta" }];
}

export function lint() {
  return { ok: true, errors: [] };
}
