import { TOKENS, GRID, TYPE, esc, scaleW, scaleH, fadeIn, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewHeader", version: 3, ratio: "9:16", category: "overlays",
  label: "Interview Header",
  description: "Top zone: gold series line + large white title + deco separator. Matches old clip-slide .std-header.",
  tech: "dom", duration_hint: 20, loopable: true, z_hint: "top",
  tags: ["overlays", "interview", "header", "title", "9x16"],
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    series: { type: "string", default: "速通硅谷访谈", label: "Series name", group: "content" },
    episode: { type: "string", default: "E01", label: "Episode", group: "content" },
    guest: { type: "string", default: "Dario Amodei", label: "Guest", group: "content" },
    title: { type: "string", default: "指数快到头了，大众浑然不知", label: "Title", group: "content" },
  },
  ai: { when: "Always present in interview videos. Renders series line + title in top 260px zone." },
};

export function render(t, params, vp) {
  const series = esc(params.series || "速通硅谷访谈");
  const episode = esc(params.episode || "E01");
  const guest = esc(params.guest || "");
  const title = esc(params.title || "");
  const alpha = fadeIn(t, 0, 0.55);
  const pad = scaleW(vp, GRID.sidePad);
  // Old system: header 0-260px, flex justify-end with 24px bottom padding
  // Series(44px) + 12px gap + Title(60px×1.2) = ~128px block, starts at ~108px
  const seriesY = scaleH(vp, 108);
  const titleY = scaleH(vp, 164);
  const sSize = scaleW(vp, TYPE.seriesName.size);
  const tSize = scaleW(vp, TYPE.title.size);
  const seriesLine = guest ? `${series} · ${episode} · ${guest}` : `${series} · ${episode}`;
  return `<div style="position:absolute;inset:0;pointer-events:none;opacity:${alpha}">` +
    `<div style="position:absolute;left:0;right:0;top:${seriesY}px;text-align:center">` +
    `<span style="font:${TYPE.seriesName.weight} ${sSize}px ${TYPE.seriesName.font};color:${TOKENS.interview.gold};letter-spacing:${TYPE.seriesName.spacing};white-space:nowrap">${seriesLine}</span>` +
    `</div>` +
    `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${titleY}px;text-align:center">` +
    `<div style="font:${TYPE.title.weight} ${tSize}px/${TYPE.title.lineHeight} ${TYPE.title.font};color:${TOKENS.interview.text};letter-spacing:${TYPE.title.spacing};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>` +
    `</div>` +
    decoLine(vp, GRID.decoLine1) +
    `</div>`;
}

export function screenshots() {
  return [{ t: 0.1, label: "Header fade in" }, { t: 5, label: "Header visible" }];
}

export function lint(params) {
  const errors = [];
  if (!params.title) errors.push("title required");
  return { ok: errors.length === 0, errors };
}
