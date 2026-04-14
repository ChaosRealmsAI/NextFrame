export const meta = {
  id: "subtitleBar", version: 1, ratio: "16:9", category: "overlays",
  label: "Subtitle Bar",
  description: "底部字幕条。传入 srt 数组 [{s,e,t}]，按时间显示当前字幕文字。",
  tech: "dom", duration_hint: 30, loopable: true, z_hint: "top",
  tags: ["字幕", "subtitle", "srt", "overlay", "底部"],
  mood: ["neutral"], theme: ["education", "lecture", "vlog"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { bgColor: "rgba(26,21,16,0.82)", textColor: "#f5ece0", accentColor: "#da7756" },
    "dark-minimal":   { bgColor: "rgba(0,0,0,0.72)",   textColor: "#ffffff", accentColor: "#8ab4cc" },
    "warm-gold":      { bgColor: "rgba(26,21,16,0.85)", textColor: "#d4b483", accentColor: "#da7756" },
  },
  params: {
    srt:         { type: "array",  required: true, default: [], label: "字幕数组", semantic: "array of {s,e,t} objects: s=start(s), e=end(s), t=text", group: "content" },
    bgColor:     { type: "color",  default: "rgba(26,21,16,0.82)", label: "背景色", group: "color" },
    textColor:   { type: "color",  default: "#f5ece0", label: "文字色", group: "color" },
    accentColor: { type: "color",  default: "#da7756", label: "强调色", group: "color" },
    fontSize:    { type: "number", default: 32, label: "字号(px)", group: "style", range: [18, 54], step: 2 },
    y:           { type: "number", default: 60, label: "距底部(px)", group: "style", range: [0, 300], step: 4 },
  },
  ai: {
    when: "需要字幕时使用。srt 数组由 TTS 生成或手写。",
    how: "srt 是 [{s:0, e:3, t:'文字'}] 数组。组件按绝对时间查找当前字幕（t 是 layer.start 起的相对时间）。",
    example: { srt: [{ s: 0, e: 5, t: "Hook：AI 的安检员" }, { s: 5, e: 10, t: "每次 AI 动手前先检查" }] },
    avoid: "srt 时间段不要重叠；文字太长超出屏幕宽度时会自动换行。",
    pairs_with: ["progressBar16x9", "darkGradient"],
  },
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;
  const srt = Array.isArray(p.srt) ? p.srt : [];
  const entry = srt.find((e) => t >= Number(e.s || 0) && t < Number(e.e || 0));
  const text = entry ? String(entry.t || "") : "";
  if (!text) return "";
  const fs = p.fontSize || 32;
  const y = p.y || 60;
  const maxW = vp.width - 160;
  return '<div style="position:absolute;left:0;right:0;bottom:' + y + 'px;display:flex;justify-content:center;align-items:flex-end;padding:0 80px">' +
    '<div style="background:' + p.bgColor + ';color:' + p.textColor + ';font:500 ' + fs + 'px system-ui,sans-serif;' +
    'padding:10px 28px;border-radius:6px;max-width:' + maxW + 'px;text-align:center;line-height:1.5;' +
    'border-bottom:2px solid ' + p.accentColor + '">' + text + '</div>' +
  '</div>';
}

export function screenshots() {
  return [
    { t: 1, label: "第一条字幕" },
    { t: 6, label: "第二条字幕" },
    { t: 20, label: "无字幕（空白）" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!Array.isArray(params.srt)) errors.push("srt 必须是数组。Fix: 传入 [{s,e,t}] 数组");
  if (Array.isArray(params.srt) && params.srt.length === 0) errors.push("srt 数组为空，字幕不会显示。Fix: 至少传入一条字幕");
  return { ok: errors.length === 0, errors };
}
