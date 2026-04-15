// interviewBrand — bottom brand bar + team line + deco separator
import { TOKENS, GRID, TYPE, scaleW, scaleH, esc, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewBrand",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Brand",
  description: "Bottom brand bar (bold serif name) and team attribution line with top deco separator",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    brand:    { type: "string", default: "OPC · 王宇轩", label: "Brand name", group: "content" },
    teamLine: { type: "string", default: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布", label: "Team attribution line", group: "content" },
  },
  ai: {
    when: "Always include as the bottom-most overlay on 9:16 interview slides",
    how: "Pass brand name and teamLine text. Positioned via GRID.brand + GRID.teamLine.",
  },
};

export function render(t, params, vp) {
  const { brand = "OPC · 王宇轩", teamLine = "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布" } = params;

  const gold = TOKENS.interview.gold;
  const textFaint = TOKENS.interview.textFaint;

  const pad = scaleW(vp, GRID.sidePad);
  const brandTop = scaleH(vp, GRID.brand);
  const teamTop = scaleH(vp, GRID.teamLine);

  const brandSize = scaleW(vp, TYPE.brand.size);
  const teamSize = scaleW(vp, TYPE.teamLine.size);

  return `${decoLine(vp, GRID.decoLine3)}
<!-- Brand bar -->
<div style="position:absolute;left:${pad}px;right:${pad}px;top:${brandTop}px;text-align:center;pointer-events:none">
  <span style="font-size:${brandSize}px;font-weight:${TYPE.brand.weight};letter-spacing:${TYPE.brand.spacing};color:${gold};font-family:${TYPE.brand.font}">${esc(brand)}</span>
</div>
<!-- Team line -->
<div style="position:absolute;left:${pad}px;right:${pad}px;top:${teamTop}px;text-align:center;font-size:${teamSize}px;color:${textFaint};font-family:${TYPE.teamLine.font};letter-spacing:${TYPE.teamLine.spacing};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${esc(teamLine)}</div>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "brand bar" },
  ];
}

export function lint(params, vp) {
  return { ok: true, errors: [] };
}
