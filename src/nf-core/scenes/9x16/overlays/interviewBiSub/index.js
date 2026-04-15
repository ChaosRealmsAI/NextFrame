// interviewBiSub — bilingual subtitle overlay (CN + EN) using fine.json segments
import { TOKENS, GRID, TYPE, scaleW, scaleH, esc, findActiveSub, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewBiSub",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitle",
  description: "Bilingual subtitle overlay: CN (gold/white by speaker) above EN (dim italic). Uses two-level findActiveSub() lookup from fine.json segments.",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    segments: { type: "array", default: [], label: "fine.json segments array (two-level: segment→cn[])", group: "content" },
  },
  ai: {
    when: "Use for bilingual subtitle display on 9:16 interview videos",
    how: "Pass params.segments = fine.json.segments directly. Do NOT flatten to SRT. findActiveSub() handles two-level lookup automatically.",
  },
};

export function render(t, params, vp) {
  const segments = params.segments || [];

  const gold = TOKENS.interview.gold;
  const white = TOKENS.interview.text;
  const textDim = TOKENS.interview.textDim;
  const dimEn = "rgba(255,255,255,0.45)";

  const subsLeft = scaleW(vp, GRID.subs.left);
  const subsRight = scaleW(vp, GRID.subs.right);
  const subsTop = scaleH(vp, GRID.subs.top);
  const subsH = scaleH(vp, GRID.subs.height);

  const cnSize = scaleW(vp, TYPE.cnSub.size);
  const enSize = scaleW(vp, TYPE.enSub.size);

  const active = findActiveSub(segments, t);
  const cn = active ? (active.cn || "") : "";
  const en = active ? (active.en || "") : "";
  const speaker = active ? (active.speaker || "") : "";

  // Speaker color: dwarkesh → white, dario (or default) → gold
  const cnColor = speaker === "dwarkesh" ? white : gold;

  return `${decoLine(vp, GRID.decoLine2)}
<div style="position:absolute;left:${subsLeft}px;right:${subsRight}px;top:${subsTop}px;height:${subsH}px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:${scaleH(vp,10)}px;pointer-events:none">
  <!-- CN subtitle -->
  <div style="font-size:${cnSize}px;font-weight:${TYPE.cnSub.weight};line-height:${TYPE.cnSub.lineHeight};color:${cnColor};font-family:${TYPE.cnSub.font};text-align:center;word-break:break-all;overflow:hidden;max-height:${scaleH(vp,200)}px">${esc(cn)}</div>
  <!-- EN subtitle -->
  <div style="font-size:${enSize}px;font-weight:${TYPE.enSub.weight};line-height:${TYPE.enSub.lineHeight};color:${dimEn};font-family:${TYPE.enSub.font};text-align:center;font-style:italic;word-break:break-word;overflow:hidden;max-height:${scaleH(vp,70)}px">${esc(en)}</div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.5,  label: "subtitle at start" },
    { t: 5,    label: "subtitle mid" },
    { t: 20,   label: "subtitle later" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!Array.isArray(params.segments)) {
    errors.push("segments must be an array (fine.json segments)");
  } else if (params.segments.length > 0) {
    const s = params.segments[0];
    if (typeof s.s !== "number") errors.push("segment.s must be a number");
    if (typeof s.e !== "number") errors.push("segment.e must be a number");
    if (!Array.isArray(s.cn)) errors.push("segment.cn must be an array");
  }
  return { ok: errors.length === 0, errors };
}
