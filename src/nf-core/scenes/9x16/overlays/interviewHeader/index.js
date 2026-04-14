export const meta = {
  id: "interviewHeader",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Header",
  description: "顶栏+大标题：上方金色小字系列信息，下方米白大标题，访谈切片核心视觉",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "header", "title", "9x16"],
  mood: ["professional"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": {
      seriesColor: "#d4b483",
      titleColor: "#f5ece0",
    },
  },
  params: {
    series: { type: "string", default: "速通硅谷访谈", label: "系列名", group: "content" },
    episode: { type: "string", default: "E01", label: "期号", group: "content" },
    guest: { type: "string", default: "Dario Amodei", label: "嘉宾名", group: "content" },
    title: { type: "string", default: "指数快到头了，大众浑然不知", label: "clip大标题", group: "content" },
    seriesColor: { type: "color", default: "#d4b483", label: "系列行颜色（金色）", group: "color" },
    titleColor: { type: "color", default: "#f5ece0", label: "标题颜色（米白）", group: "color" },
  },
  ai: {
    when: "访谈切片顶部区域：金色小字系列信息 + 白色大标题",
    how: '{ scene: "interviewHeader", start: 0, dur: 20, params: { series: "速通硅谷访谈", episode: "E01", guest: "Dario Amodei", title: "指数快到头了，大众浑然不知" } }',
    example: { series: "速通硅谷访谈", episode: "E01", guest: "Dario Amodei", title: "指数快到头了，大众浑然不知" },
    avoid: "不要同时使用 interviewTopBar 和 interviewHeader，二者功能重叠",
    pairs_with: ["interviewBg", "interviewVideoArea", "interviewBiSub", "progressBar9x16"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const series = esc(params.series || "速通硅谷访谈");
  const episode = esc(params.episode || "E01");
  const guest = esc(params.guest || "Dario Amodei");
  const title = esc(params.title || "指数快到头了，大众浑然不知");
  const seriesColor = params.seriesColor || "#d4b483";
  const titleColor = params.titleColor || "#f5ece0";

  const fadeAlpha = Math.min(1, ease3(Math.min(1, t * 3)));

  // Spec: series bar y=60 h=30, title y=110 h=80
  // series line: 16px 600weight gold centered
  // title: 36px 800weight off-white centered, max 2 lines
  const seriesY = Math.round(vp.height * 60 / 1920);
  const seriesH = Math.round(vp.height * 30 / 1920);
  const titleY = Math.round(vp.height * 110 / 1920);
  const titleH = Math.round(vp.height * 80 / 1920);

  const seriesFontSize = Math.round(vp.width * 16 / 1080);
  const titleFontSize = Math.round(vp.width * 36 / 1080);

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;opacity:${fadeAlpha};pointer-events:none">
  <div style="position:absolute;left:0;top:${seriesY}px;width:${vp.width}px;height:${seriesH}px;display:flex;align-items:center;justify-content:center">
    <span style="font-family:system-ui,'PingFang SC','Helvetica Neue',sans-serif;font-size:${seriesFontSize}px;font-weight:600;color:${seriesColor};letter-spacing:0.04em;white-space:nowrap">${series} · ${episode} · ${guest}</span>
  </div>
  <div style="position:absolute;left:0;top:${titleY}px;width:${vp.width}px;min-height:${titleH}px;display:flex;align-items:center;justify-content:center;padding:0 ${Math.round(vp.width*0.06)}px;box-sizing:border-box">
    <span style="font-family:system-ui,'PingFang SC','Helvetica Neue',sans-serif;font-size:${titleFontSize}px;font-weight:800;color:${titleColor};text-align:center;line-height:1.3;letter-spacing:-0.01em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${title}</span>
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
