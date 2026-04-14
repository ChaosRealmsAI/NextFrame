export const meta = {
  id: "interviewBiSub",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitle",
  description: "双语字幕（中+英），中文大字在上，英文小字在下，带淡入动画",
  tech: "dom",
  duration_hint: 7,
  loopable: false,
  z_hint: "top",
  tags: ["overlays", "subtitle", "bilingual", "interview", "9x16"],
  mood: ["professional"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { zhColor: "#d4b483", enColor: "rgba(245,236,224,0.6)", accentColor: "#da7756", bgColor: "rgba(10,10,10,0.6)" },
  },
  params: {
    zh: { type: "string", default: "指数增长快要到头了", label: "中文字幕", group: "content" },
    en: { type: "string", default: "Exponential growth is about to plateau", label: "英文字幕", group: "content" },
    zhColor: { type: "color", default: "#d4b483", label: "中文颜色（金色）", group: "color" },
    enColor: { type: "color", default: "rgba(245,236,224,0.6)", label: "英文颜色（灰）", group: "color" },
    accentColor: { type: "color", default: "#da7756", label: "强调色（左边竖线）", group: "color" },
    bgColor: { type: "color", default: "rgba(10,10,10,0.6)", label: "背景色", group: "color" },
    yPct: { type: "number", default: 72, label: "垂直位置(%)", group: "layout", range: [50, 95], step: 1 },
  },
  ai: {
    when: "访谈切片双语字幕，每段字幕单独一个layer",
    how: "每句话单独一个layer，时间段对应字幕出现时间。{ scene: \"interviewBiSub\", start: 0, dur: 6, params: { zh: \"中文\", en: \"English\" } }",
    example: { zh: "指数增长快要到头了", en: "Exponential growth is about to plateau", yPct: 72 },
    avoid: "同时只能显示一条字幕，多条字幕用多个layer时间段错开",
    pairs_with: ["interviewBg", "interviewTopBar", "progressBar9x16"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const zh = esc(params.zh || "");
  const en = esc(params.en || "");
  const zhColor = params.zhColor || "#d4b483";
  const enColor = params.enColor || "rgba(245,236,224,0.6)";
  const yPct = Number.isFinite(params.yPct) ? params.yPct : 72;

  const fadeIn = Math.min(1, t * 4);
  const translateY = (1 - ease3(Math.min(1, t * 3))) * 10;

  const pad = Math.round(vp.width * 0.08);
  const zhSize = Math.round(vp.width * 28 / 1080);
  const enSize = Math.round(vp.width * 14 / 1080);
  const top = Math.round(vp.height * yPct / 100);
  const gap = Math.round(vp.width * 8 / 1080);

  return `<div style="position:absolute;left:0;top:${top}px;width:${vp.width}px;opacity:${fadeIn};transform:translateY(${translateY}px);pointer-events:none;text-align:center">
  <div style="padding:0 ${pad}px">
    <div style="font-family:'PingFang SC','Noto Sans SC','Helvetica Neue',sans-serif;font-size:${zhSize}px;font-weight:700;color:${zhColor};line-height:1.4;letter-spacing:0.02em">${zh}</div>
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:${enSize}px;font-weight:400;color:${enColor};line-height:1.6;margin-top:${gap}px;letter-spacing:0.01em">${en}</div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "字幕淡入" },
    { t: 3, label: "字幕显示中" },
    { t: 6, label: "字幕结束前" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.zh) errors.push("zh 中文字幕不能为空。Fix: 传入中文内容");
  if (!params.en) errors.push("en 英文字幕不能为空。Fix: 传入英文内容");
  return { ok: errors.length === 0, errors };
}
