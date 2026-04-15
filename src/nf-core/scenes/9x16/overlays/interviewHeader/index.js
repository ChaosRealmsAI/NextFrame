// interviewHeader — top zone: series name + episode/guest + title + deco line
import { TOKENS, GRID, TYPE, scaleW, scaleH, esc, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewHeader",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Header",
  description: "Top header zone with series name, episode, guest name, and episode title + decorative separator line",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    series:  { type: "string", default: "速通硅谷访谈", label: "Series name", group: "content" },
    episode: { type: "string", default: "E01",          label: "Episode number", group: "content" },
    guest:   { type: "string", default: "",             label: "Guest name", group: "content" },
    title:   { type: "string", default: "标题文字",      label: "Episode title", group: "content" },
  },
  ai: {
    when: "Use for the top title area on every 9:16 interview slide",
    how: "Pass series, episode, guest, title from metadata. No timing needed.",
  },
};

export function render(t, params, vp) {
  const { series = "速通硅谷访谈", episode = "E01", guest = "", title = "标题文字" } = params;

  const gold = TOKENS.interview.gold;
  const text = TOKENS.interview.text;
  const textDim = TOKENS.interview.textDim;

  const pad = scaleW(vp, GRID.sidePad);
  const headerTop = scaleH(vp, GRID.header.top);

  // Series line: "速通硅谷访谈 · E01 · Dario Amodei"
  const seriesLine = [series, episode, guest].filter(Boolean).join(" · ");

  const seriesSize = scaleW(vp, TYPE.seriesName.size);
  const titleSize = scaleW(vp, TYPE.title.size);
  const titleLineH = TYPE.title.lineHeight || 1.2;

  return `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${headerTop}px;pointer-events:none">
  <!-- Series name line -->
  <div style="font-size:${seriesSize}px;font-weight:${TYPE.seriesName.weight};letter-spacing:${TYPE.seriesName.spacing};color:${gold};font-family:${TYPE.seriesName.font};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">${esc(seriesLine)}</div>
  <!-- Title -->
  <div style="margin-top:${scaleH(vp, 16)}px;font-size:${titleSize}px;font-weight:${TYPE.title.weight};letter-spacing:${TYPE.title.spacing};color:${text};font-family:${TYPE.title.font};line-height:${titleLineH};word-break:break-all">${esc(title)}</div>
</div>
${decoLine(vp, GRID.decoLine1)}`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "header with title" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.title && String(params.title).length > 30) {
    errors.push("title > 30 chars may overflow header zone");
  }
  return { ok: errors.length === 0, errors };
}
