import { getPreset, esc, scaleW, scaleH, fadeIn, decoLine } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewHeader",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Header",
  description: "9:16 访谈视频顶部标题区：系列名、期号、嘉宾名、标题文字。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "header", "title", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    series:  { type: "string", default: "速通硅谷访谈", label: "系列名", group: "content" },
    episode: { type: "string", default: "E01", label: "期号", group: "content" },
    guest:   { type: "string", default: "Dario Amodei", label: "嘉宾", group: "content" },
    title:   { type: "string", default: "指数快到头了，大众浑然不知", label: "标题", group: "content" },
  },
  ai: {
    when: "用于 9:16 访谈视频顶部标题区域，覆盖 header 安全区（0~260px）。",
    how: "全程显示，不随时间变化。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const type = preset.type || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const sidePad = scaleW(vp, layout.sidePad || 80, baseW);
  const alpha = Math.min(1, fadeIn(t, 0, 0.45));

  const seriesSize = scaleW(vp, type.seriesName?.size || 44, baseW);
  const titleSize = scaleW(vp, type.title?.size || 60, baseW);
  const titleLineH = type.title?.lineHeight || 1.2;

  return `
    <div style="position:absolute;left:0;right:0;top:0;height:${scaleH(vp, layout.header?.height || 260, baseH)}px;opacity:${alpha.toFixed(3)};">
      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${scaleH(vp, 48, baseH)}px;">
        <div style="font-family:${type.seriesName?.font || "system-ui,sans-serif"};font-size:${seriesSize}px;font-weight:${type.seriesName?.weight || 800};letter-spacing:${type.seriesName?.spacing || "0.06em"};color:${colors.primary || "#e8c47a"};text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(params.series || "")} &nbsp;<span style="color:${colors.textDim || "rgba(255,255,255,0.7)"};">${esc(params.episode || "")}</span>
        </div>
        <div style="margin-top:${scaleH(vp, 14, baseH)}px;font-family:${type.title?.font || "system-ui,sans-serif"};font-size:${titleSize}px;font-weight:${type.title?.weight || 700};letter-spacing:${type.title?.spacing || "-0.01em"};line-height:${titleLineH};color:${colors.text || "#ffffff"};">
          ${esc(params.title || "")}
        </div>
        <div style="margin-top:${scaleH(vp, 10, baseH)}px;font-family:${type.seriesName?.font || "system-ui,sans-serif"};font-size:${scaleW(vp, 28, baseW)}px;font-weight:500;color:${colors.textDim || "rgba(255,255,255,0.7)"};">
          ${esc(params.guest || "")}
        </div>
      </div>
      ${decoLine(vp, layout.decoLine1 || 258, colors, baseW, baseH)}
    </div>
  `;
}

export function screenshots() {
  return [{ t: 0.5, label: "header" }];
}

export function lint(params) {
  const errors = [];
  if (!params.title) errors.push("title is required");
  return { ok: errors.length === 0, errors };
}
