import { TOKENS, esc, fadeIn, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewTopBar",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Top Bar",
  description: "Compact alternative top line for interview layouts that do not use the full header.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "topbar", "9x16"],
  mood: ["editorial"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { accentColor: TOKENS.interview.gold, textColor: TOKENS.interview.text },
  },
  params: {
    series: { type: "string", default: "速通硅谷访谈", label: "系列名", group: "content" },
    episode: { type: "string", default: "E01", label: "期号", group: "content" },
    guest: { type: "string", default: "Dario Amodei", label: "嘉宾", group: "content" },
    accentColor: { type: "color", default: TOKENS.interview.gold, label: "强调色", group: "color" },
    textColor: { type: "color", default: TOKENS.interview.text, label: "文字颜色", group: "color" },
  },
};

export function render(t, params, vp) {
  const series = esc(params.series || "速通硅谷访谈");
  const episode = esc(params.episode || "E01");
  const guest = esc(params.guest || "Dario Amodei");
  const accentColor = params.accentColor || TOKENS.interview.gold;
  const textColor = params.textColor || TOKENS.interview.text;
  const alpha = fadeIn(t, 0, 0.45);
  const side = scaleW(vp, 76, 1080);
  const top = scaleH(vp, 54, 1920);
  const fontSize = scaleW(vp, 15, 1080);
  return `<div style="position:absolute;left:${side}px;right:${side}px;top:${top}px;display:flex;align-items:center;justify-content:center;gap:${scaleW(vp, 10, 1080)}px;pointer-events:none;opacity:${alpha}">
  <div style="height:1px;flex:1;background:linear-gradient(90deg, transparent 0%, rgba(212,180,131,0.3) 100%)"></div>
  <div style="font-family:'PingFang SC','Noto Sans SC',sans-serif;font-size:${fontSize}px;font-weight:600;color:${accentColor};white-space:nowrap">${series} · ${episode} · <span style="color:${textColor};opacity:0.9">${guest}</span></div>
  <div style="height:1px;flex:1;background:linear-gradient(90deg, rgba(212,180,131,0.3) 0%, transparent 100%)"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "顶部标题栏淡入" },
    { t: 10, label: "中段显示" },
  ];
}

export function lint(params, vp) {
  return { ok: true, errors: [] };
}
