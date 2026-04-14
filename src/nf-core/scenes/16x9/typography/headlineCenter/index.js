import { TOKENS, esc, escAttr, easeOutCubic, fadeIn, sw16, sh16 } from '../../../shared/design.js';

// headlineCenter — 全屏居中大标题，支持内联 HTML 变色。只做标题这一件事。
export const meta = {
  id: "headlineCenter", version: 1, ratio: "16:9", category: "typography",
  label: "Headline Center",
  description: "全屏居中大标题，支持内联 HTML 变色。只做标题。",
  tech: "dom", duration_hint: 10, loopable: false, z_hint: "middle",
  tags: ["标题", "headline", "居中", "大字"],
  mood: ["impactful", "dramatic"], theme: ["tech", "education", "presentation"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { color: TOKENS.lecture.text, fontSize: 42 },
    "large": { color: TOKENS.lecture.text, fontSize: 56 },
    "subtle": { color: "rgba(245,236,224,.75)", fontSize: 36 },
  },
  params: {
    text: { type: "string", required: true, default: `给 AI 安了一个<span style='color:${escAttr(TOKENS.lecture.accent)}'>安检员</span>`, label: "标题文字", semantic: `supports inline HTML like <span style='color:${escAttr(TOKENS.lecture.accent)}'>重点</span>`, group: "content" },
    color: { type: "color", default: TOKENS.lecture.text, label: "文字色", semantic: "headline text color", group: "color" },
    fontSize: { type: "number", default: 42, label: "字号(px)", semantic: "font size", group: "style", range: [24, 72], step: 2 },
    y: { type: "number", default: 0, label: "Y偏移(px, 0=居中)", semantic: "vertical offset", group: "style", range: [0, 1080], step: 10 },
    enterDelay: { type: "number", default: 0, label: "出现延迟(s)", semantic: "fade-in delay", group: "animation", range: [0, 10], step: 0.1 },
  },
  ai: {
    when: "全屏居中一句大标题。phase 开头的主题句。",
    how: "text 支持 HTML 变色。搭配 flowDiagram 放下方。",
    example: { text: `给 AI 安了一个<span style="color:${escAttr(TOKENS.lecture.accent)}">安检员</span>` },
    theme_guide: { "anthropic-warm": "暖色", "large": "大字", "subtle": "淡化" },
    avoid: "不用于多行文字（用 titleCard）。",
    pairs_with: ["flowDiagram", "quoteBlock", "auroraGradient"],
  },
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;
  const op = fadeIn(t, p.enterDelay || 0, 0.7);
  const fs = p.fontSize || 42;
  const color = p.color || TOKENS.lecture.text;
  const maxWidth = Math.max(320, vp.width - 120);
  const posStyle = p.y > 0
    ? "position:absolute;left:60px;right:60px;top:" + p.y + "px;text-align:center;max-width:" + maxWidth + "px;margin:0 auto"
    : "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 60px";
  return '<div style="' + posStyle + '">' +
    '<div style="font:700 ' + fs + 'px Georgia,\'Noto Serif SC\',serif;color:' + color + ';text-align:center;line-height:1.3;opacity:' + op + ';max-width:' + maxWidth + 'px">' + (p.text || '') + '</div>' +
  '</div>';
}

export function screenshots() {
  return [{ t: 0, label: "透明" }, { t: 0.5, label: "淡入" }, { t: 2, label: "显示" }];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.text) errors.push("text 不能为空。Fix: 传入标题文字");
  return { ok: errors.length === 0, errors: errors };
}
