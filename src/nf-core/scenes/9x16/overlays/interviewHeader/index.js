import { TOKENS, esc, fadeIn, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewHeader",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Header",
  description: "Gold metadata line and large centered title for the interview poster layout.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "header", "title", "9x16"],
  mood: ["editorial", "focused"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { seriesColor: TOKENS.interview.gold, titleColor: TOKENS.interview.text },
  },
  params: {
    series: { type: "string", default: "速通硅谷访谈", label: "系列名", group: "content" },
    episode: { type: "string", default: "E01", label: "期号", group: "content" },
    guest: { type: "string", default: "Dario Amodei", label: "嘉宾名", group: "content" },
    title: { type: "string", default: "指数快到头了，大众浑然不知", label: "标题", group: "content" },
    seriesColor: { type: "color", default: TOKENS.interview.gold, label: "系列行颜色", group: "color" },
    titleColor: { type: "color", default: TOKENS.interview.text, label: "标题颜色", group: "color" },
  },
};

export function render(t, params, vp) {
  const series = esc(params.series || "速通硅谷访谈");
  const episode = esc(params.episode || "E01");
  const guest = esc(params.guest || "Dario Amodei");
  const title = esc(params.title || "指数快到头了，大众浑然不知");
  const seriesColor = params.seriesColor || TOKENS.interview.gold;
  const titleColor = params.titleColor || TOKENS.interview.text;
  const alpha = fadeIn(t, 0, 0.55);
  const seriesY = scaleH(vp, 60, 1920);
  const titleY = scaleH(vp, 110, 1920);
  const sidePad = scaleW(vp, 72, 1080);
  const seriesSize = scaleW(vp, 16, 1080);
  const titleSize = scaleW(vp, 36, 1080);
  return `<div style="position:absolute;inset:0;pointer-events:none;opacity:${alpha}">
  <div style="position:absolute;left:0;top:${seriesY}px;width:${vp.width}px;text-align:center">
    <span style="font-family:'PingFang SC','Noto Sans SC','Helvetica Neue',sans-serif;font-size:${seriesSize}px;font-weight:600;color:${seriesColor};letter-spacing:0.01em;white-space:nowrap">${series} · ${episode} · ${guest}</span>
  </div>
  <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${titleY}px;text-align:center">
    <div style="font-family:'PingFang SC','Noto Sans SC','Helvetica Neue',sans-serif;font-size:${titleSize}px;font-weight:800;color:${titleColor};line-height:1.14;letter-spacing:-0.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-wrap:balance">${title}</div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "标题淡入" },
    { t: 5, label: "标题显示中" },
    { t: 15, label: "稳定显示" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.title) errors.push("title 大标题不能为空。Fix: 传入clip摘要标题");
  if (!params.series) errors.push("series 系列名不能为空。Fix: 传入系列名");
  return { ok: errors.length === 0, errors };
}
