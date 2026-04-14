import { TOKENS, esc, fadeIn, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewBiSub",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitle",
  description: "Centered bilingual subtitle with gold Chinese and muted English.",
  tech: "dom",
  duration_hint: 7,
  loopable: false,
  z_hint: "top",
  tags: ["overlays", "subtitle", "bilingual", "interview", "9x16"],
  mood: ["focused"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { zhColor: TOKENS.interview.gold, enColor: "rgba(245,236,224,0.6)" },
  },
  params: {
    zh: { type: "string", default: "指数增长快到头了", label: "中文字幕", group: "content" },
    en: { type: "string", default: "Exponential growth is about to plateau", label: "英文字幕", group: "content" },
    zhColor: { type: "color", default: TOKENS.interview.gold, label: "中文颜色", group: "color" },
    enColor: { type: "color", default: "rgba(245,236,224,0.6)", label: "英文颜色", group: "color" },
    yPct: { type: "number", default: 72, label: "垂直位置(%)", group: "layout", range: [20, 95], step: 1 },
  },
};

export function render(t, params, vp) {
  const zh = esc(params.zh || "");
  const en = esc(params.en || "");
  if (!zh && !en) return "";
  const zhColor = params.zhColor || TOKENS.interview.gold;
  const enColor = params.enColor || "rgba(245,236,224,0.6)";
  const yPct = Number.isFinite(params.yPct) ? params.yPct : 72;
  const zhSize = scaleW(vp, 28, 1080);
  const enSize = scaleW(vp, 14, 1080);
  const gap = scaleW(vp, 10, 1080);
  const pad = scaleW(vp, 72, 1080);
  const blockHeight = Math.round(zhSize * 1.2 + gap + enSize * 1.45);
  const top = Math.round((vp.height * yPct) / 100 - blockHeight / 2);
  const alpha = fadeIn(t, 0, 0.4);
  const translate = Math.round((1 - alpha) * scaleW(vp, 14, 1080));
  return `<div style="position:absolute;left:0;top:${top}px;width:${vp.width}px;padding:0 ${pad}px;box-sizing:border-box;text-align:center;pointer-events:none;opacity:${alpha};transform:translateY(${translate}px)">
  <div style="font-family:'PingFang SC','Noto Sans SC','Helvetica Neue',sans-serif;font-size:${zhSize}px;font-weight:700;color:${zhColor};line-height:1.28;letter-spacing:0.01em">${zh}</div>
  <div style="font-family:'SF Pro Display','Helvetica Neue',Arial,sans-serif;font-size:${enSize}px;font-weight:400;color:${enColor};line-height:1.45;margin-top:${gap}px;letter-spacing:0.005em;font-style:italic">${en}</div>
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
