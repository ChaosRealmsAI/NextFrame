import { getPreset, esc, scaleW, scaleH, decoLine } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewBrand",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Brand",
  description: "9:16 访谈视频底部品牌区：品牌名 + 团队署名。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "brand", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    brand:    { type: "string", default: "NEXTFRAME", label: "品牌名", group: "brand" },
    teamLine: { type: "string", default: "AI-NATIVE VIDEO ENGINE", label: "副标语", group: "brand" },
  },
  ai: {
    when: "9:16 访谈视频底部品牌栏，覆盖进度条下方区域。",
    how: "全程显示，无动画。brand 传品牌名，teamLine 传副标语。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const type   = preset.type || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const sidePad  = scaleW(vp, layout.sidePad || 80, baseW);
  const brandTop = scaleH(vp, layout.brand || 1590, baseH);
  const teamTop  = scaleH(vp, layout.teamLine || 1760, baseH);

  return `
    <div>
      ${decoLine(vp, layout.decoLine3 || 1580, colors, baseW, baseH)}
      <div style="position:absolute;left:${sidePad}px;top:${brandTop}px;font-family:${type.brand?.font || "Georgia,serif"};font-size:${scaleW(vp, type.brand?.size || 40, baseW)}px;font-weight:${type.brand?.weight || 900};letter-spacing:${type.brand?.spacing || "0.2em"};color:${colors.primary || "#e8c47a"};text-transform:uppercase;">
        ${esc(params.brand || "NEXTFRAME")}
      </div>
      <div style="position:absolute;left:${sidePad}px;top:${teamTop}px;font-family:${type.teamLine?.font || "monospace"};font-size:${scaleW(vp, type.teamLine?.size || 20, baseW)}px;font-weight:${type.teamLine?.weight || 500};letter-spacing:${type.teamLine?.spacing || "0.03em"};color:${colors.textFaint || "rgba(255,255,255,0.3)"};text-transform:uppercase;">
        ${esc(params.teamLine || "")}
      </div>
    </div>
  `;
}

export function screenshots() {
  return [{ t: 0.5, label: "brand" }];
}

export function lint() {
  return { ok: true, errors: [] };
}
