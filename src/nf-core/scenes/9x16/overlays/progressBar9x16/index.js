// progressBar9x16 — thin progress bar at GRID.progress position
import { TOKENS, GRID, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "progressBar9x16",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9:16",
  description: "Thin playback progress bar positioned at GRID.progress. Animates from 0% to 100% over the clip duration.",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    duration: { type: "number", default: 60, label: "Total clip duration in seconds", group: "content" },
  },
  ai: {
    when: "Always include as the visual progress indicator on 9:16 interview slides",
    how: "Pass duration = fine.clip_duration. The bar automatically animates as t increases.",
  },
};

export function render(t, params, vp) {
  const dur = Math.max(1, Number(params.duration) || 60);
  const progress = Math.min(1, Math.max(0, t / dur));

  const gold = TOKENS.interview.gold;
  const decoLine = TOKENS.interview.decoLine;

  const left = scaleW(vp, GRID.sidePad);
  const right = scaleW(vp, GRID.sidePad);
  const top = scaleH(vp, GRID.progress);
  const barH = scaleH(vp, 4);
  const totalW = vp.width - left - right;
  const fillW = Math.round(totalW * progress);

  return `<div style="position:absolute;left:${left}px;right:${right}px;top:${top}px;height:${barH}px;background:${decoLine};border-radius:${barH}px;overflow:hidden;pointer-events:none">
  <div style="position:absolute;left:0;top:0;width:${fillW}px;height:100%;background:${gold};border-radius:${barH}px;transition:none"></div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0,    label: "progress 0%" },
    { t: 30,   label: "progress 50%" },
    { t: 60,   label: "progress 100%" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (typeof params.duration !== "number" || params.duration <= 0) {
    errors.push("duration must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}
