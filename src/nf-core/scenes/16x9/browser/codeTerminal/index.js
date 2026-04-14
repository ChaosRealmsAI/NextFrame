export const meta = {
  id: "codeTerminal", version: 1, ratio: "16:9", category: "browser",
  label: "Code Terminal",
  description: "代码块展示，带行号和语法高亮色彩。支持逐行淡入动画，适合讲解配置/代码。",
  tech: "dom", duration_hint: 10, loopable: false, z_hint: "middle",
  tags: ["代码", "code", "terminal", "highlight", "配置"],
  mood: ["technical", "focused"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { bg: "#1e1810", border: "rgba(218,119,86,0.25)", lineNumColor: "#6b5d52", codeColor: "#f5ece0", commentColor: "#7ec699", keywordColor: "#da7756", stringColor: "#d4b483", numberColor: "#8ab4cc" },
    "dark-pro":       { bg: "#0d1117", border: "rgba(138,180,204,0.20)", lineNumColor: "#4a5568", codeColor: "#e2e8f0", commentColor: "#7ec699", keywordColor: "#8ab4cc", stringColor: "#d4b483", numberColor: "#da7756" },
  },
  params: {
    lines:       { type: "array",  required: true, default: [], label: "代码行", semantic: "array of strings, each is one line. Use special prefixes: '//' for comment style, 'k:' for keyword", group: "content" },
    title:       { type: "string", default: "", label: "标题（可选）", group: "content" },
    enterStagger:{ type: "number", default: 0.15, label: "逐行延迟(s)", group: "animation", range: [0, 1], step: 0.05 },
    enterDur:    { type: "number", default: 0.3,  label: "每行淡入时长(s)", group: "animation", range: [0.1, 1], step: 0.05 },
    bg:          { type: "color",  default: "#1e1810", label: "背景色", group: "color" },
    border:      { type: "color",  default: "rgba(218,119,86,0.25)", label: "边框色", group: "color" },
    lineNumColor:{ type: "color",  default: "#6b5d52", label: "行号颜色", group: "color" },
    codeColor:   { type: "color",  default: "#f5ece0", label: "代码颜色", group: "color" },
    commentColor:{ type: "color",  default: "#7ec699", label: "注释颜色", group: "color" },
    keywordColor:{ type: "color",  default: "#da7756", label: "关键字颜色", group: "color" },
    stringColor: { type: "color",  default: "#d4b483", label: "字符串颜色", group: "color" },
    numberColor: { type: "color",  default: "#8ab4cc", label: "数字颜色", group: "color" },
    fontSize:    { type: "number", default: 28, label: "字号(px)", group: "style", range: [14, 48], step: 2 },
    x:           { type: "number", default: 0, label: "X 偏移(px, 0=居中)", group: "style", range: [0, 1920], step: 10 },
    y:           { type: "number", default: 0, label: "Y 偏移(px, 0=居中)", group: "style", range: [0, 1080], step: 10 },
    maxWidth:    { type: "number", default: 1400, label: "最大宽度(px)", group: "style", range: [400, 1800], step: 50 },
  },
  ai: {
    when: "展示代码片段、配置文件、JSON 时使用。逐行淡入适合讲解节奏。",
    how: "lines 是字符串数组，每个元素一行。特殊前缀：'// ' 开头自动变注释色，字符串自动染色，关键字自动高亮。",
    example: {
      lines: [
        "// ~/.claude/settings.json",
        "{",
        '  "hooks": {',
        '    "PreToolUse": [',
        '      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "guard.sh" }] }',
        "    ]",
        "  }",
        "}",
      ],
      enterStagger: 0.2,
    },
    avoid: "代码行不要超过 20 行，否则字号要相应减小。不要用 tab 缩进（用空格）。",
    pairs_with: ["subtitleBar", "progressBar16x9", "darkGradient"],
  },
};

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

function colorize(line, p) {
  if (!line) return "<br>";

  // Comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return '<span style="color:' + p.commentColor + '">' + escHtml(line) + '</span>';
  }

  // Simple tokenizer: strings, numbers, keywords, rest
  let result = "";
  const KEYWORDS = ["const", "let", "var", "function", "return", "if", "else", "for", "while", "import", "export", "from", "true", "false", "null", "undefined"];
  const KEYWORD_RE = new RegExp("\\b(" + KEYWORDS.join("|") + ")\\b", "g");

  // Highlight strings first (both single and double quote)
  let i = 0;
  const chars = line;
  const segments = [];
  let cur = "";
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '"' || ch === "'") {
      if (cur) { segments.push({ type: "code", text: cur }); cur = ""; }
      let str = ch;
      i++;
      while (i < chars.length && chars[i] !== ch) {
        if (chars[i] === "\\" && i + 1 < chars.length) { str += chars[i] + chars[i + 1]; i += 2; continue; }
        str += chars[i++];
      }
      str += (chars[i] || ""); i++;
      segments.push({ type: "string", text: str });
    } else {
      cur += ch; i++;
    }
  }
  if (cur) segments.push({ type: "code", text: cur });

  for (const seg of segments) {
    if (seg.type === "string") {
      result += '<span style="color:' + p.stringColor + '">' + escHtml(seg.text) + '</span>';
    } else {
      // Numbers
      let codeHtml = escHtml(seg.text);
      codeHtml = codeHtml.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:' + p.numberColor + '">$1</span>');
      // Keywords
      codeHtml = codeHtml.replace(new RegExp("\\b(" + KEYWORDS.join("|") + ")\\b", "g"),
        '<span style="color:' + p.keywordColor + '">$1</span>');
      // JSON keys (quoted)
      codeHtml = codeHtml.replace(/&quot;([^&]+)&quot;\s*:/g,
        '<span style="color:' + p.keywordColor + '">&quot;$1&quot;</span>:');
      result += codeHtml;
    }
  }
  return result;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;
  const lines = Array.isArray(p.lines) ? p.lines : [];

  const fs = p.fontSize;
  const lineH = Math.round(fs * 1.7);
  const padV = 36;
  const padH = 48;
  const lineNumW = 52;
  const blockH = lines.length * lineH + padV * 2 + (p.title ? lineH + 16 : 0);
  const blockW = Math.min(p.maxWidth, vp.width - 120);

  const cx = p.x > 0 ? p.x : (vp.width - blockW) / 2;
  const cy = p.y > 0 ? p.y : (vp.height - blockH) / 2;

  let html = '<div style="position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + blockW + 'px;min-height:' + blockH + 'px;' +
    'background:' + p.bg + ';border:1px solid ' + p.border + ';border-radius:10px;overflow:hidden">';

  // Title bar with window control dots
  const titleOp = ease3(t / (p.enterDur || 0.3));
  const titleOpClamped = Math.max(0, Math.min(1, titleOp));
  const dotSize = Math.round(fs * 0.4);
  const dotGap = Math.round(fs * 0.28);
  html += '<div style="display:flex;align-items:center;padding:' + Math.round(padV * 0.4) + 'px ' + padH + 'px;opacity:' + titleOpClamped + '">' +
    '<span style="display:inline-block;width:' + dotSize + 'px;height:' + dotSize + 'px;border-radius:50%;background:#ff5f57;margin-right:' + dotGap + 'px"></span>' +
    '<span style="display:inline-block;width:' + dotSize + 'px;height:' + dotSize + 'px;border-radius:50%;background:#febc2e;margin-right:' + dotGap + 'px"></span>' +
    '<span style="display:inline-block;width:' + dotSize + 'px;height:' + dotSize + 'px;border-radius:50%;background:#28c840;margin-right:' + Math.round(padH * 0.5) + 'px"></span>' +
    (p.title ? '<span style="font:500 ' + (fs - 6) + 'px system-ui,sans-serif;color:' + p.lineNumColor + '">' + escHtml(p.title) + '</span>' : '') +
    '</div>';

  // Code lines
  html += '<div style="padding:' + padV + 'px 0">';
  for (let idx = 0; idx < lines.length; idx++) {
    const appearAt = idx * (p.enterStagger || 0.15);
    const op = ease3((t - appearAt) / (p.enterDur || 0.3));
    const opClamped = Math.max(0, Math.min(1, op));
    const lineContent = colorize(lines[idx], p);
    html += '<div style="display:flex;align-items:baseline;padding:0 ' + padH + 'px;height:' + lineH + 'px;opacity:' + opClamped + '">' +
      '<span style="min-width:' + lineNumW + 'px;font:400 ' + (fs - 8) + 'px \'SF Mono\',Menlo,monospace;color:' + p.lineNumColor + ';user-select:none;margin-right:20px">' + (idx + 1) + '</span>' +
      '<code style="font:400 ' + fs + 'px \'SF Mono\',Menlo,monospace;color:' + p.codeColor + ';white-space:pre;tab-size:2">' + lineContent + '</code>' +
      '</div>';
  }
  html += '</div></div>';
  return html;
}

export function screenshots() {
  return [
    { t: 0, label: "初始（无内容）" },
    { t: 1.5, label: "逐行出现中" },
    { t: 5, label: "全部显示" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!Array.isArray(params.lines)) errors.push("lines 必须是数组。Fix: 传入字符串数组");
  if (Array.isArray(params.lines) && params.lines.length === 0) errors.push("lines 为空，代码块不会显示。Fix: 至少传入一行");
  if (params.lines && params.lines.length > 25) errors.push("lines 超过 25 行，建议减小 fontSize 或拆图。");
  return { ok: errors.length === 0, errors };
}
