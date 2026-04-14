export const meta = {
  id: "demoCodeBlock",
  version: 1,
  ratio: "16:9",
  category: "typography",
  label: "Demo Code Block Terminal",
  description: "终端风代码块，逐行显示 JSON timeline 构建过程。展示 DOM 排版能力。",
  tech: "dom",
  duration_hint: 9,
  loopable: false,
  z_hint: "middle",
  tags: ["code", "terminal", "typewriter", "dom", "demo"],
  mood: ["technical", "focused"],
  theme: ["tech", "hacker", "minimal"],
  default_theme: "matrix-green",
  themes: {
    "matrix-green": { bgColor: "#0a0f0a", termBg: "rgba(0,20,0,0.9)", borderColor: "#00c853", textColor: "#a5d6a7", keyColor: "#69f0ae", valColor: "#fff9c4", punctColor: "#4fc3f7", cursorColor: "#00e676" },
    "ocean-blue":   { bgColor: "#050a14", termBg: "rgba(0,10,30,0.9)", borderColor: "#1565c0", textColor: "#bbdefb", keyColor: "#4fc3f7", valColor: "#ffe082", punctColor: "#80cbc4", cursorColor: "#29b6f6" },
    "amber-amber":  { bgColor: "#120d00", termBg: "rgba(30,15,0,0.9)", borderColor: "#ff8f00", textColor: "#ffe0b2", keyColor: "#ffb74d", valColor: "#ffffff", punctColor: "#ffcc02", cursorColor: "#ffa000" },
  },
  params: {
    bgColor:     { type: "string", default: "#0a0f0a", label: "场景背景", semantic: "overall scene background", group: "color" },
    termBg:      { type: "string", default: "rgba(0,20,0,0.9)", label: "终端背景", semantic: "terminal box background", group: "color" },
    borderColor: { type: "string", default: "#00c853", label: "边框颜色", semantic: "terminal border and decoration color", group: "color" },
    textColor:   { type: "string", default: "#a5d6a7", label: "正文颜色", semantic: "normal text inside code", group: "color" },
    keyColor:    { type: "string", default: "#69f0ae", label: "键名颜色", semantic: "JSON key color", group: "color" },
    valColor:    { type: "string", default: "#fff9c4", label: "值颜色", semantic: "JSON value string color", group: "color" },
    punctColor:  { type: "string", default: "#4fc3f7", label: "符号颜色", semantic: "JSON punctuation and number color", group: "color" },
    cursorColor: { type: "string", default: "#00e676", label: "光标颜色", semantic: "blinking cursor color", group: "color" },
    title:       { type: "string", default: "代码演示", label: "标题", semantic: "section title above terminal", group: "content" },
  },
  ai: {
    when: "需要展示代码或 JSON 内容时使用，适合技术演示场景",
    how: "叠加在深色背景上，start=21 dur=9s，逐行显示代码",
    example: { bgColor: "#0a0f0a", termBg: "rgba(0,20,0,0.9)", borderColor: "#00c853", textColor: "#a5d6a7", keyColor: "#69f0ae", valColor: "#fff9c4", punctColor: "#4fc3f7", cursorColor: "#00e676", title: "代码演示" },
    theme_guide: { "matrix-green": "黑客绿", "ocean-blue": "海洋蓝", "amber-amber": "琥珀金" },
    avoid: "不要显示超过 20 行代码，会超出可视区",
    pairs_with: ["demoBg", "demoProgress"],
  },
};

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const { bgColor, termBg, borderColor, textColor, keyColor, valColor, punctColor, cursorColor, title } = params;
  const W = vp.width, H = vp.height;

  // JSON lines to reveal progressively
  const lines = [
    { text: '{', color: punctColor },
    { text: `  <span style="color:${keyColor}">"version"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">1</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `  <span style="color:${keyColor}">"duration"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">30</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `  <span style="color:${keyColor}">"width"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">1920</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `  <span style="color:${keyColor}">"height"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">1080</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `  <span style="color:${keyColor}">"layers"</span><span style="color:${punctColor}">: [</span>`, raw: true },
    { text: `    <span style="color:${punctColor}">{</span>`, raw: true },
    { text: `      <span style="color:${keyColor}">"scene"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">"demoBg"</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `      <span style="color:${keyColor}">"start"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">0</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `      <span style="color:${keyColor}">"dur"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">30</span>`, raw: true },
    { text: `    <span style="color:${punctColor}">},</span>`, raw: true },
    { text: `    <span style="color:${punctColor}">{</span>`, raw: true },
    { text: `      <span style="color:${keyColor}">"scene"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">"demoBarSvg"</span><span style="color:${punctColor}">,</span>`, raw: true },
    { text: `      <span style="color:${keyColor}">"start"</span><span style="color:${punctColor}">:</span> <span style="color:${valColor}">0</span>`, raw: true },
    { text: `    <span style="color:${punctColor}">}</span>`, raw: true },
    { text: `  <span style="color:${punctColor}">]</span>`, raw: true },
    { text: '}', color: punctColor },
  ];

  // Reveal lines progressively: each line appears every ~0.45s, starts at t=0.5
  const totalLines = lines.length;
  const lineInterval = 0.45;
  const startDelay = 0.3;

  const visibleLines = lines.map((line, i) => {
    const showAt = startDelay + i * lineInterval;
    const p = ease3(Math.min(1, Math.max(0, (t - showAt) / 0.3)));
    return { ...line, opacity: p };
  });

  const fs = Math.round(W * 0.016);
  const lineH = Math.round(H * 0.048);
  const padH = Math.round(W * 0.025);
  const padV = Math.round(H * 0.025);
  const termW = Math.round(W * 0.65);
  const termH = Math.round(H * 0.72);
  const termLeft = Math.round((W - termW) / 2);
  const termTop = Math.round(H * 0.17);

  // Blinking cursor — use t to determine blink state (0.5s interval)
  const cursorVisible = (t % 1.0) < 0.65 ? 1 : 0;

  const linesHtml = visibleLines.map((line, i) => {
    const content = line.raw ? line.text : `<span style="color:${line.color || textColor}">${line.text}</span>`;
    return `<div style="height:${lineH}px;line-height:${lineH}px;opacity:${line.opacity.toFixed(3)};white-space:nowrap;overflow:hidden">${content}</div>`;
  }).join('');

  // Add cursor on last visible line
  const lastVisible = visibleLines.filter(l => l.opacity > 0.01).length;
  const cursorHtml = lastVisible < totalLines
    ? `<div style="display:inline-block;width:${Math.round(W * 0.009)}px;height:${Math.round(H * 0.026)}px;background:${cursorColor};vertical-align:middle;opacity:${cursorVisible}"></div>`
    : '';

  const titleFontSize = Math.round(W * 0.036);
  const titleOpacity = ease3(Math.min(1, t / 1.0));

  return `<div style="position:absolute;inset:0;width:${W}px;height:${H}px;background:${bgColor};overflow:hidden">
  <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.07)}px;text-align:center;
    color:#ffffff;font-size:${titleFontSize}px;font-weight:700;font-family:system-ui,sans-serif;
    opacity:${titleOpacity.toFixed(3)}">${title}</div>
  <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.135)}px;text-align:center;
    color:${textColor};font-size:${Math.round(W * 0.015)}px;font-family:system-ui,sans-serif;opacity:${(titleOpacity * 0.5).toFixed(3)}">
    DOM 排版渲染 — JSON Timeline 逐行构建</div>
  <div style="position:absolute;left:${termLeft}px;top:${termTop}px;width:${termW}px;height:${termH}px;
    background:${termBg};border:1.5px solid ${borderColor};border-radius:${Math.round(W * 0.008)}px;overflow:hidden">
    <div style="height:${Math.round(H * 0.04)}px;background:${borderColor}22;display:flex;align-items:center;padding:0 ${Math.round(W * 0.012)}px;gap:${Math.round(W * 0.006)}px;border-bottom:1px solid ${borderColor}44">
      <div style="width:${Math.round(W * 0.008)}px;height:${Math.round(W * 0.008)}px;border-radius:50%;background:#ef5350"></div>
      <div style="width:${Math.round(W * 0.008)}px;height:${Math.round(W * 0.008)}px;border-radius:50%;background:#ffb300"></div>
      <div style="width:${Math.round(W * 0.008)}px;height:${Math.round(W * 0.008)}px;border-radius:50%;background:#66bb6a"></div>
      <span style="color:${textColor};font-size:${Math.round(W * 0.011)}px;font-family:monospace;opacity:0.6;margin-left:auto">timeline.json</span>
    </div>
    <div style="padding:${padV}px ${padH}px;font-family:'Courier New',monospace;font-size:${fs}px;color:${textColor};overflow:hidden">
      ${linesHtml}
      ${cursorHtml}
    </div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "初始空白" },
    { t: 4, label: "代码逐行显示中" },
    { t: 8, label: "完整代码" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.title) errors.push("title 不能为空");
  return { ok: errors.length === 0, errors };
}
