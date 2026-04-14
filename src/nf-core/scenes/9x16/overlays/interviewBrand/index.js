import { TOKENS, GRID, TYPE, esc, scaleW, scaleH, fadeIn, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewBrand",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Brand",
  description: "访谈竖屏底部品牌区：品牌名称 + 团队说明行。竖屏底部固定位置，金色衬线字体。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "top",
  tags: ["overlay", "brand", "interview", "logo", "9x16"],
  mood: ["premium", "professional"],
  theme: ["interview", "talk", "vertical"],
  default_theme: "interview-dark",
  themes: {
    "interview-dark": {
      gold: TOKENS.interview.gold,
      textFaint: TOKENS.interview.textFaint,
    },
  },
  params: {
    brand: { type: "string", default: "OPC · 王宇轩", label: "品牌名", semantic: "底部品牌署名，金色大字", group: "content" },
    teamLine: { type: "string", default: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布", label: "团队说明", semantic: "底部细字说明行", group: "content" },
  },
  ai: {
    when: "访谈类竖屏视频，需要在底部显示品牌署名和制作团队说明时使用。",
    how: "放在最顶层，固定贯穿全程。brand 填品牌/主播名，teamLine 填制作说明。",
    example: { brand: "OPC · 王宇轩", teamLine: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布" },
    avoid: "teamLine 过长（超过50字）可能在小屏溢出，建议适当截短。",
    pairs_with: ["interviewBg", "interviewHeader", "interviewMeta", "interviewBiSub", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const brand = params.brand ?? "OPC · 王宇轩";
  const teamLine = params.teamLine ?? "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布";

  const alpha = fadeIn(t, 0, 0.45);
  const opacity = Math.max(0, Math.min(1, alpha));

  // Deco line at GRID.decoLine3
  const deco3 = decoLine(vp, GRID.decoLine3);

  // Brand name — centered at GRID.brand
  const brandY = scaleH(vp, GRID.brand);
  const brandSize = scaleW(vp, TYPE.brand.size);
  const brandHtml = `<div style="position:absolute;left:0;right:0;top:${brandY}px;text-align:center;` +
    `font-family:${TYPE.brand.font};font-size:${brandSize}px;font-weight:${TYPE.brand.weight};` +
    `letter-spacing:${TYPE.brand.spacing};color:${TOKENS.interview.gold};white-space:nowrap">` +
    `${esc(brand)}</div>`;

  // Team line — centered at GRID.teamLine
  const teamY = scaleH(vp, GRID.teamLine);
  const teamSize = scaleW(vp, TYPE.teamLine.size);
  const teamHtml = `<div style="position:absolute;left:0;right:0;top:${teamY}px;text-align:center;` +
    `font-family:${TYPE.teamLine.font};font-size:${teamSize}px;font-weight:${TYPE.teamLine.weight};` +
    `letter-spacing:${TYPE.teamLine.spacing};color:${TOKENS.interview.textFaint};` +
    `padding:0 ${scaleW(vp, GRID.sidePad)}px;box-sizing:border-box;word-break:break-all">` +
    `${esc(teamLine)}</div>`;

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none;opacity:${opacity}">` +
    deco3 +
    brandHtml +
    teamHtml +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "淡入开始", params: { brand: "OPC · 王宇轩", teamLine: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布" } },
    { t: 0.5, label: "淡入完成", params: { brand: "OPC · 王宇轩", teamLine: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布" } },
    { t: 10, label: "稳定态", params: { brand: "OPC · 王宇轩", teamLine: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布" } },
  ];
}

export function lint(params) {
  const errors = [];
  if (params.brand !== undefined && params.brand !== null && String(params.brand).length === 0) {
    errors.push("brand 不能为空字符串。Fix: 传入品牌名，如 'OPC · 王宇轩'");
  }
  if (params.teamLine && params.teamLine.length > 60) {
    errors.push("teamLine 建议不超过60字，过长可能溢出。Fix: 缩减说明文字");
  }
  return { ok: errors.length === 0, errors };
}
