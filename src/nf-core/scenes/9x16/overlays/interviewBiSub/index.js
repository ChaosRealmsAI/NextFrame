import { TOKENS, esc, fadeIn, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewBiSub",
  version: 3,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitle",
  description: "Centered bilingual subtitle with gold Chinese and muted English. Supports time-synced srt array [{s,e,zh,en}] for real video.",
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
    srt: { type: "array", default: [], label: "字幕数组", semantic: "array of {s,e,zh,en} — s/e=start/end(s), zh=中文, en=English. When provided, zh/en static params are ignored.", group: "content" },
    zh: { type: "string", default: "", label: "中文字幕(静态)", group: "content" },
    en: { type: "string", default: "", label: "英文字幕(静态)", group: "content" },
    zhColor: { type: "color", default: TOKENS.interview.gold, label: "中文颜色", group: "color" },
    enColor: { type: "color", default: "rgba(245,236,224,0.6)", label: "英文颜色", group: "color" },
    yPct: { type: "number", default: 72, label: "垂直位置(%)", group: "layout", range: [20, 95], step: 1 },
  },
  ai: {
    when: "访谈视频字幕。支持两种模式：1) srt 数组（时间同步），2) 静态 zh/en 字符串。",
    how: "srt 是 [{s:0, e:3, zh:'中文', en:'English'}] 数组。组件按时间 t 查找当前字幕。",
    example: { srt: [{ s: 0, e: 3, zh: "指数增长快到头了", en: "Exponential growth is about to plateau" }] },
    pairs_with: ["interviewVideoArea", "interviewBg", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const srt = Array.isArray(params.srt) ? params.srt : [];
  let zh = "";
  let en = "";

  if (srt.length > 0) {
    const entry = srt.find((e) => t >= Number(e.s || 0) && t < Number(e.e || 0));
    if (entry) {
      zh = esc(String(entry.zh || entry.t || ""));
      en = esc(String(entry.en || ""));
    }
  } else {
    zh = esc(params.zh || "");
    en = esc(params.en || "");
  }

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
  return `<div style="position:absolute;left:0;top:${top}px;width:${vp.width}px;padding:0 ${pad}px;box-sizing:border-box;text-align:center;pointer-events:none">
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
