// interviewBiSub — 硅谷访谈 9:16 双语字幕层
// 两级查找：segment → EN，cn[] → CN。
// speaker = "dario" → 金色；其他 → 白色。

import { getPreset, esc, scaleW, scaleH, findActiveSub } from "../../../shared/design.js";

export const meta = {
  id: "interviewBiSub",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitle",
  description: "硅谷访谈双语字幕（9:16）。params.segments = fine.json.segments，用 findActiveSub 两级查找当前中英文。Dario 金色，其他人白色。",
  tech: "dom",
  duration_hint: 80,
  loopable: false,
  z_hint: "top",
  tags: ["interview", "subtitle", "bilingual", "9x16"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "interview-dark",
  themes: { "interview-dark": {} },
  params: {
    segments: {
      type: "array",
      default: [],
      label: "fine.json.segments 直接贴入，不转换",
      group: "content",
    },
  },
  ai: {
    when: "给访谈视频加双语字幕。params.segments 直接传 fine.json.segments，不要转换格式。",
    how: "{ scene: 'interviewBiSub', start: 0, dur: <clip_duration>, params: { segments: fine.segments } }",
    example: { segments: [] },
    avoid: "禁止把 segments 拍平成 SRT 数组。英文跟 segment 走，中文跟 cn[] 子 cue 走。",
    pairs_with: ["interviewChrome", "interviewVideoArea", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const preset = getPreset("interview-dark");
  const { colors, layout, type } = preset;
  const bW = layout.baseW;
  const bH = layout.baseH;

  const sw = (px) => scaleW(vp, px, bW);
  const sh = (px) => scaleH(vp, px, bH);

  const segments = Array.isArray(params.segments) ? params.segments : [];
  const active = findActiveSub(segments, t);

  if (!active) {
    return `<div style="position:absolute;inset:0;pointer-events:none"></div>`;
  }

  const { cn, en, speaker } = active;

  // Speaker-dependent color: dario → gold, others → white
  const cnColor = (speaker && speaker.toLowerCase() === "dario") ? colors.primary : colors.text;

  const subsLeft  = sw(layout.subs.left);
  const subsRight = sw(layout.subs.right);
  const subsTop   = sh(layout.subs.top);
  const subsH     = sh(layout.subs.height);

  const cnHtml = cn
    ? `<div style="display:block;width:100%;min-width:0;max-height:${sh(102)}px;overflow:hidden;font-size:${sw(type.cnSub.size)}px;font-weight:${type.cnSub.weight};line-height:${type.cnSub.lineHeight};color:${cnColor};text-align:center;text-shadow:0 1px ${sw(8)}px rgba(0,0,0,0.4);white-space:normal;word-break:break-word;overflow-wrap:anywhere;font-family:${type.cnSub.font}">${esc(cn)}</div>`
    : "";

  const enHtml = en
    ? `<div style="display:block;width:100%;min-width:0;max-height:${sh(56)}px;overflow:hidden;font-size:${sw(type.enSub.size)}px;font-weight:${type.enSub.weight};line-height:${type.enSub.lineHeight};color:rgba(255,255,255,0.45);text-align:center;font-style:italic;white-space:normal;word-break:break-word;overflow-wrap:anywhere;font-family:${type.enSub.font}">${esc(en)}</div>`
    : "";

  return `<div style="position:absolute;inset:0;pointer-events:none;z-index:40">` +
    `<div style="position:absolute;left:${subsLeft}px;right:${subsRight}px;top:${subsTop}px;height:${subsH}px;overflow:hidden;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:${sh(10)}px">` +
    cnHtml +
    enHtml +
    `</div>` +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 1, label: "first subtitle" },
    { t: 30, label: "mid subtitle" },
    { t: 60, label: "late subtitle" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!Array.isArray(params.segments)) {
    errors.push("segments must be an array (fine.json.segments)");
  }
  return { ok: errors.length === 0, errors };
}
