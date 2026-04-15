import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "codeTerminal",
  version: 1,
  ratio: "16:9",
  category: "data",
  label: "Code Terminal",
  description: "代码块终端展示，单 <pre> 元素，WKWebView 兼容，支持 JSON/JS/Bash 高亮",
  tech: "dom",
  duration_hint: 14,
  loopable: false,
  z_hint: "middle",
  tags: ["data", "code", "terminal"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "lecture-warm",
  themes: { "lecture-warm": {} },
  params: {
    code:     { type: "string", default: '{\n  "hooks": {}\n}', label: "代码内容", group: "content" },
    language: { type: "string", default: "json", label: "语言(json/bash/js)", group: "content" },
    title:    { type: "string", default: "~/.claude/settings.json", label: "终端标题栏", group: "content" },
    highlight:{ type: "number", default: 0, label: "高亮行号(0=不高亮)", group: "content" },
  },
  ai: {
    when: "Phase 2 代码展示段，展示配置文件或代码片段",
    how: "Add as layer: { scene: \"codeTerminal\", start: 8, dur: 14, params: { code: \"...\", title: \"...\" } }",
    example: { code: '{\n  "hooks": {\n    "PreToolUse": []\n  }\n}', title: "~/.claude/settings.json", language: "json" },
    avoid: "不要用多个 div 拼代码，只用单个 <pre>（WKWebView 兼容要求）",
    pairs_with: ["lectureChrome", "subtitleBar"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const preset = getPreset("lecture-warm");
  const { colors, layout } = preset;

  const W = vp.width;
  const H = vp.height;
  const bw = layout.baseW;
  const bh = layout.baseH;

  const code    = params.code    || '{\n  "hooks": {}\n}';
  const title   = params.title   || "~/.claude/settings.json";

  const alpha = Math.min(1, ease3(t / 0.5));

  // Layout: centered terminal window, 60% width
  const termW = Math.round(W * 0.62);
  const termH = Math.round(H * 0.72);
  const termL = Math.round((W - termW) / 2);
  const termT = Math.round((H - termH) / 2);

  const barH  = scaleH(vp, 44, bh);
  const dotSz = scaleW(vp, 12, bw);
  const dotGap = scaleW(vp, 8, bw);
  const codeSz = scaleW(vp, preset.type.code.size, bw);
  const padX  = scaleW(vp, 32, bw);
  const padY  = scaleH(vp, 20, bh);
  const titleSz = scaleW(vp, 14, bw);

  // JSON syntax coloring via simple regex replacement
  const escapedCode = esc(code);
  const highlighted = escapedCode
    .replace(/(&quot;[^&]*&quot;)(\s*:)/g, '<span style="color:#7ec8e3">$1</span>$2')
    .replace(/:\s*(&quot;[^&]*&quot;)/g, ': <span style="color:#7ec699">$1</span>')
    .replace(/:\s*(\d+)/g, ': <span style="color:#d4b483">$1</span>')
    .replace(/[{}\[\]]/g, '<span style="color:#da7756">$&</span>');

  return `<div style="position:absolute;left:${termL}px;top:${termT}px;width:${termW}px;height:${termH}px;opacity:${alpha};border-radius:${scaleW(vp, 12, bw)}px;overflow:hidden;box-shadow:0 ${scaleH(vp, 24, bh)}px ${scaleH(vp, 64, bh)}px rgba(0,0,0,0.7)">
  <!-- title bar -->
  <div style="width:100%;height:${barH}px;background:#21262d;display:flex;align-items:center;padding:0 ${padX}px;box-sizing:border-box;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="display:flex;gap:${dotGap}px;margin-right:${scaleW(vp, 16, bw)}px">
      <div style="width:${dotSz}px;height:${dotSz}px;border-radius:50%;background:#ff5f57"></div>
      <div style="width:${dotSz}px;height:${dotSz}px;border-radius:50%;background:#febc2e"></div>
      <div style="width:${dotSz}px;height:${dotSz}px;border-radius:50%;background:#28c840"></div>
    </div>
    <span style="font-family:${preset.type.code.font};font-size:${titleSz}px;color:rgba(255,255,255,0.35);flex:1;text-align:center">${esc(title)}</span>
  </div>
  <!-- code area -->
  <div style="width:100%;height:calc(100% - ${barH}px);background:${colors.codeBg};overflow:auto">
    <pre style="margin:0;padding:${padY}px ${padX}px;font-family:${preset.type.code.font};font-size:${codeSz}px;line-height:${preset.type.code.lineHeight};color:#e6edf3;white-space:pre;tab-size:2">${highlighted}</pre>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.3, label: "fade in" },
    { t: 5, label: "mid" },
    { t: 13, label: "end" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.code) errors.push("code is required");
  return { ok: errors.length === 0, errors };
}
