import { TOKENS, GRID, TYPE, esc, scaleW, scaleH, fadeIn, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewHeader",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Header",
  description: "访谈顶部区域：节目系列名（金色）+ 标题（白色大字）+ 金线分隔符。高度 260px（1080×1920 参考值）。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "overlay",
  tags: ["header", "title", "interview", "overlay", "9x16"],
  mood: ["premium", "branded", "editorial"],
  theme: ["interview", "talk", "vertical"],
  default_theme: "interview-dark",
  themes: {
    "interview-dark": {
      seriesColor: TOKENS.interview.gold,
      titleColor: TOKENS.interview.text,
    },
  },
  params: {
    series: { type: "string", default: "AI 对话", label: "系列名", semantic: "name of the show or series shown above the title in gold", group: "content" },
    episode: { type: "string", default: "EP.01", label: "期数", semantic: "episode identifier, shown alongside series name", group: "content" },
    guest: { type: "string", default: "", label: "嘉宾", semantic: "guest name, reserved for future sub-header use", group: "content" },
    title: { type: "string", default: "标题文字", label: "标题", semantic: "main episode title shown as large white text, single line", group: "content" },
    seriesColor: { type: "color", default: TOKENS.interview.gold, label: "系列名颜色", semantic: "color of the series name text", group: "color" },
    titleColor: { type: "color", default: TOKENS.interview.text, label: "标题颜色", semantic: "color of the main title text", group: "color" },
  },
  ai: {
    when: "访谈/对话类竖屏视频需要顶部标题区时使用。每集固定顶部位置。",
    how: "叠在 interviewBg 上面，z_hint overlay。series 填节目名，title 填本集主题。title 强制单行，超长会裁剪加省略号。",
    example: { series: "AI 对话", episode: "EP.03", guest: "张伟", title: "大模型时代的产品设计" },
    avoid: "不要把 title 写得太长（超过 16 字会被裁剪）；不要同时使用多个 header scene。",
    pairs_with: ["interviewBg", "interviewMeta", "interviewBiSub", "interviewBrand"],
  },
};

export function render(t, params, vp) {
  const series = esc(params.series || "AI 对话");
  const title = esc(params.title || "标题文字");
  const seriesColor = params.seriesColor || TOKENS.interview.gold;
  const titleColor = params.titleColor || TOKENS.interview.text;

  // Entrance fade-in (first 0.45s)
  const opacity = fadeIn(t, 0, 0.45);

  // Scaled positions (reference: 1080×1920)
  const sidePad = scaleW(vp, GRID.sidePad);           // 80px ref
  const seriesY = scaleH(vp, 108);                    // Y=108 measured from old clip-slide ref
  const titleY = scaleH(vp, 164);                     // Y=164 measured from old clip-slide ref

  // Series name typography
  const seriesFontSize = scaleW(vp, TYPE.seriesName.size);
  const seriesLetterSpacing = TYPE.seriesName.spacing;
  const seriesFontWeight = TYPE.seriesName.weight;

  // Title typography
  const titleFontSize = scaleW(vp, TYPE.title.size);
  const titleFontWeight = TYPE.title.weight;
  const titleLetterSpacing = TYPE.title.spacing;

  const seriesStyle = [
    `position:absolute`,
    `left:${sidePad}px`,
    `right:${sidePad}px`,
    `top:${seriesY}px`,
    `font-size:${seriesFontSize}px`,
    `font-weight:${seriesFontWeight}`,
    `letter-spacing:${seriesLetterSpacing}`,
    `font-family:${TYPE.seriesName.font}`,
    `color:${seriesColor}`,
    `text-align:center`,
    `white-space:nowrap`,
    `overflow:hidden`,
    `text-overflow:ellipsis`,
    `pointer-events:none`,
    `line-height:1`,
  ].join(";");

  const titleStyle = [
    `position:absolute`,
    `left:${sidePad}px`,
    `right:${sidePad}px`,
    `top:${titleY}px`,
    `font-size:${titleFontSize}px`,
    `font-weight:${titleFontWeight}`,
    `letter-spacing:${titleLetterSpacing}`,
    `font-family:${TYPE.title.font}`,
    `color:${titleColor}`,
    `text-align:center`,
    `white-space:nowrap`,
    `overflow:hidden`,
    `text-overflow:ellipsis`,
    `pointer-events:none`,
    `line-height:1`,
  ].join(";");

  const headerHeight = scaleH(vp, GRID.header.height);

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${headerHeight}px;opacity:${opacity};pointer-events:none">` +
    `<div style="${seriesStyle}">${series}</div>` +
    `<div style="${titleStyle}">${title}</div>` +
    decoLine(vp, GRID.decoLine1) +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "淡入开始" },
    { t: 0.5, label: "淡入完成" },
    { t: 10, label: "稳定态" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.series && params.series !== "") errors.push("series 不能为 undefined。Fix: 传入系列名字符串");
  if (!params.title && params.title !== "") errors.push("title 不能为 undefined。Fix: 传入标题字符串");
  if (typeof params.title === "string" && params.title.length > 30) {
    errors.push("title 超过 30 字，单行会被裁剪。Fix: 缩短标题");
  }
  return { ok: errors.length === 0, errors };
}
